// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER WIRING
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '../experiment/config.js';
import { handleConfusionEvent, reportOutcome, CONDITIONS, RESOLUTION_WINDOW_MS } from './interventionEngine.js';
import { getState } from '../experiment/state.js';
import { sessionData } from '../experiment/session.js';
import { SA_LEVEL_FROM_NUMERIC } from '../experiment/interventions.js';

const pendingOutcomes = new Map();

function logInterventionEvent(entry) {
  sessionData.interventionEvents = sessionData.interventionEvents || [];
  sessionData.interventionEvents.push({ ...entry, timestamp: entry.timestamp ?? Date.now() });
}

function normalizeSaLevel(saLevel) {
  if (typeof saLevel === 'string') return saLevel;
  if (saLevel != null && SA_LEVEL_FROM_NUMERIC[saLevel]) return SA_LEVEL_FROM_NUMERIC[saLevel];
  return saLevel;
}

export function onConfusionFired(payload) {
  const condition = CONFIG.INTERVENTION_CONDITION;

  if (condition === CONDITIONS.NO_HELP) {
    logInterventionEvent({
      type: 'confusion-fired-no-help',
      subject_id: payload.subjectId,
      aoi_type: payload.aoiType,
      sa_level: normalizeSaLevel(payload.saLevel),
      confidence: payload.confidence ?? null,
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

  logInterventionEvent({
    type: 'intervention-decision',
    subject_id: event.subjectId,
    condition,
    aoi_type: event.aoiType,
    sa_level: event.saLevel,
    arm_id: decision.arm ? decision.arm.armId : null,
    arm_family: decision.arm ? decision.arm.family : null,
    triggering_feature: event.triggeringFeature ?? null,
    timestamp: event.timestamp,
  });

  if (decision.arm) {
    renderIntervention(decision);
  }

  const key = `${event.subjectId}:${event.timestamp}`;
  const timer = setTimeout(() => resolveOutcome(key), RESOLUTION_WINDOW_MS);
  pendingOutcomes.set(key, { event, decision, timer, reTriggered: false });
}

export function onConfusionReFired(payload) {
  for (const [, entry] of pendingOutcomes) {
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
  const outcome = reportOutcome(entry.event, entry.decision, {
    confusionResolved: !entry.reTriggered,
    cognitiveLoadDelta,
  });

  logInterventionEvent({
    type: 'intervention-outcome',
    subject_id: entry.event.subjectId,
    sa_level: entry.event.saLevel,
    arm_id: entry.decision.arm ? entry.decision.arm.armId : null,
    confusion_resolved: !entry.reTriggered,
    cognitive_load_delta: cognitiveLoadDelta,
  });
}

// TODO: placeholder — wire real feature extraction from gazeManager buffers
// before running real data collection with personalized_help. See notes
// from the previous message; DO NOT ship with this constant in place.
function computeCognitiveLoadDelta(event) {
  return 0.5;
}

function renderIntervention(decision) {
  import('../UI/overlays.js')
    .then(({ showIntervention }) => showIntervention(decision.arm.render, decision))
    .catch((e) => console.error('[classifier] failed to render intervention:', e));
}