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

  /**
   * calibrationAttempts — one record per calibration attempt the participant
   * made, in order, including attempts that were abandoned or crashed before
   * completing (those just have completedAt: null). This is what lets you
   * count calibration attempts even for participants who never finished
   * the experiment.
   * Schema: [{attempt, startedAt, completedAt, meanError, maxError, passedGate}]
   */
  calibrationAttempts:      [],

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
  /**
   * satisfaction — post-task rating of the JIT assistance feature itself
   * (distinct from nasaTLX, which rates the underlying task workload).
   * Schema: { timestamp, responses: { overall, timely, relevant } }
   * Each response is an integer 1-7 (7-point Likert).
   */
  satisfaction:             null,

  // ── Intervention events ─────────────────────────────────────────────────────
  /**
   * interventionEvents — log of all intervention decisions and outcomes
   * Schema: [{ type, subject_id, condition, task_id, aoi_type, sa_level, arm_id, arm_family, timestamp }]
   *
   * Includes two upstream classifier-firing types, logged from
   * liveClassifier.js BEFORE the intervention engine runs, so actual
   * fires can be compared against gated attempts for an over/underfiring
   * rate. Cooldown between auto-fires is a flat 15s for every task (no
   * per-task scaling):
   *   - 'classifier-fired': threshold crossed, condition is
   *     system_initiated, and 15s had passed since the last auto-fire.
   *   - 'classifier-wanted-to-fire': threshold crossed but gated.
   *     gated_reason is 'user_initiated_condition' (this condition never
   *     auto-fires -- only the button does) or 'cooldown' (system_initiated,
   *     still within 15s of the last auto-fire). Includes the predicted
   *     aoi_id/sa_level it would have used, same as an actual fire.
   *     Logged once per gated episode, not every sample.
   */
  interventionEvents:        [],

  // ── Bandit state ───────────────────────────────────────────────────────────────
  /**
   * banditState — Thompson sampling bandit state for personalized interventions
   * Schema: { [subjectId]: { [saLevel]: { [armId]: { mean, variance, n } } } }
   */
  banditState:              null,

  // ── Full event log ────────────────────────────────────────────────────────
  events:                   [],

  // ── Current task tracking ─────────────────────────────────────────────────────
  currentTaskId:            null,

  // ── Classifier configuration ─────────────────────────────────────────────────
  classifierConfig:          null, // Will be populated with threshold, cooldown, etc.
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