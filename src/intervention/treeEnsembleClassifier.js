// ─────────────────────────────────────────────────────────────────────────────
// TREE ENSEMBLE CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────
// This classifier uses the trained tree ensemble model from 
// live_classifier_weights.json to predict both confusion and SA levels
// based on gaze and mouse features that match the training data.

import { sessionData } from '../experiment/session.js';

// Load the trained model weights
let modelWeights = null;

async function loadModelWeights() {
  if (modelWeights) return modelWeights;
  
  try {
    const response = await fetch('/src/intervention/live_classifier_weights.json');
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

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

// Feature computation matching the trained model's feature set
function computeFeatures(gazeSamples, mouseEvents, windowMs = 3000) {
  if (!gazeSamples || gazeSamples.length === 0) {
    return {
      mean_fixation_duration: 0,
      fixation_rate: 0,
      mean_saccade_amplitude: 0,
      transition_entropy: 0,
      stationary_entropy: 0,
      backtrack_rate: 0,
      aoi_revisit_rate: 0,
      mouse_hesitation_index: 0
    };
  }

  const now = Date.now();
  const recentGaze = gazeSamples.filter(g => g.t && (now - g.t) <= windowMs);
  const recentMouse = (mouseEvents || []).filter(m => m.t && (now - m.t) <= windowMs);

  if (recentGaze.length === 0) {
    return {
      mean_fixation_duration: 0,
      fixation_rate: 0,
      mean_saccade_amplitude: 0,
      transition_entropy: 0,
      stationary_entropy: 0,
      backtrack_rate: 0,
      aoi_revisit_rate: 0,
      mouse_hesitation_index: 0
    };
  }

  // 1. Mean fixation duration (using inter-sample interval as proxy)
  const intervals = [];
  for (let i = 1; i < recentGaze.length; i++) {
    const interval = recentGaze[i].t - recentGaze[i-1].t;
    if (interval > 0 && interval < 1000) { // Filter out gaps > 1s
      intervals.push(interval);
    }
  }
  const mean_fixation_duration = intervals.length > 0 
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
    : 0;

  // 2. Fixation rate (fixations per second)
  const duration = (recentGaze[recentGaze.length - 1].t - recentGaze[0].t) / 1000;
  const fixation_rate = duration > 0 ? recentGaze.length / duration : 0;

  // 3. Mean saccade amplitude
  const saccades = [];
  for (let i = 1; i < recentGaze.length; i++) {
    const dx = recentGaze[i].x - recentGaze[i-1].x;
    const dy = recentGaze[i].y - recentGaze[i-1].y;
    const amplitude = Math.sqrt(dx * dx + dy * dy);
    if (amplitude > 0.001) { // Filter out micro-movements
      saccades.push(amplitude);
    }
  }
  const mean_saccade_amplitude = saccades.length > 0
    ? saccades.reduce((a, b) => a + b, 0) / saccades.length
    : 0;

  // 4. Transition entropy (AOI transition diversity)
  const aoiSequence = recentGaze.map(g => g.aoi_id || 'null').filter(id => id !== 'null');
  const transitions = new Map();
  for (let i = 1; i < aoiSequence.length; i++) {
    const key = `${aoiSequence[i-1]}->${aoiSequence[i]}`;
    transitions.set(key, (transitions.get(key) || 0) + 1);
  }
  let transitionEntropy = 0;
  if (transitions.size > 0) {
    const total = Array.from(transitions.values()).reduce((a, b) => a + b, 0);
    for (const count of transitions.values()) {
      const p = count / total;
      if (p > 0) transitionEntropy -= p * Math.log2(p);
    }
  }

  // 5. Stationary entropy (spatial distribution)
  const xBins = new Map();
  const yBins = new Map();
  const binSize = 0.1; // Normalized coordinate bins
  for (const g of recentGaze) {
    const xBin = Math.floor((g.x + 0.5) / binSize);
    const yBin = Math.floor((g.y + 0.5) / binSize);
    xBins.set(xBin, (xBins.get(xBin) || 0) + 1);
    yBins.set(yBin, (yBins.get(yBin) || 0) + 1);
  }
  
  let stationaryEntropy = 0;
  const totalBins = xBins.size + yBins.size;
  if (totalBins > 0) {
    for (const count of [...xBins.values(), ...yBins.values()]) {
      const p = count / (recentGaze.length * 2);
      if (p > 0) stationaryEntropy -= p * Math.log2(p);
    }
  }

  // 6. Backtrack rate (returns to previous AOI)
  let backtracks = 0;
  const visited = new Set();
  for (let i = 0; i < aoiSequence.length; i++) {
    if (visited.has(aoiSequence[i])) {
      backtracks++;
    }
    visited.add(aoiSequence[i]);
  }
  const backtrack_rate = aoiSequence.length > 0 ? backtracks / aoiSequence.length : 0;

  // 7. AOI revisit rate (similar to backtrack but with time window)
  const aoiCounts = new Map();
  for (const aoiId of aoiSequence) {
    aoiCounts.set(aoiId, (aoiCounts.get(aoiId) || 0) + 1);
  }
  let revisits = 0;
  for (const count of aoiCounts.values()) {
    if (count > 1) revisits += (count - 1);
  }
  const aoi_revisit_rate = aoiSequence.length > 0 ? revisits / aoiSequence.length : 0;

  // 8. Mouse hesitation index
  let mouse_hesitation_index = 0;
  if (recentMouse.length >= 2) {
    const pathLength = recentMouse.reduce((sum, m, i) => {
      if (i === 0) return sum;
      const prev = recentMouse[i - 1];
      const dx = m.x_norm - prev.x_norm;
      const dy = m.y_norm - prev.y_norm;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0);
    
    const netDisplacement = Math.sqrt(
      Math.pow(recentMouse[recentMouse.length - 1].x_norm - recentMouse[0].x_norm, 2) +
      Math.pow(recentMouse[recentMouse.length - 1].y_norm - recentMouse[0].y_norm, 2)
    );
    
    mouse_hesitation_index = netDisplacement > 1e-6 ? pathLength / netDisplacement : 1;
  }

  return {
    mean_fixation_duration,
    fixation_rate,
    mean_saccade_amplitude,
    transition_entropy,
    stationary_entropy,
    backtrack_rate,
    aoi_revisit_rate,
    mouse_hesitation_index
  };
}

// Standardize features using the model's scaler parameters
function standardizeFeatures(features, scalerMean, scalerScale) {
  const featureOrder = [
    'mean_fixation_duration',
    'fixation_rate',
    'mean_saccade_amplitude',
    'transition_entropy',
    'stationary_entropy',
    'backtrack_rate',
    'aoi_revisit_rate',
    'mouse_hesitation_index'
  ];
  
  return featureOrder.map((feature, i) => {
    const value = features[feature] || 0;
    const mean = scalerMean[i] || 0;
    const scale = scalerScale[i] || 1;
    return scale > 0 ? (value - mean) / scale : 0;
  });
}

// Predict confusion probability using logistic regression
function predictConfusion(standardizedFeatures, coef, intercept) {
  let z = intercept;
  for (let i = 0; i < standardizedFeatures.length; i++) {
    z += coef[i] * standardizedFeatures[i];
  }
  const probability = 1 / (1 + Math.exp(-z));
  return clamp(probability, 0, 1);
}

// Predict SA level using multinomial logistic regression
function predictSALevel(standardizedFeatures, saClassifier) {
  const { coef, intercept } = saClassifier;
  const classes = [1, 2, 3]; // SA levels
  
  // Compute scores for each class
  const scores = classes.map((_, classIndex) => {
    let z = intercept[classIndex];
    for (let i = 0; i < standardizedFeatures.length; i++) {
      z += coef[classIndex][i] * standardizedFeatures[i];
    }
    return z;
  });
  
  // Softmax to get probabilities
  const maxScore = Math.max(...scores);
  const expScores = scores.map(s => Math.exp(s - maxScore));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  const probabilities = expScores.map(e => e / sumExp);
  
  // Return the class with highest probability
  const maxProbIndex = probabilities.indexOf(Math.max(...probabilities));
  return {
    saLevel: classes[maxProbIndex],
    confidence: probabilities[maxProbIndex],
    probabilities: {
      1: probabilities[0],
      2: probabilities[1],
      3: probabilities[2]
    }
  };
}

// Main prediction function
export async function predictFromGaze(windowMs = 3000) {
  const weights = await loadModelWeights();
  if (!weights) {
    console.error('[classifier] Cannot predict - model weights not loaded');
    return null;
  }

  const gazeLog = sessionData.gazeLog || [];
  const mouseEvents = sessionData.mouseEvents || [];

  const features = computeFeatures(gazeLog, mouseEvents, windowMs);
  console.log('[classifier] Computed features:', features);

  const standardizedFeatures = standardizeFeatures(
    features,
    weights.scaler_mean,
    weights.scaler_scale
  );

  const confusionProb = predictConfusion(
    standardizedFeatures,
    weights.coef,
    weights.intercept
  );

  const saPrediction = predictSALevel(
    standardizedFeatures,
    weights.sa_classifier
  );

  // Get most looked-at AOI
  const recentGaze = gazeLog.filter(g => g.t && (Date.now() - g.t) <= windowMs);
  const aoiCounts = new Map();
  recentGaze.forEach(g => {
    const aoiId = g.aoi_id || 'null';
    aoiCounts.set(aoiId, (aoiCounts.get(aoiId) || 0) + 1);
  });

  let maxCount = 0;
  let mostLookedAtAoi = null;
  for (const [aoiId, count] of aoiCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostLookedAtAoi = aoiId === 'null' ? null : aoiId;
    }
  }

  return {
    confusion: {
      probability: confusionProb,
      isConfused: confusionProb > 0.5
    },
    saLevel: saPrediction.saLevel,
    saConfidence: saPrediction.confidence,
    saProbabilities: saPrediction.probabilities,
    aoiId: mostLookedAtAoi,
    features
  };
}

// Get AOI type from AOI ID (same as liveClassifier.js)
export function inferAoiType(aoiId) {
  const id = String(aoiId || '').toLowerCase();
  if (!id) return 'unknown';
  if (id.includes('field') || id.includes('input') || id.includes('form')) return 'form_field';
  if (id.includes('nav') || id.includes('menu') || id.includes('button') || id.includes('next')) return 'navigation';
  if (id.includes('table') || id.includes('cell')) return 'data_table_cell';
  if (id.includes('text') || id.includes('paragraph') || id.includes('content')) return 'text_content';
  if (id.includes('image') || id.includes('figure') || id.includes('diagram')) return 'diagram_or_figure';
  return 'unknown';
}