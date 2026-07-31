// liveClassifier.js
//
// Background confusion detector used by BOTH user_initiated and
// system_initiated. This is intentionally NOT a separate/simpler model --
// it calls the exact same trained tree-ensemble + SA-level classifier
// (predictFromGaze, from treeEnsembleClassifier.js / live_classifier_weights.json)
// that the "I'm confused" button uses on click. The only thing that
// differs between conditions is what happens once the model's threshold
// is crossed:
//   - system_initiated: allowed to auto-dispatch an intervention once its
//     cooldown has cleared ('classifier-fired'), or logs
//     'classifier-wanted-to-fire' (gated_reason: 'cooldown') if still
//     within COOLDOWN_MS of the last auto-fire.
//   - user_initiated: NEVER allowed to auto-dispatch. Every threshold
//     crossing logs 'classifier-wanted-to-fire'
//     (gated_reason: 'user_initiated_condition'). The model is instead
//     forced to produce its best guess synchronously on click, in
//     taskRunner.js's _handleConfusedClick -- a separate call into
//     predictFromGaze, but the SAME function and SAME trained weights,
//     just invoked immediately rather than waiting for the next poll.

import { sessionData } from '../experiment/session.js';
import { predictFromGaze, getDecisionThreshold } from './treeEnsembleClassifier.js';
import { SA_LEVEL_FROM_NUMERIC, SA_LEVELS } from '../experiment/interventions.js';
import { CONFIG } from '../experiment/config.js';
import { CONDITIONS } from './interventionEngine.js';

// How often we're willing to poll the trained model given incoming gaze
// samples. The model (I-VDT fixation detection + tree ensemble + SA
// classifier) is meaningfully more expensive than the old heuristic was --
// state.pending below guarantees we never let two predictFromGaze calls
// overlap, regardless of how fast gaze samples arrive.
const SAMPLE_INTERVAL_MS = 250;

// Window length is no longer hardcoded here — predictFromGaze() now reads
// the model's own weights.gaze_processing.window_ms so the background poll
// always matches what the model was trained on.

// Flat cooldown between actual auto-fires, same for every task -- not
// scaled by task length. At 15s, a 60s task can produce at most 3 actual
// fires (~15s, ~30s, ~45s), maybe a 4th around ~60-65s if the task runs
// slightly long. This only gates AUTO-firing (system_initiated); it isn't
// what limits user-initiated button clicks.
const COOLDOWN_MS = 15000;
const CONSECUTIVE_WINDOWS_TO_FIRE = 3;

// Get dynamic threshold from model weights (computed during 15s acclimation)
// Fallback to 0.75 if dynamic threshold not available
function getCurrentThreshold() {
  return getDecisionThreshold() / 100; // Convert from percentage to probability
}

// Store classifier configuration in session data for logging
// Note: threshold will be updated dynamically during execution
sessionData.classifierConfig = {
  get threshold() { return getCurrentThreshold(); },
  consecutive_windows_to_fire: CONSECUTIVE_WINDOWS_TO_FIRE,
  cooldown_ms: COOLDOWN_MS,
  sample_interval_ms: SAMPLE_INTERVAL_MS,
  threshold_source: 'dynamic_acclimation',
};

// Logs to interventionEvents (alongside intervention-decision/outcome
// records) AND to the general events log, so both actual fires and
// gated "wanted to fire" attempts are visible in the raw timeline too.
// Pairing counts of the two types per subject/task afterward gives an
// over/underfiring rate for the field deployment.
function logClassifierFiringEvent(entry) {
  const timestamp = entry.timestamp ?? Date.now();
  // Remove subject_id and ensure aoi_id is present
  const { subject_id, ...entryWithoutSubject } = entry;
  const logEntry = {
    ...entryWithoutSubject,
    aoi_id: entryWithoutSubject.aoi_id || null,
    timestamp,
  };
  sessionData.interventionEvents = sessionData.interventionEvents || [];
  sessionData.interventionEvents.push(logEntry);
  sessionData.events = sessionData.events || [];
  sessionData.events.push(logEntry);
}

function inferAoiType(aoiId) {
  const id = String(aoiId || '').toLowerCase();
  if (!id) return 'unknown';
  if (id.includes('field') || id.includes('input') || id.includes('form')) return 'form_field';
  if (id.includes('nav') || id.includes('menu') || id.includes('button') || id.includes('next')) return 'navigation';
  if (id.includes('table') || id.includes('cell')) return 'data_table_cell';
  if (id.includes('text') || id.includes('paragraph') || id.includes('content')) return 'text_content';
  if (id.includes('image') || id.includes('figure') || id.includes('diagram')) return 'diagram_or_figure';
  return 'unknown';
}

// Picks a human-readable label for which of the model's OWN 19 features
// looks most elevated -- purely for logging/debugging. It does not
// influence the confusion probability or the fire/no-fire decision;
// both come entirely from the trained tree ensemble's output.
function triggeringFeatureFromModel(features) {
  if (!features) return 'unknown';
  if (features.aoi_revisit_rate > 0.3) return 'aoi_revisit_rate';
  if (features.mouse_hesitation_index > 1.4) return 'mouse_hesitation_index';
  if (features.stationary_entropy > 0.55) return 'stationary_entropy';
  return 'fixation_rate';
}

const FALLBACK_DECISION_THRESHOLD = 0.72161939301; 
const ACCLIMATION_PERIOD_MS = 15000;

// State variables to track per-task acclimation
let currentTaskId = null;
let taskStartTime = null;
let acclimationScores = [];
let dynamicThreshold = null;

function getPercentile(arr, percentile) {
  if (arr.length === 0) return FALLBACK_DECISION_THRESHOLD;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * percentile);
  return sorted[index];
}

export function createLiveConfusionClassifier({ onFire, getSubjectId }) {
  const state = {
    lastPollAt: 0,
    pending: false,
    lastFiredAt: 0,
    lastWantedFiredAt: 0,
    consecutiveWindows: 0,
    taskStartTime: 0,
  };

  return function handleSample(payload) {
    const now = Date.now();
    if (now - state.lastPollAt < SAMPLE_INTERVAL_MS) return;
    if (state.pending) return;

    // ✅ FIX 1: Fallback to sessionData.currentTaskId if payload lacks task_id
    const taskId = payload?.task_id || sessionData.currentTaskId || null;
    if (!taskId) return;

    // Reset task start time when task changes
    if (taskId !== state.currentTaskId) {
      state.currentTaskId = taskId;
      state.taskStartTime = now;
      state.consecutiveWindows = 0;
    }

    state.lastPollAt = now;
    state.pending = true;

    predictFromGaze()
      .then((prediction) => {
        state.pending = false;
        if (!prediction) return;

        const aboveThreshold = prediction.confusion.isConfused;

        // ✅ FIX 2: Use console.log so DevTools does not filter it out
        // console.log('[LiveClassifier Poll]', {
        //   prob: prediction.confusion.probability.toFixed(3),
        //   aboveThreshold,
        //   streak: state.consecutiveWindows,
        //   secondsSinceLastWanted: Math.round((now - state.lastWantedFiredAt) / 1000) + 's',
        // });

        if (!aboveThreshold) {
          state.consecutiveWindows = 0;
          return;
        }

        // Enforce 15-second delay from task start before classifier can fire
        const timeSinceTaskStart = now - state.taskStartTime;
        if (timeSinceTaskStart < 15000) {
          return; // Not enough time elapsed since task start
        }

        state.consecutiveWindows += 1;
        if (state.consecutiveWindows < CONSECUTIVE_WINDOWS_TO_FIRE) return;

        const subjectId = typeof getSubjectId === 'function'
          ? getSubjectId()
          : (sessionData.participantId || sessionData.PROLIFIC_PID || 'participant-1');
        const aoiId = prediction.aoiId || payload?.aoi_id || null;
        const aoiType = inferAoiType(aoiId);
        const triggeringFeature = triggeringFeatureFromModel(prediction.features);
        const confidence = Math.round(prediction.confusion.probability * 100) / 100;

        const saLevel = prediction.saLevel.source === 'trained_model'
          ? SA_LEVEL_FROM_NUMERIC[prediction.saLevel.numeric]
          : SA_LEVELS.COMPREHENSION;
        const saLevelSource = prediction.saLevel.source;

        // Get current threshold (dynamic from acclimation or fallback)
        const currentThreshold = getCurrentThreshold();

        const canAutoFire = CONFIG.INTERVENTION_CONDITION === CONDITIONS.SYSTEM_INITIATED;

        // ⏱️ 15-second Cooldown Checks
        const cooledDown = now - state.lastFiredAt >= COOLDOWN_MS;
        const wantedCooledDown = now - state.lastWantedFiredAt >= COOLDOWN_MS;

        if (canAutoFire && cooledDown) {
          state.lastFiredAt = now;
          state.lastWantedFiredAt = now;
          state.consecutiveWindows = 0;

          logClassifierFiringEvent({
            type: 'classifier-fired',
            task_id: taskId,
            aoi_type: aoiType,
            aoi_id: aoiId,
            sa_level: saLevel,
            sa_level_source: saLevelSource,
            triggering_feature: triggeringFeature,
            confusion_probability: confidence,
            threshold_used: currentThreshold,
            consecutive_windows: CONSECUTIVE_WINDOWS_TO_FIRE,
            time_since_task_start_ms: timeSinceTaskStart,
            condition: CONFIG.INTERVENTION_CONDITION,
            cooldown_ms: COOLDOWN_MS,
            threshold_source: prediction.saLevel.source === 'warming_up' ? 'fallback' : 'dynamic_acclimation',
          });

          onFire?.({
            subjectId, taskId, aoiType, aoiId, saLevel, saLevelSource,
            triggeringFeature, confidence,
          });
        } else if (wantedCooledDown) {
          // ✅ FIX 3: Re-arm after COOLDOWN_MS (15s) even during continuous confusion
          state.lastWantedFiredAt = now;
          state.consecutiveWindows = 0;
          const gatedReason = !canAutoFire ? 'user_initiated_condition' : 'cooldown';

          logClassifierFiringEvent({
            type: 'classifier-wanted-to-fire',
            task_id: taskId,
            aoi_type: aoiType,
            aoi_id: aoiId,
            sa_level: saLevel,
            sa_level_source: saLevelSource,
            triggering_feature: triggeringFeature,
            confusion_probability: confidence,
            threshold_used: currentThreshold,
            consecutive_windows: CONSECUTIVE_WINDOWS_TO_FIRE,
            time_since_task_start_ms: timeSinceTaskStart,
            condition: CONFIG.INTERVENTION_CONDITION,
            cooldown_ms: COOLDOWN_MS,
            gated_reason: gatedReason,
            time_since_last_fire_ms: now - state.lastFiredAt,
            threshold_source: prediction.saLevel.source === 'warming_up' ? 'fallback' : 'dynamic_acclimation',
          });
        }
      })
      .catch((e) => {
        state.pending = false;
        console.error('[liveClassifier] predictFromGaze failed:', e);
      });
  };
}