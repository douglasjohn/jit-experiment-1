// liveClassifier.js


import { sessionData } from '../experiment/session.js';

const WINDOW_MS = 3000;
const SAMPLE_INTERVAL_MS = 250;
const MIN_CONFUSION_PROB = 0.55;
const CONSECUTIVE_WINDOWS_TO_FIRE = 4;
const COOLDOWN_MS = 30000;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
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

function inferSaLevel({ revisitRate, hesitation, entropy, recentProgress }) {
  if (revisitRate > 0.3 || hesitation > 1.6) return 2;
  if (entropy > 0.65 || recentProgress < 0.2) return 3;
  return 1;
}

function computeFeatures(samples, recentMouseEvents) {
  if (!samples.length) {
    return { revisitRate: 0, hesitation: 0, entropy: 0, recentProgress: 0 };
  }

  const aoiIds = samples.map((sample) => sample.aoi_id).filter(Boolean);
  const seen = new Set();
  let revisits = 0;
  aoiIds.forEach((aoiId) => {
    if (seen.has(aoiId)) revisits += 1;
    seen.add(aoiId);
  });
  const revisitRate = aoiIds.length ? revisits / aoiIds.length : 0;

  const points = samples.map((sample) => ({ x: sample.x || 0, y: sample.y || 0 }));
  const xMean = points.reduce((sum, point) => sum + point.x, 0) / (points.length || 1);
  const yMean = points.reduce((sum, point) => sum + point.y, 0) / (points.length || 1);
  const entropy = points.length > 3
    ? clamp(Math.sqrt(
        points.reduce((sum, point) => sum + (point.x - xMean) ** 2 + (point.y - yMean) ** 2, 0) / (points.length || 1)
      ) * 1.4, 0, 1)
    : 0;

  const mousePath = (recentMouseEvents || []).slice(-8);
  if (mousePath.length < 2) {
    var hesitation = 0;
  } else {
    const pathLen = mousePath.reduce((sum, current, index) => {
      if (index === 0) return sum;
      const previous = mousePath[index - 1];
      return sum + Math.hypot(current.x_norm - previous.x_norm, current.y_norm - previous.y_norm);
    }, 0);
    const net = Math.hypot(mousePath[mousePath.length - 1].x_norm - mousePath[0].x_norm,
      mousePath[mousePath.length - 1].y_norm - mousePath[0].y_norm);
    hesitation = pathLen > 1e-6 ? pathLen / (net + 1e-6) : 1;
  }

  const recentProgress = samples.length >= 2
    ? clamp((samples[samples.length - 1].timestamp - samples[0].timestamp) / WINDOW_MS, 0, 1)
    : 0;

  return { revisitRate, hesitation, entropy, recentProgress };
}

function scoreConfusion(features) {
  const { revisitRate, hesitation, entropy, recentProgress } = features;
  const score = 0.35 * revisitRate + 0.3 * clamp(hesitation / 2.5, 0, 1) + 0.2 * entropy + 0.15 * (1 - clamp(recentProgress, 0, 1));
  return clamp(score, 0, 1);
}

export function createLiveConfusionClassifier({ onFire, getSubjectId }) {
  const state = {
    samples: [],
    mouseEvents: [],
    lastFiredAt: 0,
    consecutiveWindows: 0,
    lastWindowAt: 0,
  };

  return function handleSample(payload) {
    const now = Date.now();
    if (now - state.lastWindowAt >= SAMPLE_INTERVAL_MS) {
      state.lastWindowAt = now;
    } else {
      return;
    }

    state.samples.push({
      ...payload,
      timestamp: now,
    });

    const recentSamples = state.samples.filter((sample) => now - sample.timestamp <= WINDOW_MS);
    state.samples = recentSamples;

    const recentMouseEvents = (sessionData.mouseEvents || []).filter((event) => now - event.t <= WINDOW_MS);
    state.mouseEvents = recentMouseEvents;

    const features = computeFeatures(recentSamples, recentMouseEvents);
    const probability = scoreConfusion(features);
    const aboveThreshold = probability >= MIN_CONFUSION_PROB;

    if (aboveThreshold) {
      state.consecutiveWindows += 1;
    } else {
      state.consecutiveWindows = 0;
    }

    if (state.consecutiveWindows >= CONSECUTIVE_WINDOWS_TO_FIRE && now - state.lastFiredAt >= COOLDOWN_MS) {
      state.lastFiredAt = now;
      state.consecutiveWindows = 0;

      const subjectId = typeof getSubjectId === 'function' ? getSubjectId() : (sessionData.participantId || sessionData.PROLIFIC_PID || 'participant-1');
      const aoiType = inferAoiType(payload.aoi_id);
      const saLevel = inferSaLevel(features);
      const triggeringFeature = revisitRateFeature(features);

      onFire?.({
        subjectId,
        aoiType,
        saLevel,
        triggeringFeature,
        confidence: Math.round(probability * 100) / 100,
      });
    }
  };
}

function revisitRateFeature(features) {
  if (features.revisitRate > 0.3) return 'aoi_revisit_rate';
  if (features.hesitation > 1.4) return 'mouse_hesitation';
  if (features.entropy > 0.55) return 'gaze_entropy';
  return 'fixation_rate_per_sec';
}
