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
import { getArms, getStaticArm } from '../experiment/interventions.js';
import { sessionData } from '../experiment/session.js';

export const CONDITIONS = {
  NO_HELP: 'no_help',
  STATIC_HELP: 'static_help',
  PERSONALIZED_HELP: 'personalized_help',
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

function getPrior(saLevel, armId) {
  return POPULATION_PRIOR?.[saLevel]?.[armId] ?? DEFAULT_PRIOR;
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
 * interventions.js and ARE aoi-specific; the learned mean/variance used
 * to rank them is keyed by saLevel only (see module docstring).
 */
export function selectPersonalizedArm(subjectId, aoiType, saLevel) {
  const candidates = getArms(aoiType, saLevel);
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
 * @param {object} event - { subjectId, aoiType, saLevel, triggeringFeature, timestamp }
 * @param {string} condition - one of CONDITIONS (read from CONFIG, not hardcoded)
 * @returns {object|null} decision { condition, arm, aoiType, saLevel } or null for NO_HELP
 */
export function handleConfusionEvent(event, condition) {
  if (!Object.values(CONDITIONS).includes(condition)) {
    throw new Error(`Unknown intervention condition "${condition}". Must be one of ${Object.values(CONDITIONS).join(', ')}`);
  }

  let arm = null;
  if (condition === CONDITIONS.STATIC_HELP) {
    arm = getStaticArm(event.aoiType, event.saLevel);
  } else if (condition === CONDITIONS.PERSONALIZED_HELP) {
    arm = selectPersonalizedArm(event.subjectId, event.aoiType, event.saLevel);
  }
  // CONDITIONS.NO_HELP -> arm stays null, nothing rendered.

  const decision = {
    condition,
    arm,
    aoiType: event.aoiType,
    saLevel: event.saLevel,
    triggeringFeature: event.triggeringFeature ?? null,
    timestamp: event.timestamp ?? Date.now(),
  };

  sessionData.interventionEvents = sessionData.interventionEvents || [];
  sessionData.interventionEvents.push({
    type: 'intervention-decision-engine',
    subject_id: event.subjectId,
    condition,
    aoi_type: event.aoiType,
    sa_level: event.saLevel,
    arm_id: arm ? arm.armId : null,
    arm_family: arm ? arm.family : null,
    timestamp: decision.timestamp,
  });

  return decision;
}

/**
 * Call once the outcome is known (confusion re-triggered or not within
 * RESOLUTION_WINDOW_MS, plus cognitive load delta). No-op for conditions
 * other than PERSONALIZED_HELP — safe to call unconditionally from the
 * caller so it doesn't need to branch on condition itself.
 */
export function reportOutcome(event, decision, { confusionResolved, cognitiveLoadDelta }) {
  if (decision.condition !== CONDITIONS.PERSONALIZED_HELP || !decision.arm) return;
  const reward = computeReward({ confusionResolved, cognitiveLoadDelta });
  recordReward(event.subjectId, event.saLevel, decision.arm.armId, reward);

  sessionData.interventionEvents = sessionData.interventionEvents || [];
  sessionData.interventionEvents.push({
    type: 'intervention-decision-engine',
    subject_id: event.subjectId,
    condition,
    aoi_type: event.aoiType,
    sa_level: event.saLevel,
    arm_id: arm ? arm.armId : null,
    arm_family: arm ? arm.family : null,
    timestamp: decision.timestamp,
  });
}