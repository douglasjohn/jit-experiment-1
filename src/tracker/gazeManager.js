/**
 * gazeManager.js
 *
 * Central coordinator for all gaze-related data collection and analysis.
 *
 * Key capabilities (new / changed from original):
 *  - Continuous per-task gaze log (`sessionData.gazeLog`) at ~30 fps,
 *    not just during probe windows — this is the primary data stream for
 *    real-time confusion detection in Study 2.
 *  - Real-time AOI resolution from every smoothed gaze sample, so
 *    `currentAOI` is always up to date (no longer requires a fixation).
 *  - `setAOIs()` reads bounding boxes from the live DOM, handling both
 *    `id="..."` and `data-aoi="..."` attributes.
 *  - Drift flag passed from pipeline; drifting samples are excluded from
 *    the gaze log and AOI resolution.
 *  - `onGazeSample(cb)` callback for Study 2 real-time confusion classifier.
 *  - `isDrifting` and `currentAOI` properties for the researcher overlay.
 */

import { sessionData } from '../experiment/session';
import { CONFIG } from '../experiment/config';

// Minimum ms between continuous gaze log entries (~30 fps)
const GAZE_LOG_INTERVAL_MS = 33;

export class GazeManager {
  constructor() {
    this.aois              = [];
    this.probeCallbacks    = new Set();
    this.overrunTimers     = new Map();
    this.activeTasks       = new Map();
    this.loggingPaused     = false;
    this.initialized       = false;
    this.rawWindowUntil    = 0;

    // Timestamps for throttling log writes
    this._lastGazeLogAt    = 0;
    this._lastRawSampleAt  = 0;
    // Streaming/upload state
    this._uploadedGazeSampleCount = 0;
    this._gazeChunkSequence = 0;
    this._uploaderIntervalId = null;
    this._uploadInFlight = false;

    // Public state (read by researcher overlay and researcher mode)
    this.currentAOI              = null;
    this.isDrifting              = false;
    this.isTracking              = false;
    this.lastFixationDuration    = 0;

    // Study 2 real-time hook
    this._onGazeSampleCallback   = null;

    // Ensure session arrays exist
    sessionData.fixationLog       = sessionData.fixationLog      || [];
    sessionData.rawGazeWindows    = sessionData.rawGazeWindows   || [];
    sessionData.gazeLog           = sessionData.gazeLog          || [];
    sessionData.gazeManagerStatus = sessionData.gazeManagerStatus || [];
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  init() {
    if (this.initialized) return;
    this.initialized = true;
    sessionData.gazeManagerStatus.push({ type: 'initialized', timestamp: Date.now() });
    // Start optional gaze streaming uploader if configured
    if (CONFIG.GAZE_STREAMING_ENABLED && CONFIG.DATA_ENDPOINT) {
      this.startGazeStreaming();
    }
  }

  // ── AOI management ──────────────────────────────────────────────────────────

  /**
   * Set the active Areas of Interest and compute their viewport bounds from
   * the live DOM. Looks for elements by id first, then by data-aoi attribute.
   * Call this AFTER the task screen is rendered and visible.
   */
  setAOIs(aoiDefs = []) {
    this.aois = (Array.isArray(aoiDefs) ? aoiDefs : []).map(def => {
      const el = document.getElementById(def.id)
               || document.querySelector(`[data-aoi="${def.id}"]`);

      if (!el) {
        console.warn(`GazeManager: AOI element not found — "${def.id}"`);
        return { id: def.id, bounds: null };
      }

      const rect = el.getBoundingClientRect();
      return {
        id: def.id,
        // Convert pixel rect to the same normalised space as gaze coords (-0.5 to 0.5)
        bounds: {
          x: rect.left   / window.innerWidth  - 0.5,
          y: rect.top    / window.innerHeight - 0.5,
          w: rect.width  / window.innerWidth,
          h: rect.height / window.innerHeight,
        },
      };
    });

    const found  = this.aois.filter(a => a.bounds).length;
    const total  = this.aois.length;
    console.log(`GazeManager: ${found}/${total} AOIs resolved from DOM`);
  }

  // ── Task lifecycle ──────────────────────────────────────────────────────────

  setActiveTask(taskId) {
    this.activeTasks.set(taskId, { taskId, startTime: performance.now() });
  }

  clearTaskState(taskId) {
    this.activeTasks.delete(taskId);
    const timerId = this.overrunTimers.get(taskId);
    if (timerId) { clearTimeout(timerId); this.overrunTimers.delete(taskId); }
  }

  getCurrentTaskId() {
    return Array.from(this.activeTasks.values()).pop()?.taskId || null;
  }

  // ── Logging control ─────────────────────────────────────────────────────────

  pauseLogging() {
    this.loggingPaused = true;
    sessionData.gazeManagerStatus.push({ type: 'paused', timestamp: Date.now() });
  }

  resumeLogging() {
    this.loggingPaused = false;
    sessionData.gazeManagerStatus.push({ type: 'resumed', timestamp: Date.now() });
  }

  // ── Core gaze sample handler ────────────────────────────────────────────────

  /**
   * Called for every frame from the pipeline (after smoothing).
   * Handles: drift flag, real-time AOI resolution, continuous gaze log,
   * legacy raw-window log, and the Study 2 real-time confusion hook.
   */
  handleGazeSample({ x, y, rawX, rawY, timestamp, gazeState, isDrift = false }) {
    if (!this.initialized) return;

    this.isTracking = gazeState === 'open';
    this.isDrifting = isDrift;

    // ── Real-time AOI resolution (every sample, not just fixations) ──────────
    if (gazeState === 'open' && !isDrift) {
      const resolved = this.resolveAOI(x, y);
      const newAoiId = resolved?.id || null;

      if (newAoiId !== this.currentAOI) {
        this.currentAOI = newAoiId;
        // Log AOI transitions as events for replay / analysis
        if (!this.loggingPaused) {
          sessionData.events.push({
            type:      'aoi-enter',
            aoi_id:    newAoiId,
            task_id:   this.getCurrentTaskId(),
            timestamp: Date.now(),
          });
        }
      }
    } else if (gazeState !== 'open') {
      this.currentAOI = null;
    }

    const taskId = this.getCurrentTaskId();

    // ── Continuous gaze log (primary data stream — ~30 fps during active tasks) ─
    if (
      taskId &&
      gazeState === 'open' &&
      !isDrift &&
      !this.loggingPaused &&
      timestamp - this._lastGazeLogAt >= GAZE_LOG_INTERVAL_MS
    ) {
      sessionData.gazeLog.push({
        t:       Date.now(),     // epoch ms — aligned with mouseEvents / scrollEvents / events
        x,                       // smoothed, calibration-corrected normalised coord
        y,
        raw_x:   rawX ?? x,      // before EMA smoothing
        raw_y:   rawY ?? y,
        aoi_id:  this.currentAOI,
        task_id: taskId,
      });
      this._lastGazeLogAt = timestamp;
    }

    // ── Legacy raw-window log (short bursts around probe events) ─────────────
    const now = performance.now();
    if (
      now <= this.rawWindowUntil &&
      timestamp - this._lastRawSampleAt >= GAZE_LOG_INTERVAL_MS
    ) {
      sessionData.rawGazeWindows.push({ t: Date.now(), x, y, task_id: taskId });
      this._lastRawSampleAt = timestamp;
    }

    if (this.loggingPaused) return;

    // ── Study 2: real-time confusion hook ─────────────────────────────────────
    if (typeof this._onGazeSampleCallback === 'function' && taskId && !isDrift) {
      this._onGazeSampleCallback({
        x, y,
        aoi_id:   this.currentAOI,
        task_id:  taskId,
        timestamp,
      });
    }
  }

  // ── Fixation handler ────────────────────────────────────────────────────────

  handleFixation(fixation, taskId) {
    if (!this.initialized || this.loggingPaused || !fixation) return;

    const resolvedTaskId = taskId || this.getCurrentTaskId();
    const aoi            = this.resolveAOI(fixation.x, fixation.y);

    this.lastFixationDuration = fixation.durationMs;

    sessionData.fixationLog.push({
      t:           fixation.endTime,
      x:           fixation.x,
      y:           fixation.y,
      duration_ms: fixation.durationMs,
      aoi_id:      aoi?.id || null,
      task_id:     resolvedTaskId,
    });

    if (CONFIG.STUDY_MODE === 'intervention') {
      this._interventionHook({ aoi_id: aoi?.id || null });
    }
  }

  // ── AOI resolution ──────────────────────────────────────────────────────────

  resolveAOI(x, y) {
    return this.aois.find(({ bounds }) => {
      if (!bounds) return false;
      return (
        x >= bounds.x &&
        x <= bounds.x + bounds.w &&
        y >= bounds.y &&
        y <= bounds.y + bounds.h
      );
    }) || null;
  }

  // ── Probe system ────────────────────────────────────────────────────────────

  onProbe(type, callback) {
    if (typeof callback !== 'function') return () => {};
    const sub = { type, callback };
    this.probeCallbacks.add(sub);
    return () => this.probeCallbacks.delete(sub);
  }

  emitProbe(payload) {
    this.probeCallbacks.forEach(({ type, callback }) => {
      if (!type || type === payload.type) callback(payload);
    });
  }

  startOverrunTimer(taskId, expectedSeconds, factor = 1) {
    this.clearTaskState(taskId);
    this.setActiveTask(taskId);

    const delayMs = expectedSeconds * factor * 1000;
    const timerId = window.setTimeout(() => {
      const state = this.activeTasks.get(taskId);
      if (!state) return;
      this.startRawWindow(5000);
      this.emitProbe({ type: 'overrun', taskId, elapsedMs: performance.now() - state.startTime });
      this.overrunTimers.delete(taskId);
    }, delayMs);

    this.overrunTimers.set(taskId, timerId);
  }

  fireEndOfTaskProbe(taskId) {
    const state = this.activeTasks.get(taskId);
    const elapsedMs = state ? performance.now() - state.startTime : 0;
    this.startRawWindow(5000);
    this.emitProbe({ type: 'end-of-task', taskId, elapsedMs });
  }

  startRawWindow(durationMs) {
    this.rawWindowUntil = Math.max(this.rawWindowUntil, performance.now() + durationMs);
  }

  // ── Gaze streaming / upload ──────────────────────────────────────────────

  startGazeStreaming() {
    if (!CONFIG.DATA_ENDPOINT) return;
    if (this._uploaderIntervalId) return; // already running
    const interval = CONFIG.GAZE_STREAM_INTERVAL_MS || 5000;
    this._uploaderIntervalId = setInterval(() => this._uploadGazeChunk(), interval);
    sessionData.events.push({ type: 'gaze-stream-start', timestamp: Date.now() });
  }

  stopGazeStreaming() {
    if (this._uploaderIntervalId) {
      clearInterval(this._uploaderIntervalId);
      this._uploaderIntervalId = null;
      sessionData.events.push({ type: 'gaze-stream-stop', timestamp: Date.now() });
    }
  }

  async _uploadGazeChunk() {
    if (this._uploadInFlight) return;
    if (!CONFIG.DATA_ENDPOINT) return;

    const all = sessionData.gazeLog || [];
    if (!all.length) return; // nothing to upload

    const maxSamples = CONFIG.GAZE_CHUNK_MAX_SAMPLES || 0;
    const chunkSize = maxSamples > 0 ? Math.min(all.length, maxSamples) : all.length;
    const chunk = all.slice(0, chunkSize);
    if (!chunk.length) return;

    const endpoint = `${CONFIG.DATA_ENDPOINT.replace(/\/+$/, '')}/gaze-chunk`;
    const payload = {
      participantId: sessionData.participantId || null,
      participantIDs: {
        prolific_pid: sessionData.PROLIFIC_PID,
        study_id: sessionData.STUDY_ID,
        session_id: sessionData.SESSION_ID,
      },
      chunk_sequence: this._gazeChunkSequence,
      chunk_start_index: this._uploadedGazeSampleCount,
      chunk_length: chunk.length,
      gazeLog: chunk,
      timestamp: Date.now(),
    };

    this._uploadInFlight = true;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      this._uploadedGazeSampleCount += chunk.length;
      this._gazeChunkSequence += 1;
      if (CONFIG.GAZE_STREAM_DISCARD_AFTER_UPLOAD) {
        sessionData.gazeLog.splice(0, chunk.length);
      }

      sessionData.events.push({ type: 'gaze-chunk-sent', timestamp: Date.now(), length: chunk.length });
    } catch (err) {
      console.error('Gaze chunk upload failed:', err);
      sessionData.events.push({ type: 'gaze-chunk-failed', timestamp: Date.now(), error: err.message || String(err) });
    } finally {
      this._uploadInFlight = false;
    }
  }

  async flushAndStopGazeUpload() {
    // Stop periodic uploads then upload any remaining samples synchronously
    this.stopGazeStreaming();
    // Attempt one final upload if there are unsent samples
    await this._uploadGazeChunk();
  }

  // ── Study 2 hooks ───────────────────────────────────────────────────────────

  /**
   * Subscribe to every gaze sample during an active task.
   * Used by the Study 2 real-time confusion classifier.
   *
   * @param {Function} callback — receives { x, y, aoi_id, task_id, timestamp }
   * @returns {Function} unsubscribe
   */
  onGazeSample(callback) {
    this._onGazeSampleCallback = typeof callback === 'function' ? callback : null;
    return () => { this._onGazeSampleCallback = null; };
  }

  _interventionHook(payload) {
    // Stub for Study 2 — plug classifier output here.
    // payload = { aoi_id }
  }
}