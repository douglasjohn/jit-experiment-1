// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER WIRING
// This file does NOT implement the confusion model itself (that's your
// GBT+GP pipeline, currently Python/offline — see confusion_gp_pipeline.py).
// This is the client-side glue: whenever a confusion-fire event arrives
// (from a websocket/SSE bridge to the Python service, or from a client-side
// approximation), it packages the event and hands it to the intervention
// engine, gated by the experiment condition.
//
// TODO: replace `attachConfusionSource` internals with however firing
// events actually reach the browser in your deployment (websocket to a
// Python inference server is the most likely path given confusion_gp_pipeline.py).
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '../experiment/config.js';
import { handleConfusionEvent, reportOutcome, CONDITIONS, RESOLUTION_WINDOW_MS } from './interventionEngine.js';
import { getState } from '../experiment/state.js';
import { logEvent } from '../experiment/logger.js';
import { SA_LEVEL_FROM_NUMERIC } from '../experiment/interventions.js';

// Track in-flight decisions so we can resolve outcomes when the window closes.
const pendingOutcomes = new Map(); // key: `${subjectId}:${timestamp}` -> { event, decision, timer }

function normalizeSaLevel(saLevel) {
  if (typeof saLevel === 'string') return saLevel;
  if (saLevel != null && SA_LEVEL_FROM_NUMERIC[saLevel]) return SA_LEVEL_FROM_NUMERIC[saLevel];
  return saLevel;
}

/**
 * Call this whenever the confusion classifier fires. `payload` shape must
 * match what your classifier emits — update field names to match exactly:
 * {
 *   subjectId, aoiType, saLevel ('perception'|'comprehension'|'projection'
 *     — or numeric 1/2/3, see SA_LEVEL_FROM_NUMERIC in interventions.js),
 *   triggeringFeature (optional string, e.g. 'aoi_revisit_rate'),
 *   confidence (optional, currently only logged not branched on)
 * }
 */
export function onConfusionFired(payload) {
  const condition = CONFIG.INTERVENTION_CONDITION; // see config.js flag added below

  if (condition === CONDITIONS.NO_HELP) {
    // Data-collection-only path: log that confusion fired, render nothing.
    logEvent({
      type: 'confusion-fired-no-help',
      subject_id: payload.subjectId,
      aoi_type: payload.aoiType,
      sa_level: payload.saLevel,
      confidence: payload.confidence ?? null,
      timestamp: Date.now(),
    });
    return;
  }

  const event = {
    subjectId: payload.subjectId,
    aoiType: payload.aoiType || 'unknown',
    saLevel: normalizeSaLevel(payload.saLevel),
    triggeringFeature: payload.triggeringFeature,
    timestamp: Date.now(),
  };

  const decision = handleConfusionEvent(event, condition);
  if (decision.arm) {
    renderIntervention(decision);
  }

  // Schedule outcome resolution. Only meaningful for PERSONALIZED_HELP
  // (reportOutcome no-ops otherwise) but we compute it uniformly so the
  // logging is consistent across conditions for post-hoc analysis.
  const key = `${event.subjectId}:${event.timestamp}`;
  const timer = setTimeout(() => resolveOutcome(key), RESOLUTION_WINDOW_MS);
  pendingOutcomes.set(key, { event, decision, timer, reTriggered: false });
}

/**
 * Call this from wherever the classifier fires AGAIN, to mark any pending
 * windows for the same subject as "confusion re-triggered" (i.e. the prior
 * intervention did not resolve it). Cheap O(n) over pending outcomes is
 * fine at this scale (single subject, handful of concurrent windows).
 */
export function onConfusionReFired(payload) {
  for (const [key, entry] of pendingOutcomes) {
    if (entry.event.subjectId === payload.subjectId) {
      entry.reTriggered = true;
    }
  }
}

function resolveOutcome(key) {
  const entry = pendingOutcomes.get(key);
  if (!entry) return;
  pendingOutcomes.delete(key);

  const cognitiveLoadDelta = computeCognitiveLoadDelta(entry.event);
  reportOutcome(entry.event, entry.decision, {
    confusionResolved: !entry.reTriggered,
    cognitiveLoadDelta,
  });
}

/**
 * Scalar in [0,1]: how much post-intervention gaze/mouse behavior deviated
 * from this participant's pre-task baseline. Reuses the SAME feature
 * definitions as confusion_gp_pipeline.py (fixation_rate_per_sec,
 * mouse_hesitation, gaze_entropy) so the reward signal is grounded in the
 * same instrumentation as your confusion labels, not a separate ad hoc
 * metric.
 *
 * TODO: this needs read access to your gaze/mouse buffers (tracker/*.js).
 * Wire the actual window extraction — this is a placeholder that returns a
 * neutral 0.5 so the pipeline runs end-to-end before that wiring exists.
 * DO NOT ship to real data collection with the placeholder still in place.
 */
function computeCognitiveLoadDelta(event) {
  const state = getState();
  // Placeholder. Replace with real feature extraction over
  // [event.timestamp, event.timestamp + RESOLUTION_WINDOW_MS] vs. this
  // participant's baseline window, mirroring extract_window_features()
  // in confusion_gp_pipeline.py.
  return 0.5;
}

function renderIntervention(decision) {
  // Dispatch to your overlay renderer. UI/overlays.js is the natural home
  // for the actual DOM/visual logic per render.type.
  import('../UI/overlays.js').then(({ showIntervention }) => {
    showIntervention(decision.arm.render, decision);
  });
}