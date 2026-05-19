/**
 * gazePipeline.js
 *
 * Connects the raw tracker output to the fixation detector and gaze manager.
 *
 * Changes from original:
 *  - Fixes import paths (uppercase UI directory)
 *  - Applies Exponential Moving Average (EMA) smoothing before fixation detection.
 *    This dramatically reduces noise and allows the IVT detector to find fixations.
 *  - Detects linear drift (a failure mode where gaze scans monotonically across
 *    the screen regardless of where the user looks) and suppresses those samples.
 *  - Passes both smoothed and raw corrected coordinates downstream.
 */

import { moveGazeDot, showFixationIndicator } from '../UI/overlays';
import { updateDebugPanel, incrementFixationCount } from '../UI/debugPanel';

// ── EMA smoothing parameters ──────────────────────────────────────────────────
// Alpha: 0 = frozen, 1 = no smoothing (raw). 0.25 ≈ 4-sample rolling influence.
const EMA_ALPHA = 0.25;

// If the raw sample jumps more than this (normalised units) from the current EMA,
// we assume a genuine fast saccade/blink-recovery and snap the EMA immediately.
const EMA_RESET_THRESHOLD = 0.28;

// ── Linear-drift detection parameters ────────────────────────────────────────
// Drift is flagged when a rolling window of samples shows:
//   • x spans >= DRIFT_X_RANGE_MIN of screen (it's sweeping left-to-right)
//   • y variance is tiny (nearly constant height → a line, not scatter)
//   • Pearson R² of (x vs. sample-index) exceeds DRIFT_R2_THRESHOLD
const DRIFT_WINDOW_SIZE  = 22;
const DRIFT_R2_THRESHOLD = 0.90;
const DRIFT_X_RANGE_MIN  = 0.22;   // 22 % of screen width
const DRIFT_Y_VAR_MAX    = 0.0025; // y must be nearly flat

// ── Module-level state (reset when recalibration begins) ─────────────────────
let _emaX        = null;
let _emaY        = null;
let _driftWindow = [];
let _driftActive = false;

/**
 * Call this when calibration begins so stale pre-calibration positions
 * do not carry into the new calibrated coordinate space.
 */
export function resetGazePipelineState() {
  _emaX        = null;
  _emaY        = null;
  _driftWindow = [];
  _driftActive = false;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export function attachGazePipeline({ tracker, calibrationSystem, fixationDetector, gazeManager }) {
  tracker.onGazeResults = (gazeResult) => {

    // 1. Apply calibration bias correction
    const rawCorrX = gazeResult.normPog[0] - (calibrationSystem?.biasX || 0);
    const rawCorrY = gazeResult.normPog[1] - (calibrationSystem?.biasY || 0);

    const timestampMs = _normalizeTimestamp(gazeResult.timestamp);

    // 2. EMA smoothing — seed on first sample; snap on large jumps
    if (_emaX === null || _emaY === null) {
      _emaX = rawCorrX;
      _emaY = rawCorrY;
    } else {
      const jump = Math.hypot(rawCorrX - _emaX, rawCorrY - _emaY);
      if (jump > EMA_RESET_THRESHOLD) {
        _emaX = rawCorrX;
        _emaY = rawCorrY;
      } else {
        _emaX = EMA_ALPHA * rawCorrX + (1 - EMA_ALPHA) * _emaX;
        _emaY = EMA_ALPHA * rawCorrY + (1 - EMA_ALPHA) * _emaY;
      }
    }

    // 3. Drift detection
    if (gazeResult.gazeState === 'open') {
      _driftWindow.push({ x: _emaX, y: _emaY });
      if (_driftWindow.length > DRIFT_WINDOW_SIZE) _driftWindow.shift();
      if (_driftWindow.length === DRIFT_WINDOW_SIZE) {
        _driftActive = _isLinearDrift(_driftWindow);
      }
    } else {
      _driftWindow = [];
      _driftActive = false;
    }

    // 4. Debug panel (always shows smoothed coords)
    updateDebugPanel({ gazeX: _emaX, gazeY: _emaY, gazeState: gazeResult.gazeState });

    // 5. Gaze dot — hide during drift so the artefact is visible to the researcher
    const screenX = (_emaX + 0.5) * window.innerWidth;
    const screenY = (_emaY + 0.5) * window.innerHeight;
    moveGazeDot(screenX, screenY, gazeResult.gazeState !== 'closed' && !_driftActive);

    // 6. Forward to gaze manager
    gazeManager?.handleGazeSample({
      x:         _emaX,
      y:         _emaY,
      rawX:      rawCorrX,
      rawY:      rawCorrY,
      timestamp: timestampMs,
      gazeState: gazeResult.gazeState,
      isDrift:   _driftActive,
    });

    // 7. Feed smoothed, non-drift gaze into fixation detector
    if (gazeResult.gazeState === 'open' && !_driftActive) {
      const fixation = fixationDetector.step(_emaX, _emaY, timestampMs);
      if (fixation) {
        incrementFixationCount();
        const fixScreenX = (fixation.x + 0.5) * window.innerWidth;
        const fixScreenY = (fixation.y + 0.5) * window.innerHeight;
        showFixationIndicator(fixScreenX, fixScreenY);
        gazeManager?.handleFixation(fixation);
      }
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _normalizeTimestamp(timestamp) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return Date.now();
  }
  // Some tracker implementations return seconds; convert to ms when needed.
  return timestamp < 1000 ? timestamp * 1000 : timestamp;
}

function _isLinearDrift(samples) {
  const xs = samples.map(s => s.x);
  const ys = samples.map(s => s.y);
  const xRange = Math.max(...xs) - Math.min(...xs);
  if (xRange < DRIFT_X_RANGE_MIN) return false;
  const yVar = _variance(ys);
  if (yVar > DRIFT_Y_VAR_MAX) return false;
  const indices = samples.map((_, i) => i);
  return _pearsonR2(xs, indices) > DRIFT_R2_THRESHOLD;
}

function _mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

function _variance(arr) {
  const m = _mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function _pearsonR2(xs, ys) {
  const mx = _mean(xs), my = _mean(ys);
  const num  = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const denX = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const denY = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  if (denX === 0 || denY === 0) return 0;
  return (num / (denX * denY)) ** 2;
}
