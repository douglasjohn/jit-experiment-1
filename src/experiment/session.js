/**
 * session.js — single source of truth for all collected data.
 *
 * Import this wherever you need to read or write session data.
 * Do NOT use window.sessionData directly; always import from here.
 */
export const sessionData = {
  // ── Participant identifiers ───────────────────────────────────────────────
  participantId:            null,   // local auto-increment ID (user001, user002, …)
  PROLIFIC_PID:             null,
  STUDY_ID:                 null,
  SESSION_ID:               null,
  demographics:             null,

  // ── Timing ────────────────────────────────────────────────────────────────
  startTime:                performance.now(),
  endTime:                  null,
  consentTimestamp:         null,

  // ── Eye-tracking state ────────────────────────────────────────────────────
  gazeInitialized:          false,
  gazeInitializationError:  null,

  // ── Calibration ───────────────────────────────────────────────────────────
  environmentCheck:         null,
  calibrationQuality:       null,

  // ── Gaze data ─────────────────────────────────────────────────────────────
  /**
   * gazeLog — continuous per-sample gaze, ~30 fps during active tasks.
   * This is the PRIMARY data stream for confusion detection.
   * Schema: [{t, x, y, raw_x, raw_y, aoi_id, task_id}]
   *   x / y     : EMA-smoothed, calibration-corrected, normalised (−0.5 to 0.5)
   *   raw_x / y : pre-smoothing (calibration-corrected only)
   */
  gazeLog:                  [],

  /**
   * fixationLog — detected fixation events.
   * Schema: [{t, x, y, duration_ms, aoi_id, task_id}]
   */
  fixationLog:              [],

  /**
   * rawGazeWindows — short raw-gaze bursts captured around probe events
   * (legacy; kept for backward compatibility).
   */
  rawGazeWindows:           [],

  gazeManagerStatus:        [],

  // ── Behavioural data ──────────────────────────────────────────────────────
  mouseEvents:              [],   // [{t, x, y, x_norm, y_norm, task_id}]
  clickEvents:              [],   // [{t, x, y, x_norm, y_norm, target, target_id, task_id}]
  scrollEvents:             [],   // [{t, scrollX, scrollY, target_id, task_id}]  — added for replay

  // ── Task & survey responses ───────────────────────────────────────────────
  taskResponses:            [],
  probeResponses:           [],
  nasaTLX:                  null,

  // ── Full event log ────────────────────────────────────────────────────────
  events:                   [],
};

/**
 * Read Prolific URL params and store them in sessionData.
 * Called once at experiment init.
 */
export function captureProlificParams() {
  const params = new URLSearchParams(window.location.search);
  sessionData.PROLIFIC_PID = params.get('PROLIFIC_PID');
  sessionData.STUDY_ID     = params.get('STUDY_ID');
  sessionData.SESSION_ID   = params.get('SESSION_ID');
}