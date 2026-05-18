/**
 * fixationDetector.js  —  I-VT (Velocity-Threshold Identification) fixation detector
 *
 * Changes from original:
 *
 * 1. Gap protection  — if two consecutive samples are more than MAX_GAP_MS apart
 *    (blink, tracker dropout, or very sporadic data), the gap is NOT used to
 *    compute velocity. The existing fixation is preserved rather than destroyed
 *    by an artificially huge velocity spike.
 *
 * 2. Lower velocity threshold (0.015 from 0.02) — the pipeline now feeds in
 *    EMA-smoothed gaze, so legitimate saccades produce higher-velocity spikes
 *    (cleaner signal) while fixation periods are flatter. A slightly tighter
 *    threshold therefore works better here than on raw noisy data.
 *
 * 3. Rolling emission — after emitting a fixation the detector does NOT fully
 *    reset; it starts a fresh fixation at the current position. This means
 *    sustained looking at one area produces a stream of fixation events (one
 *    every minDurationMs), which is exactly what the AOI logging needs.
 *
 * 4. Minimum sample count — requires at least MIN_SAMPLES consecutive fixation
 *    samples before emitting, preventing a single outlier low-velocity frame
 *    from being treated as a real fixation.
 */

const MAX_GAP_MS   = 150;  // gaps larger than this are treated as blinks / dropouts
const MIN_SAMPLES  = 3;    // must see this many consecutive slow-velocity samples

export class IVTFixationDetector {
  /**
   * @param {number} velocityThreshold  Max velocity (norm units / ms) to count as fixation
   * @param {number} minDurationMs      Min fixation duration before emission
   */
  constructor(velocityThreshold = 0.015, minDurationMs = 100) {
    this.velocityThreshold = velocityThreshold;
    this.minDurationMs     = minDurationMs;

    this._fixation    = null;   // accumulator for current candidate fixation
    this._sampleCount = 0;
    this._lastPos     = null;
    this._lastTs      = null;
  }

  /**
   * Feed the next (smoothed) gaze sample.
   * Returns a completed fixation object when one is ready, otherwise null.
   *
   * @param {number} normX      Normalised x (−0.5 … +0.5)
   * @param {number} normY      Normalised y (−0.5 … +0.5)
   * @param {number} timestampMs  Tracker timestamp in ms
   * @returns {{ x, y, durationMs, endTime } | null}
   */
  step(normX, normY, timestampMs) {
    // First sample — seed state, nothing to emit
    if (this._lastPos === null) {
      this._lastPos = { x: normX, y: normY };
      this._lastTs  = timestampMs;
      return null;
    }

    const dt = timestampMs - this._lastTs;

    // ── Gap protection ────────────────────────────────────────────────────────
    // A large gap means a blink or tracker dropout. Don't calculate velocity
    // across a gap (it would be artificially enormous). Preserve the existing
    // fixation accumulator — if the person was fixating they likely still are.
    if (dt > MAX_GAP_MS) {
      this._lastPos = { x: normX, y: normY };
      this._lastTs  = timestampMs;
      // Reset sample counter but keep _fixation so a brief blink doesn't lose it
      this._sampleCount = Math.max(0, this._sampleCount - 1);
      return null;
    }

    const clampedDt = Math.max(dt, 5); // guard against identical timestamps
    const dx       = normX - this._lastPos.x;
    const dy       = normY - this._lastPos.y;
    const velocity = Math.sqrt(dx * dx + dy * dy) / clampedDt;

    let completed = null;

    if (velocity < this.velocityThreshold) {
      // ── Fixation sample ───────────────────────────────────────────────────
      if (!this._fixation) {
        // Start a new fixation accumulator
        this._fixation = { x: normX, y: normY, startTime: timestampMs, durationMs: 0 };
        this._sampleCount = 1;
      } else {
        // Weighted centroid update
        const w = this._fixation.durationMs + dt;
        this._fixation.x = (this._fixation.x * this._fixation.durationMs + normX * dt) / w;
        this._fixation.y = (this._fixation.y * this._fixation.durationMs + normY * dt) / w;
        this._fixation.durationMs = w;
        this._sampleCount++;
      }

      // Emit once thresholds are met; then immediately start the next accumulator
      // (rolling emission — sustained gaze produces events every minDurationMs)
      if (
        this._fixation.durationMs >= this.minDurationMs &&
        this._sampleCount >= MIN_SAMPLES
      ) {
        completed = {
          x:          this._fixation.x,
          y:          this._fixation.y,
          durationMs: this._fixation.durationMs,
          endTime:    timestampMs,
        };

        // Roll over: start a new fixation from the current centroid
        this._fixation    = { x: normX, y: normY, startTime: timestampMs, durationMs: 0 };
        this._sampleCount = 1;
      }
    } else {
      // ── Saccade — break the fixation ─────────────────────────────────────
      this._fixation    = null;
      this._sampleCount = 0;
    }

    this._lastPos = { x: normX, y: normY };
    this._lastTs  = timestampMs;

    return completed;
  }

  /** Hard reset — call between tasks if needed */
  reset() {
    this._fixation    = null;
    this._sampleCount = 0;
    this._lastPos     = null;
    this._lastTs      = null;
  }
}
