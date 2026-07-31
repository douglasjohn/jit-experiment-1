// ─────────────────────────────────────────────────────────────────────────────
// TREE ENSEMBLE CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────
// This classifier uses the trained tree ensemble model from 
// live_classifier_weights.json to predict confusion based on 20 features
// computed from gaze, mouse, and scroll data.
//
// Ported from feature_builder.py with I-VDT fixation detection and 
// tree ensemble prediction logic.

import { sessionData } from '../experiment/session.js';

// Constants from Python feature_builder.py
const DEFAULT_GAZE_VELOCITY_THRESHOLD = 0.1; // Normalized screen units per second
const DEFAULT_IDT_DISPERSION_THRESHOLD = 0.15; // Normalized screen units
const MIN_FIXATION_MS = 100;
const MERGE_GAP_MS = 100;
// Fallback only — used if a weights file predates gaze_processing/firing_policy
// export fields. Prefer weights.firing_policy.prob_threshold at runtime.
// Stored as percentage (75 = 0.75 probability) to match weight file format
const FALLBACK_DECISION_THRESHOLD = 72.161939301;
const FALLBACK_WINDOW_MS = 5000;

// Load the trained model weights
let modelWeights = null;

export async function preloadModelWeights() {
  if (modelWeights) return modelWeights;
  
  try {
    const response = await fetch('/intervention/live_classifier_weights.json');
    if (!response.ok) {
      throw new Error(`Failed to load classifier weights: ${response.status}`);
    }
    modelWeights = await response.json();
    console.log('[classifier] Model weights loaded successfully');
    return modelWeights;
  } catch (error) {
    console.error('[classifier] Failed to load model weights:', error);
    return null;
  }
}
// Internal alias so existing call sites inside this file don't need to change.
const loadModelWeights = preloadModelWeights;

/**
 * Safely retrieves the decision threshold from loaded model weights.
 * Falls back to the hardcoded threshold if the weights file is older/missing.
 */
export function getDecisionThreshold() {
  const threshold = modelWeights?.firing_policy?.prob_threshold ?? FALLBACK_DECISION_THRESHOLD;
  console.log('[DecisionThreshold] modelWeights:', modelWeights?.firing_policy, 'Using threshold:', threshold);
  return threshold;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// I-VDT FIXATION DETECTION (simplified from feature_builder.py)
// ─────────────────────────────────────────────────────────────────────────────

function ivdtFixations(gazeLog, velocityThreshold = DEFAULT_GAZE_VELOCITY_THRESHOLD, 
                       dispersionThreshold = DEFAULT_IDT_DISPERSION_THRESHOLD,
                       minDurationMs = MIN_FIXATION_MS, mergeGapMs = MERGE_GAP_MS) {
  if (gazeLog.length < 2) return [];
  
  // Step 1: I-VT style run segmentation
  const runs = [];
  let current = [gazeLog[0]];
  let currentIsFix = true;
  
  for (let i = 1; i < gazeLog.length; i++) {
    const prev = gazeLog[i - 1];
    const cur = gazeLog[i];
    const dt = Math.max(cur.t - prev.t, 1);
    const velocity = Math.hypot(cur.x - prev.x, cur.y - prev.y) / dt * 1000.0;
    const isFix = velocity <= velocityThreshold;
    
    if (isFix === currentIsFix) {
      current.push(cur);
    } else {
      runs.push({ isFix: currentIsFix, points: current });
      current = [cur];
      currentIsFix = isFix;
    }
  }
  runs.push({ isFix: currentIsFix, points: current });
  
  // Step 2: Dispersion-refine each fixation-candidate run
  const fixationGroups = [];
  for (const { isFix, points } of runs) {
    if (!isFix || points.length < 1) continue;
    
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const dispersion = (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
    
    if (dispersion <= dispersionThreshold || points.length < 2) {
      const fix = finalizeFixation(points);
      if (fix) fixationGroups.push([fix]);
    } else {
      // Split using I-DT sliding window (simplified)
      const split = idtFixations(points, dispersionThreshold);
      if (split) fixationGroups.push(split);
    }
  }
  
  if (fixationGroups.length === 0) return [];
  
  // Step 3: Merge across groups
  fixationGroups.sort((a, b) => a[0].start_t - b[0].start_t);
  const merged = [...fixationGroups[0]];
  
  for (let i = 1; i < fixationGroups.length; i++) {
    const group = fixationGroups[i];
    const prev = merged[merged.length - 1];
    const firstOfGroup = group[0];
    const gap = firstOfGroup.start_t - prev.end_t;
    
    if (gap <= mergeGapMs) {
      merged[merged.length - 1] = {
        start_t: prev.start_t,
        end_t: firstOfGroup.end_t,
        x: (prev.x + firstOfGroup.x) / 2.0,
        y: (prev.y + firstOfGroup.y) / 2.0,
        duration_ms: firstOfGroup.end_t - prev.start_t,
        aoi_id: prev.aoi_id || firstOfGroup.aoi_id,
      };
      merged.push(...group.slice(1));
    } else {
      merged.push(...group);
    }
  }
  
  return merged.filter(f => f.duration_ms >= minDurationMs);
}

function idtFixations(points, dispersionThreshold) {
  // Simplified I-DT implementation
  if (points.length < 2) return [];
  
  const fixations = [];
  let windowStart = 0;
  
  while (windowStart < points.length) {
    let windowEnd = windowStart + 1;
    let maxDispersion = 0;
    
    // Expand window until dispersion exceeds threshold
    while (windowEnd < points.length) {
      const windowPoints = points.slice(windowStart, windowEnd + 1);
      const xs = windowPoints.map(p => p.x);
      const ys = windowPoints.map(p => p.y);
      const dispersion = (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
      
      if (dispersion > dispersionThreshold && windowEnd - windowStart >= 1) {
        break;
      }
      maxDispersion = dispersion;
      windowEnd++;
    }
    
    if (windowEnd - windowStart >= 1) {
      const windowPoints = points.slice(windowStart, windowEnd);
      const fix = finalizeFixation(windowPoints);
      if (fix) fixations.push(fix);
    }
    
    windowStart = windowEnd;
  }
  
  return fixations;
}

function finalizeFixation(points) {
  if (points.length === 0) return null;
  
  const start_t = points[0].t;
  const end_t = points[points.length - 1].t;
  const duration_ms = end_t - start_t;
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const aoi_id = points[points.length - 1].aoi_id || points[0].aoi_id;
  
  return { start_t, end_t, duration_ms, x, y, aoi_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE COMPUTATION (ported from feature_builder.py)
// ─────────────────────────────────────────────────────────────────────────────

function meanFixationDuration(fixations) {
  if (fixations.length === 0) return 0.0;
  return fixations.reduce((sum, f) => sum + f.duration_ms, 0) / fixations.length;
}

function fixationRate(fixations, windowSec) {
  if (windowSec <= 0) return 0.0;
  return fixations.length / windowSec;
}

function meanSaccadeAmplitude(fixations) {
  if (fixations.length < 2) return 0.0;
  const amplitudes = [];
  for (let i = 0; i < fixations.length - 1; i++) {
    const a = fixations[i];
    const b = fixations[i + 1];
    amplitudes.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  return amplitudes.reduce((sum, amp) => sum + amp, 0) / amplitudes.length;
}

function transitionEntropy(fixations) {
  const counts = new Map();
  for (let i = 0; i < fixations.length - 1; i++) {
    const a = fixations[i];
    const b = fixations[i + 1];
    if (a.aoi_id == null || b.aoi_id == null) continue;
    const key = `${a.aoi_id},${b.aoi_id}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  
  if (counts.size === 0) return 0.0;
  
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  let entropy = 0.0;
  for (const count of counts.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

function stationaryEntropy(fixations) {
  const aoiCounts = new Map();
  for (const f of fixations) {
    if (f.aoi_id == null) continue;
    aoiCounts.set(f.aoi_id, (aoiCounts.get(f.aoi_id) || 0) + 1);
  }
  
  if (aoiCounts.size === 0) return 0.0;
  
  const total = Array.from(aoiCounts.values()).reduce((sum, count) => sum + count, 0);
  let entropy = 0.0;
  for (const count of aoiCounts.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

function backtrackRate(fixations) {
  if (fixations.length < 3) return 0.0;
  
  let backtracks = 0;
  let total = 0;
  
  for (let i = 2; i < fixations.length; i++) {
    const v1x = fixations[i - 1].x - fixations[i - 2].x;
    const v1y = fixations[i - 1].y - fixations[i - 2].y;
    const v2x = fixations[i].x - fixations[i - 1].x;
    const v2y = fixations[i].y - fixations[i - 1].y;
    
    const n1 = Math.hypot(v1x, v1y);
    const n2 = Math.hypot(v2x, v2y);
    
    if (n1 < 1e-9 || n2 < 1e-9) continue;
    
    const cosAngle = clamp((v1x * v2x + v1y * v2y) / (n1 * n2), -1, 1);
    const angleDeg = Math.acos(cosAngle) * (180 / Math.PI);
    
    total++;
    if (angleDeg > 90) backtracks++;
  }
  
  return total > 0 ? backtracks / total : 0.0;
}

function aoiRevisitRate(fixations) {
  const seen = new Set();
  let revisits = 0;
  let total = 0;
  
  for (const f of fixations) {
    if (f.aoi_id == null) continue;
    total++;
    if (seen.has(f.aoi_id)) {
      revisits++;
    }
    seen.add(f.aoi_id);
  }
  
  return total > 0 ? revisits / total : 0.0;
}

function mouseHesitationIndex(mouseEvents) {
  if (mouseEvents.length < 2) return 1.0;
  
  let pathLen = 0;
  for (let i = 1; i < mouseEvents.length; i++) {
    const dx = mouseEvents[i].x_norm - mouseEvents[i - 1].x_norm;
    const dy = mouseEvents[i].y_norm - mouseEvents[i - 1].y_norm;
    pathLen += Math.hypot(dx, dy);
  }
  
  const net = Math.hypot(
    mouseEvents[mouseEvents.length - 1].x_norm - mouseEvents[0].x_norm,
    mouseEvents[mouseEvents.length - 1].y_norm - mouseEvents[0].y_norm
  );
  
  return pathLen > 1e-6 ? pathLen / (net + 1e-6) : 1.0;
}

function fixationSaccadeRatio(fixations) {
  if (fixations.length < 2) return 0.0;
  
  const fixTime = fixations.reduce((sum, f) => sum + f.duration_ms, 0);
  let saccadeTime = 0;
  
  for (let i = 0; i < fixations.length - 1; i++) {
    saccadeTime += Math.max(fixations[i + 1].start_t - fixations[i].end_t, 0);
  }
  
  return fixTime / (saccadeTime + 1e-6);
}

function scanpathSpatialSpread(fixations) {
  if (fixations.length < 2) return 0.0;
  
  const xs = fixations.map(f => f.x);
  const ys = fixations.map(f => f.y);
  
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

function regressionRate(fixations) {
  if (fixations.length < 2) return 0.0;
  
  let regressions = 0;
  for (let i = 0; i < fixations.length - 1; i++) {
    if (fixations[i + 1].x < fixations[i].x) {
      regressions++;
    }
  }
  
  return regressions / (fixations.length - 1);
}

function fixationDurationCV(fixations) {
  if (fixations.length < 2) return 0.0;
  
  const durs = fixations.map(f => f.duration_ms);
  const mean = durs.reduce((sum, d) => sum + d, 0) / durs.length;
  
  const variance = durs.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durs.length;
  const std = Math.sqrt(variance);
  
  return std / (mean + 1e-6);
}

function mouseIdleRatio(mouseEvents, windowSec) {
  if (mouseEvents.length < 2 || windowSec <= 0) return 0.0;
  
  let idleTime = 0.0;
  for (let i = 1; i < mouseEvents.length; i++) {
    const dt = Math.max(mouseEvents[i].t - mouseEvents[i - 1].t, 0) / 1000.0;
    if (dt <= 0) continue;
    
    const dist = Math.hypot(
      mouseEvents[i].x_norm - mouseEvents[i - 1].x_norm,
      mouseEvents[i].y_norm - mouseEvents[i - 1].y_norm
    );
    const speed = dist / dt;
    
    if (speed < 0.01) idleTime += dt;
  }
  
  return idleTime / windowSec;
}

function mouseDirectionReversals(mouseEvents) {
  if (mouseEvents.length < 3) return 0.0;
  
  let reversals = 0;
  let total = 0;
  
  for (let i = 2; i < mouseEvents.length; i++) {
    const v1x = mouseEvents[i - 1].x_norm - mouseEvents[i - 2].x_norm;
    const v1y = mouseEvents[i - 1].y_norm - mouseEvents[i - 2].y_norm;
    const v2x = mouseEvents[i].x_norm - mouseEvents[i - 1].x_norm;
    const v2y = mouseEvents[i].y_norm - mouseEvents[i - 1].y_norm;
    
    const n1 = Math.hypot(v1x, v1y);
    const n2 = Math.hypot(v2x, v2y);
    
    if (n1 < 1e-9 || n2 < 1e-9) continue;
    
    const cosAngle = clamp((v1x * v2x + v1y * v2y) / (n1 * n2), -1, 1);
    const angleDeg = Math.acos(cosAngle) * (180 / Math.PI);
    
    total++;
    if (angleDeg > 90) reversals++;
  }
  
  return total > 0 ? reversals / total : 0.0;
}

function gazeMouseDistanceStats(windowGaze, windowMouse) {
  if (!windowGaze || !windowMouse || windowGaze.length === 0 || windowMouse.length === 0) {
    return { mean: 0.0, variance: 0.0 };
  }
  
  const mouseSorted = [...windowMouse].sort((a, b) => a.t - b.t);
  const times = mouseSorted.map(m => m.t);
  const distances = [];
  
  for (const g of windowGaze) {
    const idx = binarySearch(times, g.t);
    const candidates = [];
    
    if (idx < mouseSorted.length) candidates.push(mouseSorted[idx]);
    if (idx > 0) candidates.push(mouseSorted[idx - 1]);
    
    if (candidates.length === 0) continue;
    
    const nearest = candidates.reduce((best, m) => 
      Math.abs(m.t - g.t) < Math.abs(best.t - g.t) ? m : best
    );
    
    distances.push(Math.hypot(g.x - (nearest.x_norm || 0), g.y - (nearest.y_norm || 0)));
  }
  
  if (distances.length === 0) return { mean: 0.0, variance: 0.0 };
  
  const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
  
  return { mean, variance };
}

function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  
  return left;
}

function scrollReversalRate(scrollEvents) {
  if (scrollEvents.length < 3) return 0.0;
  
  const sorted = [...scrollEvents].sort((a, b) => a.t - b.t);
  let reversals = 0;
  let total = 0;
  
  for (let i = 2; i < sorted.length; i++) {
    const d1 = sorted[i - 1].scrollY - sorted[i - 2].scrollY;
    const d2 = sorted[i].scrollY - sorted[i - 1].scrollY;
    
    if (d1 === 0 || d2 === 0) continue;
    
    total++;
    if ((d1 > 0) !== (d2 > 0)) reversals++;
  }
  
  return total > 0 ? reversals / total : 0.0;
}

function scrollVelocityVariance(scrollEvents) {
  const sorted = [...scrollEvents].sort((a, b) => a.t - b.t);
  if (sorted.length < 2) return 0.0;
  
  const velocities = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const dt = Math.max(sorted[i + 1].t - sorted[i].t, 1) / 1000.0;
    velocities.push((sorted[i + 1].scrollY - sorted[i].scrollY) / dt);
  }
  
  if (velocities.length === 0) return 0.0;
  
  const mean = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
  const variance = velocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocities.length;
  
  return variance;
}

function timeSinceLastScroll(scrollEvents, tEnd) {
  if (!scrollEvents || scrollEvents.length === 0) return -1.0;
  
  const lastT = Math.max(...scrollEvents.map(s => s.t));
  return (tEnd - lastT) / 1000.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FEATURE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function computeFeatures(gazeLog, mouseEvents, scrollEvents, windowMs = 5000) {
  const now = Date.now();
  const windowGaze = gazeLog.filter(g => g.t && (now - g.t) <= windowMs);
  const windowMouse = (mouseEvents || []).filter(m => m.t && (now - m.t) <= windowMs);
  const windowScroll = (scrollEvents || []).filter(s => s.t && (now - s.t) <= windowMs);
  
  if (windowGaze.length === 0) {
    return getZeroFeatures();
  }
  
  // Detect fixations using I-VDT
  const fixations = ivdtFixations(windowGaze);
  const windowSec = windowMs / 1000.0;
  
  // Compute all 20 features
  const features = {
    mean_fixation_duration: meanFixationDuration(fixations),
    fixation_rate: fixationRate(fixations, windowSec),
    mean_saccade_amplitude: meanSaccadeAmplitude(fixations),
    transition_entropy: transitionEntropy(fixations),
    stationary_entropy: stationaryEntropy(fixations),
    backtrack_rate: backtrackRate(fixations),
    aoi_revisit_rate: aoiRevisitRate(fixations),
    mouse_hesitation_index: mouseHesitationIndex(windowMouse),
    fixation_saccade_ratio: fixationSaccadeRatio(fixations),
    scanpath_spatial_spread: scanpathSpatialSpread(fixations),
    regression_rate: regressionRate(fixations),
    fixation_duration_cv: fixationDurationCV(fixations),
    mouse_idle_ratio: mouseIdleRatio(windowMouse, windowSec),
    mouse_direction_reversals: mouseDirectionReversals(windowMouse),
    gaze_mouse_distance_mean: 0,
    gaze_mouse_distance_var: 0,
    scroll_reversal_rate: scrollReversalRate(windowScroll),
    scroll_velocity_var: scrollVelocityVariance(windowScroll),
    time_since_last_scroll: timeSinceLastScroll(windowScroll, now),
  };
  
  // Compute gaze-mouse distance stats
  const gazeMouseStats = gazeMouseDistanceStats(windowGaze, windowMouse);
  features.gaze_mouse_distance_mean = gazeMouseStats.mean;
  features.gaze_mouse_distance_var = gazeMouseStats.variance;
  
  return features;
}

function getZeroFeatures() {
  return {
    mean_fixation_duration: 0,
    fixation_rate: 0,
    mean_saccade_amplitude: 0,
    transition_entropy: 0,
    stationary_entropy: 0,
    backtrack_rate: 0,
    aoi_revisit_rate: 0,
    mouse_hesitation_index: 0,
    fixation_saccade_ratio: 0,
    scanpath_spatial_spread: 0,
    regression_rate: 0,
    fixation_duration_cv: 0,
    mouse_idle_ratio: 0,
    mouse_direction_reversals: 0,
    gaze_mouse_distance_mean: 0,
    gaze_mouse_distance_var: 0,
    scroll_reversal_rate: 0,
    scroll_velocity_var: 0,
    time_since_last_scroll: -1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE FEATURE SNAPSHOT (no model needed — pure feature math)
// Exposed for callers that need pre/post-intervention baselines (e.g.
// classifier.js's cognitive-load reward term) without paying the cost of
// loading/running the trained tree ensemble.
// ─────────────────────────────────────────────────────────────────────────────
export function computeLiveFeatures(windowMs = 5000) {
  const gazeLog = sessionData.gazeLog || [];
  const mouseEvents = sessionData.mouseEvents || [];
  const scrollEvents = sessionData.scrollEvents || [];
  return computeFeatures(gazeLog, mouseEvents, scrollEvents, windowMs);
}


// ─────────────────────────────────────────────────────────────────────────────
// TREE ENSEMBLE PREDICTION
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_ORDER = [
  "mean_fixation_duration", "fixation_rate", "mean_saccade_amplitude",
  "transition_entropy", "stationary_entropy", "backtrack_rate",
  "aoi_revisit_rate", "mouse_hesitation_index",
  "fixation_saccade_ratio", "scanpath_spatial_spread", "regression_rate",
  "fixation_duration_cv", "mouse_idle_ratio", "mouse_direction_reversals",
  "gaze_mouse_distance_mean", "gaze_mouse_distance_var",
  "scroll_reversal_rate", "scroll_velocity_var", "time_since_last_scroll",
];

function standardizeFeatures(features, scalerMean, scalerScale) {
  return FEATURE_ORDER.map((feature, i) => {
    const value = features[feature] ?? 0;
    const mean = scalerMean[i] ?? 0;
    const scale = scalerScale[i] ?? 1;
    // Guard against zero standard deviation to avoid division by zero or NaN
    return scale > 0 ? (value - mean) / scale : 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCLIMATION STATE
// ─────────────────────────────────────────────────────────────────────────────
const acclimationState = {
  taskId: null,
  firstSampleTime: null,
  featuresList: [],
  mean: null,
  std: null,
  ready: false
};

function applyAcclimationZScore(rawFeatures, taskId, weights) {
  const now = Date.now();
  const acclimationMs = weights.acclimation_ms || 15000;

  if (acclimationState.taskId !== taskId) {
    acclimationState.taskId = taskId;
    acclimationState.firstSampleTime = now;
    acclimationState.featuresList = [];
    acclimationState.mean = null;
    acclimationState.std = null;
    acclimationState.ready = false;
  }

  if (!acclimationState.ready) {
    if (now - acclimationState.firstSampleTime < acclimationMs) {
      acclimationState.featuresList.push(rawFeatures);
      return null; // Warming up
    } else {
      // 15 seconds elapsed, compute mean and std from the buffer
      const count = acclimationState.featuresList.length;
      if (count === 0) {
        acclimationState.mean = FEATURE_ORDER.map(() => 0);
        acclimationState.std = FEATURE_ORDER.map(() => 1);
      } else {
        acclimationState.mean = FEATURE_ORDER.map(feat => {
          return acclimationState.featuresList.reduce((sum, f) => sum + (f[feat] || 0), 0) / count;
        });
        acclimationState.std = FEATURE_ORDER.map((feat, i) => {
          const mean = acclimationState.mean[i];
          const variance = acclimationState.featuresList.reduce((sum, f) => sum + Math.pow((f[feat] || 0) - mean, 2), 0) / count;
          // Guard against zero standard deviation
          return variance > 1e-9 ? Math.sqrt(variance) : (weights.scaler_scale?.[i] || 1);
        });
      }
      acclimationState.ready = true;
    }
  }

  // Apply the acclimated z-score to the incoming vector
  return FEATURE_ORDER.map((feat, i) => {
    const val = rawFeatures[feat] || 0;
    const mean = acclimationState.mean[i];
    const std = acclimationState.std[i];
    return (val - mean) / std;
  });
}

function predictTreeEnsemble(standardizedFeatures, trees) {
  if (!trees || trees.length === 0) return 0.5;
  
  let totalProb = 0;
  
  for (const tree of trees) {
    const prob = traverseTree(tree, standardizedFeatures);
    totalProb += prob;
  }
  
  return totalProb / trees.length;
}

function traverseTree(node, features) {
  if (node.leaf) {
    // Return probability of class 1 (confused)
    return node.probs[1] ?? 0.5;
  }
  
  const featureValue = features[node.feature] ?? 0;
  const child = featureValue <= node.threshold ? node.left : node.right;
  
  return traverseTree(child, features);
}

// ─────────────────────────────────────────────────────────────────────────────
// SA-LEVEL PREDICTION (real trained multiclass model, from
// train_classifierv4.py's train_sa_classifier / refit_sa_classifier)
// ─────────────────────────────────────────────────────────────────────────────

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / sum);
}

function traverseMulticlassTree(node, features) {
  if (node.leaf) {
    // Return array of probabilities for each class
    return node.probs;
  }
  
  const featureValue = features[node.feature] ?? 0;
  const child = featureValue <= node.threshold ? node.left : node.right;
  
  return traverseMulticlassTree(child, features);
}

/**
 * SA Classifier payload shape is now a Random Forest.
 * Expects: trees (array of decision trees), classes (numeric sa_level values),
 * and optionally scaler_mean/scaler_scale if features still need standardizing.
 */
function predictSaLevelFromClassifier(rawFeatures, saClassifier) {
  if (!saClassifier || !saClassifier.trees || !saClassifier.classes) return null;

  const x = (saClassifier.scaler_mean && saClassifier.scaler_scale)
    ? standardizeFeatures(rawFeatures, saClassifier.scaler_mean, saClassifier.scaler_scale)
    : FEATURE_ORDER.map(feat => rawFeatures[feat] ?? 0);

  // Aggregate probabilities across all trees in the forest
  let totalProbs = new Array(saClassifier.classes.length).fill(0);
  for (const tree of saClassifier.trees) {
    const probs = traverseMulticlassTree(tree, x);
    for (let i = 0; i < probs.length; i++) {
      totalProbs[i] += probs[i] ?? 0;
    }
  }
  
  const probs = totalProbs.map(p => p / saClassifier.trees.length);

  let bestIdx = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[bestIdx]) bestIdx = i;
  }

  const probabilities = {};
  saClassifier.classes.forEach((c, i) => { probabilities[c] = probs[i]; });

  return {
    saLevelNumeric: saClassifier.classes[bestIdx],
    confidence: probs[bestIdx],    probabilities,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PREDICTION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export async function predictFromGaze(windowMs = 5000) {
  const weights = await loadModelWeights();
  if (!weights) return null;

  // Use the trained window length (3000ms or 5000ms)
  const trainedWindowMs = weights.gaze_processing?.window_ms ?? windowMs;
  
  const gazeLog = sessionData.gazeLog || [];
  const mouseEvents = sessionData.mouseEvents || [];
  const scrollEvents = sessionData.scrollEvents || [];
  const taskId = sessionData.currentTaskId || 'unknown';

  const rawFeatures = computeFeatures(gazeLog, mouseEvents, scrollEvents, trainedWindowMs);

  // 1. PHASE ONE: Acclimation (Task-level)
  // This centers the features relative to the user's first 15s of the task
  const acclimatedVector = applyAcclimationZScore(rawFeatures, taskId, weights);
  
  // If still in the 15-second warmup window, bail.
  if (!acclimatedVector) {
    return {
      confusion: { probability: 0, threshold: weights.firing_policy.prob_threshold, isConfused: false },
      baseFeaturesForSa: null,
      aoiId: null,
      features: rawFeatures
    };
  }

  // 2. PHASE TWO: Global Standardization (Population-level)
  // We must apply the StandardScaler weights from the Python Pipeline
  const doubleStandardizedFeatures = acclimatedVector.map((val, i) => {
    const mean = weights.scaler_mean[i] ?? 0;
    const scale = weights.scaler_scale[i] ?? 1;
    return scale > 0 ? (val - mean) / scale : 0;
  });

  // 3. PHASE THREE: Tree Ensemble Prediction
  const confusionProb = predictTreeEnsemble(doubleStandardizedFeatures, weights.trees);

  // Get most looked-at AOI for triggering
  const recentGaze = gazeLog.filter(g => g.t && (Date.now() - g.t) <= trainedWindowMs);
  const aoiCounts = new Map();
  recentGaze.forEach(g => {
    const id = g.aoi_id || 'null';
    aoiCounts.set(id, (aoiCounts.get(id) || 0) + 1);
  });
  let mostLookedAtAoi = [...aoiCounts.entries()].reduce((a, b) => b[1] > a[1] ? b : a, ['null', 0])[0];
  if (mostLookedAtAoi === 'null') mostLookedAtAoi = null;

  return {
    confusion: {
      probability: confusionProb,
      threshold: weights.firing_policy.prob_threshold,
      isConfused: confusionProb >= weights.firing_policy.prob_threshold,
    },
    // We pass the ACCLIMATED vector to the SA classifier because it has its own scaler
    baseFeaturesForSa: acclimatedVector, 
    aoiId: mostLookedAtAoi,
    features: rawFeatures
  };
}

export function evaluateSaClassifier(acclimatedVector) {
  if (!modelWeights || !modelWeights.sa_classifier || !acclimatedVector) return null;
  
  const saWeights = modelWeights.sa_classifier;
  const metadata = modelWeights.sa_classifier_metadata;

  // 1. Apply SA-specific Global Scaler (fitted during train_sa_classifier)
  const xSa = acclimatedVector.map((val, i) => {
    const mean = saWeights.scaler_mean[i] ?? 0;
    const scale = saWeights.scaler_scale[i] ?? 1;
    return scale > 0 ? (val - mean) / scale : 0;
  });

  // 2. Predict Probabilities using the RF trees
  let totalProbs = new Array(saWeights.classes.length).fill(0);
  for (const tree of saWeights.trees) {
    const treeProbs = traverseMulticlassTree(tree, xSa);
    for (let i = 0; i < treeProbs.length; i++) {
      totalProbs[i] += treeProbs[i] ?? 0;
    }
  }
  const finalProbs = totalProbs.map(p => p / saWeights.trees.length);

  // 3. Apply the Deployment Logic Contract (Priority SA3)
  const sa3Idx = saWeights.sa3_class_index;
  const sa3Thresh = metadata.sa3_threshold;
  let predictedLevel;

  if (finalProbs[sa3Idx] >= sa3Thresh) {
    predictedLevel = 3.0;
  } else {
    // Standard argmax for levels 1 and 2
    let bestIdx = -1;
    let maxP = -1;
    finalProbs.forEach((p, i) => {
      if (i === sa3Idx) return;
      if (p > maxP) {
        maxP = p;
        bestIdx = i;
      }
    });
    predictedLevel = saWeights.classes[bestIdx];
  }

  // Create probability map for HUD/Logs
  const probMap = {};
  saWeights.classes.forEach((c, i) => { probMap[c] = finalProbs[i]; });

  return {
    numeric: predictedLevel,
    confidence: finalProbs[saWeights.classes.indexOf(predictedLevel)],
    probabilities: probMap,
    source: 'trained_model',
  };
}

// Get AOI type from AOI ID - this is no longer needed since we use AOI-specific interventions directly
export function inferAoiType(aoiId) {
  // Return null or 'unknown' since we don't need to infer AOI type anymore
  // The AOI ID is used directly to select from setAoiHelp
  return null;
}