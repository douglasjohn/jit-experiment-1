// ─────────────────────────────────────────────────────────────────────────────
// EXPERIMENT CONFIGURATION
// Edit this file before deploying. See README.md for full documentation.
// ─────────────────────────────────────────────────────────────────────────────

// Detect researcher mode from URL parameter (?researcher=true)
const params = new URLSearchParams(window.location.search);
const RESEARCHER_MODE = params.has('researcher') && params.get('researcher') === 'true';
const RESEARCHER_TASK = params.get('task') || 'broken-nav';
const SKIP_TO_SCREEN = params.get('screen') || '';

export const CONFIG = {

  // ── REQUIRED FOR DEPLOYMENT ───────────────────────────────────────────────

  /**
   * Prolific completion URL.
   * Replace XXXXXXXX with your study's completion code.
   * Leave empty ('') if not using Prolific.
   *
   * Example: 'https://app.prolific.com/submissions/complete?cc=XXXXXXXX'
   */
  PROLIFIC_COMPLETION_URL: 'https://app.prolific.com/submissions/complete?cc=CEJOJZ3V',

  /**
   * Server endpoint that receives the JSON data payload via HTTP POST.
   * Leave empty ('') to use the local download fallback (participants
   * download a JSON file which they email back — useful for lab studies).
   *
   * Example: 'https://your-server.com/api/submit'
   */
  DATA_ENDPOINT: '',

  // ── TASK SETTINGS ─────────────────────────────────────────────────────────

  /**
   * Order in which tasks are presented. Remove a task ID to skip it.
   * All IDs must match keys in TASK_DEFINITIONS in taskRunner.js.
   */
  TASK_ORDER: [
    'broken-nav',
    'error-diagnosis',
    'ambiguous-form',
    'data-table',
    'math-problem',
    'visual-search',
    'instruction-following',
    'reading-inference',
  ],

  /**
   * Expected task durations in seconds (used to trigger the overrun probe).
   * The probe fires after (duration × TIME_OVERRUN_FACTOR) seconds.
   */
  TASK_EXPECTED_DURATIONS: {
    'broken-nav':           90,
    'ambiguous-form':      120,
    'data-table':           90,
    'math-problem':        150,
    'visual-search':        90,
    'error-diagnosis':      90,
    'instruction-following':120,
    'reading-inference':   120,
  },

  /**
   * How much longer than the expected duration before the overrun probe fires.
   * 1.5 = 50% over expected time.
   */
  TIME_OVERRUN_FACTOR: 1.5,

  // ── AUTO-ADVANCE SETTINGS ─────────────────────────────────────────────────

  /**
   * AUTO_ADVANCE_ENABLED: if true, tasks auto-submit after a set duration.
   * Participants will see a countdown timer and explanation.
   * Set to false to disable auto-advance.
   */
  AUTO_ADVANCE_ENABLED: true,

  /**
   * AUTO_ADVANCE_TIMEOUTS: Per-task auto-advance durations in seconds.
   * If a task is not listed, it will not auto-advance (requires explicit submission).
   * Set timeout to 0 to disable auto-advance for that task.
   *
   * Example: { 'broken-nav': 30, 'math-problem': 45 }
   */
  AUTO_ADVANCE_TIMEOUTS: {
    'broken-nav':           300,
    'ambiguous-form':       300,
    'data-table':           300,
    'math-problem':         300,
    'visual-search':        300,
    'error-diagnosis':      5000,  // no auto-advance
    'instruction-following':300,
    'reading-inference':    300,
  },

  // ── STUDY MODE ────────────────────────────────────────────────────────────

  /**
   * 'collection'   — standard data collection (Study 1)
   * 'intervention' — enables the real-time adaptive intervention hooks (Study 2)
   */
  STUDY_MODE: 'collection',

  // ── DEVELOPER / PILOTING OPTIONS ──────────────────────────────────────────

  /**
   * PILOT_MODE: auto-submits each task after 60 seconds.
   * Set to true during piloting to run through the full flow quickly.
   * Always false for real data collection.
   */
  PILOT_MODE: false,

  /**
   * ALLOW_DEGRADED_GAZE: if true, the experiment continues even when
   * eye tracking fails to initialise (e.g. no camera or tracker error).
   * Behavioural data (mouse, clicks, responses) is still collected.
   * Set to false if gaze data is mandatory.
   */
  ALLOW_DEGRADED_GAZE: true,

  // ── CALIBRATION SETTINGS ──────────────────────────────────────────────────
  /**
   * Calibration mode:
   *   'enhanced' — longer dwell (3s), more samples (100+), outlier rejection, MSE < 25% gate
   *   'legacy'   — shorter dwell (2s), fewer samples, no outlier rejection, no MSE gate (bare bones)
   * Both modes show magenta dot and post-calibration stats.
   */
  CALIBRATION_MODE: 'enhanced',

  // ── GAZE STREAMING / UPLOAD (optional) ───────────────────────────────────
  /**
   * When true, the `GazeManager` will POST incremental gaze chunks to
   * `${CONFIG.DATA_ENDPOINT}/gaze-chunk` every `GAZE_STREAM_INTERVAL_MS`.
   * The server needs to accept these partial uploads. Default: disabled.
   */
  GAZE_STREAMING_ENABLED: false,

  /** Interval between gaze chunk uploads (ms) */
  GAZE_STREAM_INTERVAL_MS: 5000,

  /** Maximum number of gaze samples sent per chunk (0 = unlimited) */
  GAZE_CHUNK_MAX_SAMPLES: 0,

  // ── INTERNAL (do not edit) ────────────────────────────────────────────────
  RESEARCHER_MODE,
  RESEARCHER_TASK,
  SKIP_TO_SCREEN,
};
