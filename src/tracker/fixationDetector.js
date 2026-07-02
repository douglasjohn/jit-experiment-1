/**
 * fixationDetector.js  —  I-VT (Velocity-Threshold Identification) fixation detector
 *
 * Changes in this version:
 *
 * 1. Gap protection (revised) — gaps >MAX_GAP_MS are still not used to compute
 *    velocity directly, BUT we now check how far gaze moved across the gap.
 *    Small/no displacement → treat as a real blink, preserve the fixation as
 *    before. Large displacement → the gap almost certainly hid a real saccade
 *    (tracking commonly degrades during fast eye movements), so we now BREAK
 *    the fixation here instead of silently carrying it through. This was the
 *    root cause of fixations spanning entire multi-task sessions.
 *
 * 2. Fixation-id lifetime cap — even if velocity never crosses threshold, a
 *    single fixationId is now forcibly retired after MAX_FIXATION_ID_LIFETIME_MS
 *    of continuous rolling. This is a safety net: real single fixations don't
 *    last anywhere near this long, so anything that does is treated as an
 *    algorithm artifact rather than one fixation, regardless of root cause.
 *
 * 3. flushAndReset() — new method to force-end whatever's accumulated right
 *    now (e.g. at a task boundary) and start clean. Call this anywhere a
 *    "fixation" spanning the boundary wouldn't make sense.
 *
 * (Original behaviors retained: rolling emission for AOI logging cadence,
 * MIN_SAMPLES requirement, fixationId/seq tagging for post-hoc merging.)
 */

const MAX_GAP_MS                  = 150;  // gaps larger than this skip velocity calc
const MIN_SAMPLES                 = 3;    // must see this many consecutive slow-velocity samples
const MAX_GAP_DISPLACEMENT        = 0.08; // norm units; bigger jump across a gap = treat as saccade, not blink
const MAX_FIXATION_ID_LIFETIME_MS = 1000; // hard cap on how long one fixationId can span

export class IVTFixationDetector {
  constructor(velocityThreshold = 0.015, minDurationMs = 100) {
    this.velocityThreshold = velocityThreshold;
    this.minDurationMs     = minDurationMs;

    this._fixation    = null;
    this._sampleCount = 0;
    this._lastPos     = null;
    this._lastTs      = null;

    this._fixationIdCounter   = 0;
    this._currentFixationId   = null;
    this._segSeq              = 0;
    this._fixationIdStartedAt = 0;
  }

  _startNewFixation(timestampMs) {
    this._fixationIdCounter  += 1;
    this._currentFixationId   = `fix_${Math.round(timestampMs)}_${this._fixationIdCounter}`;
    this._segSeq              = 0;
    this._fixationIdStartedAt = timestampMs;
  }

  step(normX, normY, timestampMs) {
    if (this._lastPos === null) {
      this._lastPos = { x: normX, y: normY };
      this._lastTs  = timestampMs;
      return null;
    }

    const dt = timestampMs - this._lastTs;

    // ── Gap protection (revised) ────────────────────────────────────────────
    if (dt > MAX_GAP_MS) {
      const gapDx   = normX - this._lastPos.x;
      const gapDy   = normY - this._lastPos.y;
      const gapDist = Math.sqrt(gapDx * gapDx + gapDy * gapDy);

      if (gapDist > MAX_GAP_DISPLACEMENT) {
        // Gaze ended up somewhere far from where it was before tracking was
        // lost. This is almost certainly a real saccade that the dropout
        // hid from velocity-based detection — break the fixation.
        this._fixation          = null;
        this._sampleCount       = 0;
        this._currentFixationId = null;
      } else {
        // Small displacement — genuine blink/dropout, eye landed back near
        // where it left off. Preserve the fixation and its id as before.
        this._sampleCount = Math.max(0, this._sampleCount - 1);
      }

      this._lastPos = { x: normX, y: normY };
      this._lastTs  = timestampMs;
      return null;
    }

    const clampedDt = Math.max(dt, 5);
    const dx       = normX - this._lastPos.x;
    const dy       = normY - this._lastPos.y;
    const velocity = Math.sqrt(dx * dx + dy * dy) / clampedDt;

    let completed = null;

    if (velocity < this.velocityThreshold) {
      if (!this._fixation) {
        this._fixation = { x: normX, y: normY, startTime: timestampMs, durationMs: 0 };
        this._sampleCount = 1;
        this._startNewFixation(timestampMs);
      } else {
        const w = this._fixation.durationMs + dt;
        this._fixation.x = (this._fixation.x * this._fixation.durationMs + normX * dt) / w;
        this._fixation.y = (this._fixation.y * this._fixation.durationMs + normY * dt) / w;
        this._fixation.durationMs = w;
        this._sampleCount++;
      }

      if (
        this._fixation.durationMs >= this.minDurationMs &&
        this._sampleCount >= MIN_SAMPLES
      ) {
        // Lifetime cap: retire this fixationId if it's been rolling too long.
        if (timestampMs - this._fixationIdStartedAt >= MAX_FIXATION_ID_LIFETIME_MS) {
          this._startNewFixation(timestampMs);
        }

        completed = {
          x:           this._fixation.x,
          y:           this._fixation.y,
          durationMs:  this._fixation.durationMs,
          startTime:   this._fixation.startTime,
          endTime:     timestampMs,
          fixationId:  this._currentFixationId,
          seq:         this._segSeq,
          sampleCount: this._sampleCount,
        };
        this._segSeq += 1;

        this._fixation    = { x: normX, y: normY, startTime: timestampMs, durationMs: 0 };
        this._sampleCount = 1;
      }
    } else {
      this._fixation          = null;
      this._sampleCount       = 0;
      this._currentFixationId = null;
    }

    this._lastPos = { x: normX, y: normY };
    this._lastTs  = timestampMs;

    return completed;
  }

  /**
   * Force-end whatever fixation is in progress right now and emit it (even if
   * it's short of minDurationMs/MIN_SAMPLES — flagged `partial: true` so you
   * can filter these out downstream if you don't want them). Fully resets
   * state so the very next sample starts a brand new fixationId.
   *
   * Call this at task boundaries, or anywhere else a fixation spanning the
   * gap wouldn't make conceptual sense.
   */
  flushAndReset(timestampMs) {
    let completed = null;
    if (this._fixation && this._fixation.durationMs > 0) {
      completed = {
        x:           this._fixation.x,
        y:           this._fixation.y,
        durationMs:  this._fixation.durationMs,
        startTime:   this._fixation.startTime,
        endTime:     timestampMs,
        fixationId:  this._currentFixationId,
        seq:         this._segSeq,
        sampleCount: this._sampleCount,
        partial:     true,
      };
    }
    this.reset();
    return completed;
  }

  reset() {
    this._fixation            = null;
    this._sampleCount         = 0;
    this._lastPos             = null;
    this._lastTs              = null;
    this._currentFixationId   = null;
    this._segSeq              = 0;
    this._fixationIdStartedAt = 0;
  }
}