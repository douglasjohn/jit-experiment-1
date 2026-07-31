// ─────────────────────────────────────────────────────────────────────────────
// INTERVENTION ENGINE
// Single entry point for condition 2 (static_help) and condition 3
// (personalized_help). condition 1 (no_help) never calls this at all —
// gate that at the call site in classifier.js, not in here.
//
// Personalization model: Normal-Normal Thompson Sampling per
// (saLevel, armId) — NOT per (aoiType, saLevel, armId). See rationale in
// module docs below. Content selection still respects aoiType (the
// candidate arm LIST comes from interventions.js and is AOI-specific);
// only the LEARNED SELECTION STATISTICS are pooled at the SA-level.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '../experiment/config.js';
import { getArms, getStaticArm, SA_LEVELS } from '../experiment/interventions.js';
import { sessionData } from '../experiment/session.js';

export const CONDITIONS = {
  NO_HELP: 'no_help',
  STATIC_HELP: 'static_help',
  USER_INITIATED: 'user_initiated',
  SYSTEM_INITIATED: 'system_initiated',
};

// ──────────────────────────────────────────────────────────────────────────
// Reward model
// ──────────────────────────────────────────────────────────────────────────
// reward ∈ [-1, 1], composite of:
//   resolutionTerm   : +1 if confusion did NOT re-trigger within
//                       RESOLUTION_WINDOW_MS on same/downstream AOI, else -1
//   cognitiveLoadTerm: penalty proportional to how much post-intervention
//                       gaze/mouse features deviated from this participant's
//                       own pre-intervention baseline (fixation_rate,
//                       mouse_hesitation, gaze_entropy — same features your
//                       GBT/GP classifier already computes).
// reward = W_RESOLUTION * resolutionTerm - W_COGLOAD * cognitiveLoadTerm
// Tune weights empirically once you have pilot data; these are starting
// points, not settled values — log the raw components separately (below)
// so you can re-derive reward post-hoc with different weights without
// re-running the study.
const W_RESOLUTION = 0.7;
const W_COGLOAD = 0.3;
export const RESOLUTION_WINDOW_MS = 15000;

/**
 * cognitiveLoadDelta: caller supplies a pre-computed scalar in [0, 1]
 * (0 = no deviation from baseline, 1 = large deviation), derived from
 * post-intervention window features vs. this participant's rolling
 * baseline. Computing that delta is intervention/classifier.js's job
 * (it already has the feature-extraction pipeline) — this function
 * only combines the two signals into one reward.
 */
export function computeReward({ confusionResolved, cognitiveLoadDelta }) {
  const resolutionTerm = confusionResolved ? 1 : -1;
  const coglTerm = Math.max(0, Math.min(1, cognitiveLoadDelta ?? 0));
  const reward = W_RESOLUTION * resolutionTerm - W_COGLOAD * coglTerm;
  return Math.max(-1, Math.min(1, reward));
}

// ──────────────────────────────────────────────────────────────────────────
// Normal-Normal Thompson Sampling
// State per (subjectId): { [saLevel]: { [armId]: { mean, variance, n } } }
// Seeded from POPULATION_PRIOR on first touch of a given (saLevel, armId).
// ──────────────────────────────────────────────────────────────────────────

// Population prior — mean/variance per (saLevel, armId), pooled from prior
// participants. Starts flat (uninformative) until you refresh it (see
// refreshPopulationPrior below). Persisted client-side per browser session
// is NOT sufficient for a real population prior — this needs to be pulled
// from the server, which has cross-participant data. Wire the TODO below.
let POPULATION_PRIOR = {}; // { [saLevel]: { [armId]: { mean, variance } } }
const DEFAULT_PRIOR = { mean: 0, variance: 1 }; // uninformative: centered, wide

/** Call once at experiment init (see integration notes) to pull the latest
 * population posterior from the server, if you're computing one offline. */
export async function refreshPopulationPrior() {
  if (!CONFIG.DATA_ENDPOINT) return;
  try {
    const res = await fetch(`${CONFIG.DATA_ENDPOINT}/bandit-prior`);
    if (res.ok) {
      POPULATION_PRIOR = await res.json();
    }
  } catch (e) {
    // Network failure here should never block the experiment — fall back
    // to the uninformative prior silently, but log it so it's visible in QA.
    console.warn('[interventionEngine] could not fetch population prior, using flat prior', e);
  }
}

// In-memory per-subject state for this session. Not persisted beyond the
// session on purpose — see design note in the message accompanying this
// file about cold-start-per-subject.
const subjectState = {}; // { [subjectId]: { [saLevel]: { [armId]: {mean,variance,n} } } }

function getArmState(subjectId, saLevel, armId) {
  subjectState[subjectId] ??= {};
  subjectState[subjectId][saLevel] ??= {};
  if (!subjectState[subjectId][saLevel][armId]) {
    const prior = getPrior(saLevel, armId);
    subjectState[subjectId][saLevel][armId] = { mean: prior.mean, variance: prior.variance, n: 0 };
  }
  return subjectState[subjectId][saLevel][armId];
}

// Box-Muller for a standard normal sample (no external deps, npm-friendly).
function sampleStandardNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function thompsonSample(state) {
  const std = Math.sqrt(Math.max(state.variance, 1e-6));
  return state.mean + sampleStandardNormal() * std;
}

/**
 * Select an arm for PERSONALIZED_HELP. Content candidates come from
 * interventions.js and ARE task-specific; the learned mean/variance used
 * to rank them is keyed by saLevel only (see module docstring).
 */
export function selectPersonalizedArm(subjectId, taskId, saLevel, aoiId = null) {
  const candidates = getArms(taskId, saLevel, aoiId);
  let best = null;
  let bestSample = -Infinity;
  for (const c of candidates) {
    const state = getArmState(subjectId, saLevel, c.armId);
    const sample = thompsonSample(state);
    if (sample > bestSample) {
      bestSample = sample;
      best = c;
    }
  }
  return best;
}

/**
 * Serializes this subject's learned bandit state — both the content-arm
 * bandit (system_initiated) and the SA-level second-opinion bandit
 * (user_initiated) — for saving with session data. Aggregating many
 * subjects' exports offline/server-side is what produces the
 * POPULATION_PRIOR consumed by refreshPopulationPrior() on future runs.
 */
export function exportBanditState(subjectId) {
  const state = subjectState[subjectId];
  if (!state) return {};
  return JSON.parse(JSON.stringify(state)); // defensive clone
}


// ──────────────────────────────────────────────────────────────────────────
// SA-LEVEL SECOND OPINION (user_initiated only)
// A separate, disjoint bandit namespace from the content-arm bandit above:
// three "arms" corresponding to the SA levels themselves, keyed PER TASK
// (bucket = "__sa_level_selector__:<taskId>") so the empirical base-rate
// prior below can be task-specific, and so learning on one task's SA
// distribution doesn't bleed into another's.
// ──────────────────────────────────────────────────────────────────────────
const SA_LEVEL_SELECTOR_BUCKET = '__sa_level_selector__';
const SA_LEVEL_CANDIDATES = [SA_LEVELS.PERCEPTION, SA_LEVELS.COMPREHENSION, SA_LEVELS.PROJECTION];
// Classifier trust decays as this subject/task bucket accumulates real
// outcomes. At n=0 (first click ever on this task for this subject) the
// classifier's vote can be up to CLASSIFIER_VOTE_WEIGHT_MAX — large enough
// to override the task-level cold-start prior on its own. As n grows the
// weight relaxes toward CLASSIFIER_VOTE_WEIGHT_FLOOR, so the bandit's own
// learned, subject-specific evidence gets to matter once there's enough
// of it. HALF_LIFE_N is the n at which the weight has decayed halfway
// from max to floor — tune once you see how fast bandit means move in
// pilot data.
const CLASSIFIER_VOTE_WEIGHT_MAX = 3.0;
const CLASSIFIER_VOTE_WEIGHT_FLOOR = 0.4;
const CLASSIFIER_VOTE_HALF_LIFE_N = 4;

function classifierVoteWeight(totalObservations) {
  const decay = CLASSIFIER_VOTE_HALF_LIFE_N / (CLASSIFIER_VOTE_HALF_LIFE_N + totalObservations);
  return CLASSIFIER_VOTE_WEIGHT_FLOOR + (CLASSIFIER_VOTE_WEIGHT_MAX - CLASSIFIER_VOTE_WEIGHT_FLOOR) * decay;
}
// ──────────────────────────────────────────────────────────────────────────
// Empirical (taskId -> saLevel counts) from prior static_help / pilot runs.
// Used ONLY to seed the SA-level bandit's cold-start prior — this is a
// base-rate prior (Bayesian sense), distinct from CLASSIFIER_VOTE_WEIGHT,
// which is about how much to trust the live per-click classifier signal
// relative to the bandit's learned signal (a separate calibration
// question — see notes on that below). Overridden automatically by
// POPULATION_PRIOR once the server starts serving real aggregated
// posteriors (see getPrior).
// ──────────────────────────────────────────────────────────────────────────
const TASK_SA_LEVEL_PILOT_COUNTS = {
  'ambiguous-form':        { 1: 109, 2: 464,  3: 0 },
  'broken-nav':            { 1: 76,  2: 35,   3: 133 },
  'data-table':            { 1: 0,   2: 140,  3: 93 },
  'instruction-following': { 1: 111, 2: 58,   3: 0 },
  'math-problem':          { 1: 110, 2: 418,  3: 145 },
  'reading-inference':     { 1: 551, 2: 1149, 3: 142 },
  'visual-search':         { 1: 153, 2: 526,  3: 88 },
};

// Lower variance = the prior is trusted more strongly, so it takes more
// of this subject's own click outcomes to move the estimate away from the
// population base rate. 0.5 is a starting point (tighter than the flat
// uninformative default of 1) — tune once you have outcome data to see
// how fast in-session evidence should actually override it.
const TASK_PRIOR_VARIANCE = 0.5;

function computeTaskSaLevelPrior(taskId) {
  const counts = TASK_SA_LEVEL_PILOT_COUNTS[taskId];
  if (!counts) return null;
  const total = counts[1] + counts[2] + counts[3];
  if (total === 0) return null;
  const prior = {};
  SA_LEVEL_CANDIDATES.forEach((level, i) => {
    const share = counts[i + 1] / total;
    // Center at 0 for a uniform 1/3 share; a dominant class (e.g. 81%)
    // lands at a clearly-preferred positive mean, a near-zero class lands
    // clearly negative. Scale factor (3) is a starting point, not derived.
    prior[level] = { mean: (share - 1 / 3) * 3, variance: TASK_PRIOR_VARIANCE };
  });
  return prior;
}

function getPrior(saLevel, armId) {
  const fromPopulation = POPULATION_PRIOR?.[saLevel]?.[armId];
  if (fromPopulation) return fromPopulation;

  // SA-level second-opinion buckets carry a task-specific empirical prior
  // until the server starts serving a real aggregated one.
  if (typeof saLevel === 'string' && saLevel.startsWith(SA_LEVEL_SELECTOR_BUCKET)) {
    const taskId = saLevel.slice(SA_LEVEL_SELECTOR_BUCKET.length + 1);
    const taskPrior = computeTaskSaLevelPrior(taskId);
    if (taskPrior?.[armId]) return taskPrior[armId];
  }

  return DEFAULT_PRIOR;
}

/**
 * Blends the live classifier's SA-level guess (from the confused button's
 * gaze/mouse features) with a per-subject learned preference over SA
 * levels. Returns the level to actually use, plus diagnostics for logging.
 *
 * If CONFIG.USER_INITIATED_BANDIT_ENABLED is false, this is a pass-through
 * — the classifier's guess is returned unchanged and no bandit state is
 * touched, so user_initiated behaves as "static-help mentality (I'll ask)
 * + targeted classifier, no learning."
 */
export function selectSaLevelSecondOpinion(subjectId, taskId, classifierSaLevel, classifierConfidence = 0.5) {
  if (!CONFIG.USER_INITIATED_BANDIT_ENABLED) {
    return { saLevel: classifierSaLevel, usedBandit: false, votes: null };
  }

  const bucket = `${SA_LEVEL_SELECTOR_BUCKET}:${taskId}`;
  // First pass: pull each candidate's state so we know how much evidence
  // this bucket actually has before deciding how much to trust the
  // classifier this time.
  const states = {};
  let totalObservations = 0;
  for (const candidate of SA_LEVEL_CANDIDATES) {
    const state = getArmState(subjectId, bucket, candidate);
    states[candidate] = state;
    totalObservations += state.n;
  }

  const voteWeight = classifierVoteWeight(totalObservations);
  const classifierVote = (classifierConfidence - 0.5) * 2 * voteWeight;

  let best = classifierSaLevel;
  let bestScore = -Infinity;
  const votes = {};

  for (const candidate of SA_LEVEL_CANDIDATES) {
    const state = states[candidate];
    const banditSample = thompsonSample(state);
    const score = banditSample + (candidate === classifierSaLevel ? classifierVote : 0);
    votes[candidate] = { banditSample, score, priorMean: state.mean };
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return { saLevel: best, usedBandit: true, votes, bucket, classifierVoteWeight: voteWeight, totalObservations };
}

/** Feed the outcome of a user_initiated intervention back into the
 * SA-level bandit. No-op if the bandit is disabled via config. */
export function recordSaLevelOutcome(subjectId, taskId, chosenSaLevel, reward) {
  if (!CONFIG.USER_INITIATED_BANDIT_ENABLED) return;
  const bucket = `${SA_LEVEL_SELECTOR_BUCKET}:${taskId}`;
  recordReward(subjectId, bucket, chosenSaLevel, reward);
}

/** Online Bayesian update (known-variance-ish approximation via simple
 * running mean/variance shrinkage — adequate for a proof of concept;
 * revisit with a proper conjugate update once you have real variance
 * estimates from pilot data). */
export function recordReward(subjectId, saLevel, armId, reward) {
  const state = getArmState(subjectId, saLevel, armId);
  const n = state.n + 1;
  const learningRate = 1 / n; // decreasing step size ~ recency-weighted mean
  const newMean = state.mean + learningRate * (reward - state.mean);
  // shrink variance toward a floor as observations accumulate, so the
  // bandit gets more confident (exploits more) over the session
  const newVariance = Math.max(0.05, state.variance * 0.9);
  subjectState[subjectId][saLevel][armId] = { mean: newMean, variance: newVariance, n };
}

// ──────────────────────────────────────────────────────────────────────────
// THE SINGLE ENTRY POINT
// ──────────────────────────────────────────────────────────────────────────

/**
 * @param {object} event - { subjectId, taskId, aoiType, saLevel, triggeringFeature, timestamp, aoiId }
 * @param {string} condition - one of CONDITIONS (read from CONFIG, not hardcoded)
 * @returns {object|null} decision { condition, arm, taskId, aoiType, saLevel } or null for NO_HELP
 */
export function handleConfusionEvent(event, condition) {
  if (!Object.values(CONDITIONS).includes(condition)) {
    throw new Error(`Unknown intervention condition "${condition}". Must be one of ${Object.values(CONDITIONS).join(', ')}`);
  }

  let arm = null;
  let selectedAoiId = event.aoiId;
  
  if (condition === CONDITIONS.STATIC_HELP) {
    arm = getStaticArm(event.taskId, event.saLevel, event.aoiId);
  } else if (condition === CONDITIONS.USER_INITIATED || condition === CONDITIONS.SYSTEM_INITIATED) {
    const arms = getArms(event.taskId, event.saLevel, event.aoiId);
    const isAoiSpecific = arms.length > 0 && arms[0].armId.startsWith('sa-');
    
    if (isAoiSpecific) {
      // Both user_initiated and system_initiated pick among AOI-specific
      // candidate variants via the bandit. user_initiated relies on the
      // classifier's live confidence to pick saLevel/aoiId (i.e. "did the
      // user ask AND does the model agree something is wrong here"), then
      // hands the *which wording* decision to the same bandit machinery
      // system_initiated uses, so both conditions learn from the same
      // per-subject posterior.
      if (condition === CONDITIONS.USER_INITIATED) {
        // The bandit already had its say upstream, on WHICH SA level to
        // use (selectSaLevelSecondOpinion, called from taskRunner.js
        // before this event was fired). Content within a level is fixed —
        // identical to static_help — so take it directly.
        arm = arms[0];
        if (arm.randomAoiSelection) {
          selectedAoiId = arm.selectedAoiId;
        }
      } else {
        arm = selectPersonalizedArm(event.subjectId, event.taskId, event.saLevel, event.aoiId);
        if (arm && arm.randomAoiSelection) {
          selectedAoiId = arm.selectedAoiId;
        }
      }
    } else {
      arm = selectPersonalizedArm(event.subjectId, event.taskId, event.saLevel, event.aoiId);
    }
  }
  // CONDITIONS.NO_HELP -> arm stays null, nothing rendered.

  // Filter out contextually inappropriate interventions
  arm = filterContextuallyInappropriateArms(arm, event);

  const decision = {
    condition,
    arm,
    taskId: event.taskId,
    aoiType: event.aoiType || null,
    aoiId: selectedAoiId || null, // Use the selected AOI ID (may be randomly chosen)
    saLevel: event.saLevel,
    triggeringFeature: event.triggeringFeature ?? null,
    timestamp: event.timestamp ?? Date.now(),
  };

  sessionData.interventionEvents = sessionData.interventionEvents || [];
  sessionData.interventionEvents.push({
    type: 'intervention-decision-engine',
    condition,
    task_id: event.taskId,
    aoi_id: selectedAoiId || null,
    aoi_type: event.aoiType || null,
    sa_level: event.saLevel,
    arm_id: arm ? arm.armId : null,
    arm_family: arm ? arm.family : null,
    timestamp: decision.timestamp,
  });

  return decision;
}

/**
 * Filter out interventions that don't make sense in the current context.
 * For example, don't show "field needs to be filled" if the field is already filled.
 */
function filterContextuallyInappropriateArms(arm, event) {
  if (!arm) return null;
  
  // Check for form fields with "needs to be filled" type messages
  if (event.aoiType === 'form_field' && event.aoiId) {
    const text = arm.render?.payload?.text || '';
    const needsFillingPhrases = ['needs to be filled', 'haven\'t filled', 'needs an answer', 'must be filled'];
    
    if (needsFillingPhrases.some(phrase => text.toLowerCase().includes(phrase))) {
      // Check if the field is actually filled
      const fieldElement = document.querySelector(`[data-aoi="${event.aoiId}"]`) ||
                         document.getElementById(event.aoiId) ||
                         document.querySelector(`#${event.aoiId}`);
      
      if (fieldElement) {
        const input = fieldElement.querySelector('input, select, textarea');
        if (input && input.value && input.value.trim() !== '') {
          // Field is filled, return null to skip this intervention
          console.log('[intervention] Skipped "needs filling" intervention for filled field:', event.aoiId);
          return null;
        }
      }
    }
  }
  
  return arm;
}

/**
 * Call once the outcome is known (confusion re-triggered or not within
 * RESOLUTION_WINDOW_MS, plus cognitive load delta). No-op for conditions
 * other than PERSONALIZED_HELP — safe to call unconditionally from the
 * caller so it doesn't need to branch on condition itself.
 */
export function reportOutcome(event, decision, { confusionResolved, cognitiveLoadDelta }) {
  if (!decision.arm) return;
  // Both interactive conditions learn. static_help/no_help never reach here
  // (classifier.js only opens a pending-outcome window for these two).
  if (decision.condition !== CONDITIONS.SYSTEM_INITIATED && decision.condition !== CONDITIONS.USER_INITIATED) return;

  const reward = computeReward({ confusionResolved, cognitiveLoadDelta });
  if (decision.condition === CONDITIONS.USER_INITIATED) {
    // Feed the SA-level bandit, not a content-arm bandit — content within
    // a level never varies for user_initiated.
    recordSaLevelOutcome(event.subjectId, event.taskId, event.saLevel, reward);
  } else {
    recordReward(event.subjectId, event.saLevel, decision.arm.armId, reward);
  }

  sessionData.interventionEvents = sessionData.interventionEvents || [];
  sessionData.interventionEvents.push({
    type: 'intervention-outcome-engine',
    condition: decision.condition,
    task_id: event.taskId,
    aoi_id: decision.aoiId || null,
    aoi_type: event.aoiType,
    sa_level: event.saLevel,
    arm_id: decision.arm.armId,
    arm_family: decision.arm.family,
    reward,
    confusion_resolved: confusionResolved,
    cognitive_load_delta: cognitiveLoadDelta,
    timestamp: Date.now(),
  });
}
