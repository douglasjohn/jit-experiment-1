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

  // Only track outcomes for system_initiated (personalized learning)
  if (condition === CONDITIONS.SYSTEM_INITIATED) {
    const key = `${event.subjectId}:${event.timestamp}`;
    const timer = setTimeout(() => resolveOutcome(key), RESOLUTION_WINDOW_MS);
    pendingOutcomes.set(key, { event, decision, timer, reTriggered: false });
  }
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
    .then(({ showIntervention }) => {
      // Get current task ID from sessionData
      const taskId = sessionData.currentTaskId || null;
      // Calculate position based on the specific AOI element
      const position = _calculateAoiPosition(decision.aoiType, taskId, decision.aoiId);
      
      console.log('[intervention] Rendering - SA Level:', decision.saLevel, 
                  'AOI Type:', decision.aoiType, 'AOI ID:', decision.aoiId,
                  'Arm ID:', decision.arm?.armId, 'Position:', position);
      
      showIntervention(decision.arm.render, decision, position);
    })
    .catch((e) => console.error('[classifier] failed to render intervention:', e));
}

function _calculateAoiPosition(aoiType, taskId, aoiId) {
  // If we have a specific AOI ID, try to find that exact element
  if (aoiId) {
    const aoiElement = document.querySelector(`[data-aoi="${aoiId}"]`) || 
                       document.getElementById(aoiId) ||
                       document.querySelector(`#${aoiId}`);
    
    if (aoiElement) {
      const rect = aoiElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate position next to the element
      let left = rect.right + 10;
      let top = rect.top;
      
      // Ensure intervention stays within viewport bounds
      // If it would go off the right edge, place it on the left instead
      if (left + 300 > viewportWidth) {
        left = rect.left - 310;
      }
      
      // Ensure it doesn't go off the left edge
      if (left < 10) {
        left = 10;
      }
      
      // Ensure it doesn't go off the bottom edge
      if (top + 100 > viewportHeight) {
        top = viewportHeight - 110;
      }
      
      // Ensure it doesn't go off the top edge
      if (top < 24) {
        top = 24;
      }
      
      console.log('[positioning] AOI element found at:', rect, 'Positioned at:', { left, top });
      
      return {
        top: `${top}px`,
        left: `${left}px`,
        transform: 'none'
      };
    } else {
      console.log('[positioning] AOI element not found for ID:', aoiId);
    }
  }
  
  // Fallback: Map tasks to their key elements for positioning
  const taskSelectors = {
    'broken-nav': ['#task-stimulus', 'footer', '.footer'],
    'ambiguous-form': ['#task-stimulus', 'form', 'input[type="text"]'],
    'data-table': ['#task-stimulus', 'table', '.table'],
    'visual-search': ['#task-stimulus', 'svg', 'canvas'],
    'reading-inference': ['#task-stimulus', '.passage', 'p'],
    'math-problem': ['#task-stimulus', '.problem', 'p'],
    'instruction-following': ['#task-stimulus', '#if-tabs', 'button[data-tab]'],
    'error-diagnosis': ['#task-stimulus', '.passage', 'p'],
  };
  
  const selectors = taskSelectors[taskId] || ['#task-stimulus'];
  
  // Try each selector until we find an element
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const rect = element.getBoundingClientRect();
      // Position the intervention near the element
      console.log('[positioning] Using fallback selector:', selector, 'at:', rect);
      return {
        top: `${Math.max(24, rect.top - 60)}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)'
      };
    }
  }
  
  console.log('[positioning] No element found, using default center position');
  // Fallback to default center position if no element found
  return {
    top: '24px',
    left: '50%',
    transform: 'translateX(-50%)'
  };
}