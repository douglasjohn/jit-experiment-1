// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER WIRING
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '../experiment/config.js';
import { handleConfusionEvent, reportOutcome, CONDITIONS, RESOLUTION_WINDOW_MS } from './interventionEngine.js';
import { getState } from '../experiment/state.js';
import { sessionData } from '../experiment/session.js';
import { SA_LEVEL_FROM_NUMERIC } from '../experiment/interventions.js';
import { computeLiveFeatures } from './treeEnsembleClassifier.js';

const pendingOutcomes = new Map();

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

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
    taskId: payload.taskId || sessionData.currentTaskId || null,
    aoiType: payload.aoiType || 'unknown',
    aoiId: payload.aoiId || null,
    saLevel: normalizeSaLevel(payload.saLevel),
    triggeringFeature: payload.triggeringFeature,
    timestamp: Date.now(),
    saProbabilities: payload.saProbabilities,
  };

  const decision = handleConfusionEvent(event, condition);

  logInterventionEvent({
    type: 'intervention-decision',
    condition,
    aoi_id: event.aoiId || null,
    aoi_type: event.aoiType,
    sa_level: event.saLevel,
    sa_probabilities: payload.saProbabilities,
    arm_id: decision.arm ? decision.arm.armId : null,
    arm_family: decision.arm ? decision.arm.family : null,
    triggering_feature: event.triggeringFeature ?? null,
    timestamp: event.timestamp,
  });

  if (decision.arm) {
    renderIntervention(decision);
  } else {
    _reenableConfusedButton();
  }

  // Track outcomes for both bandit-driven conditions so both learn.
  if (condition === CONDITIONS.SYSTEM_INITIATED || condition === CONDITIONS.USER_INITIATED) {
    const key = `${event.subjectId}:${event.timestamp}`;
    // Capture this subject's own feature snapshot right now, BEFORE the
    // intervention has had any chance to change behavior. This is the
    // "pre-intervention baseline" the reward term compares against — per
    // subject, per trigger, not a global population baseline.
    const baselineFeatures = computeLiveFeatures(5000);
    const timer = setTimeout(() => resolveOutcome(key), RESOLUTION_WINDOW_MS);
    pendingOutcomes.set(key, { event, decision, timer, reTriggered: false, baselineFeatures });
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

  const postFeatures = computeLiveFeatures(5000);
  const cognitiveLoadDelta = computeCognitiveLoadDelta(entry.baselineFeatures, postFeatures);
  const outcome = reportOutcome(entry.event, entry.decision, {
    confusionResolved: !entry.reTriggered,
    cognitiveLoadDelta,
  });

  logInterventionEvent({
    type: 'intervention-outcome',
    aoi_id: entry.decision.aoiId || null,
    sa_level: entry.event.saLevel,
    arm_id: entry.decision.arm ? entry.decision.arm.armId : null,
    confusion_resolved: !entry.reTriggered,
    cognitive_load_delta: cognitiveLoadDelta,
    baseline_features: entry.baselineFeatures,
    post_features: postFeatures,
  });
}

// Features chosen to mirror the reward model's stated intent (fixation
// rate, mouse hesitation, gaze entropy). `scale` is a rough normalizer —
// NOT empirically calibrated yet. Once you have enough
// intervention-outcome logs, replace these with per-feature standard
// deviations pooled across subjects (or per-subject, if you want a
// truly personalized notion of "unusual for this person") instead of
// guessed constants.
const COGLOAD_FEATURES = ['fixation_rate', 'mouse_hesitation_index', 'stationary_entropy'];
const COGLOAD_FEATURE_SCALE = { fixation_rate: 3, mouse_hesitation_index: 5, stationary_entropy: 3 };

function computeCognitiveLoadDelta(baselineFeatures, postFeatures) {
  // Insufficient data on either side (e.g. gaze dropped out) — neutral,
  // not zero, so a bad reading doesn't masquerade as "no cognitive load
  // change" and doesn't masquerade as "resolved perfectly" either.
  if (!baselineFeatures || !postFeatures) return 0.5;

  let total = 0;
  for (const key of COGLOAD_FEATURES) {
    const base = baselineFeatures[key] ?? 0;
    const post = postFeatures[key] ?? 0;
    const scale = COGLOAD_FEATURE_SCALE[key] || 1;
    total += clamp(Math.abs(post - base) / (Math.abs(base) + scale), 0, 1);
  }
  return total / COGLOAD_FEATURES.length;
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
      
      // Cooldown: keep the button disabled for the full duration the
      // intervention is on screen, re-enable exactly when it's dismissed
      // (timeout for toasts/cues, explicit click for modals).
      showIntervention(decision.arm.render, decision, position, _reenableConfusedButton);
    })
    .catch((e) => {
      console.error('[classifier] failed to render intervention:', e);
      _reenableConfusedButton();
    });
}

function _reenableConfusedButton() {
  const btn = document.getElementById('confused-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
}

function _calculateAoiPosition(aoiType, taskId, aoiId) {
  console.log('[positioning] Calculating position for AOI:', aoiId, 'Task:', taskId, 'Type:', aoiType);
  
  // If we have a specific AOI ID, try to find that exact element
  if (aoiId) {
    // Try multiple selector strategies to find the AOI element
    const aoiElement = document.querySelector(`[data-aoi="${aoiId}"]`) || 
                       document.getElementById(aoiId) ||
                       document.querySelector(`#${aoiId}`) ||
                       document.querySelector(`[id="${aoiId}"]`);
    
    if (aoiElement) {
      const rect = aoiElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      console.log('[positioning] AOI element found at:', rect);
      
      let left, top;
      
      // For broken-nav task, position directly on/near the AOI since there are no question mark icons
      if (taskId === 'broken-nav') {
        // Position the intervention to appear on screen near the AOI
        // Try to place it to the right first, then above if no space
        if (rect.right + 280 < viewportWidth) {
          left = rect.right + 10;
          top = rect.top;
        } else if (rect.top - 100 > 0) {
          left = rect.left;
          top = rect.top - 90;
        } else {
          left = rect.left;
          top = rect.bottom + 10;
        }
      } else {
        // For other tasks, position where the question mark icon would be
        // The question mark icon is positioned to the right of the AOI element
        left = rect.right + 8; // Same spacing as the hamburger button
        top = rect.top;
        
        // For SVG elements (like in visual-search), the positioning is different
        if (aoiElement.tagName === 'svg' || aoiElement.closest('svg')) {
          // For SVG elements, the question mark is positioned using foreignObject
          const svgElement = aoiElement.tagName === 'svg' ? aoiElement : aoiElement.closest('svg');
          const svgRect = svgElement.getBoundingClientRect();
          
          // Try to find if this element has specific positioning data
          const bbox = aoiElement.getBBox ? aoiElement.getBBox() : null;
          if (bbox) {
            // Calculate position similar to generateSvgAoiHamburgerButton
            left = Math.min(bbox.x + bbox.width + 12, 760);
            top = Math.max(bbox.y - 14, 4);
            
            // Convert SVG coordinates to screen coordinates
            const screenX = svgRect.left + left;
            const screenY = svgRect.top + top;
            
            left = screenX;
            top = screenY;
          } else {
            left = rect.right + 8;
            top = rect.top;
          }
        }
      }
      
      // Ensure intervention stays within viewport bounds
      if (left + 300 > viewportWidth) {
        left = rect.left - 310;
      }
      
      if (left < 10) {
        left = 10;
      }
      
      if (top + 100 > viewportHeight) {
        top = viewportHeight - 110;
      }
      
      if (top < 24) {
        top = 24;
      }
      
      console.log('[positioning] Positioned at:', { left, top });
      
      return {
        top: `${top}px`,
        left: `${left}px`,
        transform: 'none'
      };
    } else {
      console.log('[positioning] AOI element not found for ID:', aoiId, 'trying fallback');
    }
  }
  
  // Enhanced fallback: Map tasks to their key elements for positioning
  const taskSelectors = {
    'broken-nav': ['nav[data-aoi="nav-menu"]', '[data-aoi="nav-menu"]', '#task-stimulus nav', 'footer', '.footer', '#task-stimulus'],
    'ambiguous-form': ['[data-aoi^="af-field"]', '#task-stimulus form', 'form', '#task-stimulus'],
    'data-table': ['table[data-aoi]', '[data-aoi^="dt-"]', 'table', '#task-stimulus'],
    'visual-search': ['[data-aoi^="vs-"]', 'svg', 'canvas', '#task-stimulus'],
    'reading-inference': ['[data-aoi^="ri-"]', '.passage', 'p', '#task-stimulus'],
    'math-problem': ['[data-aoi^="mp-"]', '.problem', 'p', '#task-stimulus'],
    'instruction-following': ['[data-aoi^="if-"]', '#if-tabs', 'button[data-tab]', '#task-stimulus'],
    'error-diagnosis': ['.passage', 'p', '#task-stimulus'],
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
