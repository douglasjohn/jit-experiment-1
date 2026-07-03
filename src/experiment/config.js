// ─────────────────────────────────────────────────────────────────────────────
// EXPERIMENT CONFIGURATION
// Edit this file before deploying. See README.md for full documentation.
// ─────────────────────────────────────────────────────────────────────────────

// Detect researcher mode from URL parameter (?researcher=true)
const params = new URLSearchParams(window.location.search);
const RESEARCHER_MODE = params.has('researcher') && params.get('researcher') === 'true';
const RESEARCHER_TASK = params.get('task') || 'broken-nav';
const SKIP_TO_SCREEN = params.get('screen') || '';

// ─────────────────────────────────────────────────────────────────────────────
// Task timeout configuration and random duration generator
// ─────────────────────────────────────────────────────────────────────────────

const TASK_TIMEOUTS = {
  'broken-nav':           75,
  'ambiguous-form':       90,
  'data-table':           75,
  'math-problem':         90,
  'visual-search':        75,
  'error-diagnosis':      75,
  'instruction-following':75,
  'reading-inference':    120,
};

// Generate a random duration between 16 and (maxTimeout - 15)
const getRandomDuration = (maxTimeout) => {
  const min = 16;
  const max = maxTimeout - 15;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const CONFIG = {

  // ── REQUIRED FOR DEPLOYMENT ───────────────────────────────────────────────

  /**
   * Prolific completion URL.
   * Replace XXXXXXXX with your study's completion code.
   * Leave empty ('') if not using Prolific.
   *
   * Example: 'https://app.prolific.com/submissions/complete?cc=XXXXXXXX'
   */
  PROLIFIC_COMPLETION_URL: 'https://app.prolific.com/submissions/complete?cc=C1ACHGYG',

  /**
   * Server endpoint that receives the JSON data payload via HTTP POST.
   * Leave empty ('') to use the local download fallback (participants
   * download a JSON file which they email back — useful for lab studies).
   *
   * Example: 'https://your-server.com/api/submit'
   */
  DATA_ENDPOINT: '/save-jit',

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
   * Randomly generated between 16 and (AUTO_ADVANCE_TIMEOUT - 15) for each task.
   * The probe fires after (duration × TIME_OVERRUN_FACTOR) seconds.
   */
  TASK_EXPECTED_DURATIONS: {
    'broken-nav':           getRandomDuration(TASK_TIMEOUTS['broken-nav']),
    'ambiguous-form':       getRandomDuration(TASK_TIMEOUTS['ambiguous-form']),
    'data-table':           getRandomDuration(TASK_TIMEOUTS['data-table']),
    'math-problem':         getRandomDuration(TASK_TIMEOUTS['math-problem']),
    'visual-search':        getRandomDuration(TASK_TIMEOUTS['visual-search']),
    'error-diagnosis':      getRandomDuration(TASK_TIMEOUTS['error-diagnosis']),
    'instruction-following':getRandomDuration(TASK_TIMEOUTS['instruction-following']),
    'reading-inference':    getRandomDuration(TASK_TIMEOUTS['reading-inference']),
  },

  /**
   * How much longer than the expected duration before the overrun probe fires.
   * 1.5 = 50% over expected time.
   */
  TIME_OVERRUN_FACTOR: 1,

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
  AUTO_ADVANCE_TIMEOUTS: TASK_TIMEOUTS,

  // ── INTERVENTION CONDITION ────────────────────────────────────────────────
  /**
   * Which JIT intervention arm is active. Change THIS to switch conditions
   * between deployments — nothing else in the codebase should need editing.
   *
   * 'no_help'            — confusion classifier fires, nothing is shown
   *                         (current data collection deployment)
   * 'static_help'         — fixed intervention per (aoiType, saLevel), no learning
   * 'personalized_help'   — bandit selects among 4 candidate arms per
   *                          (aoiType, saLevel), with population-prior +
   *                          per-subject Thompson Sampling updates
   *
   * Can also be overridden per-deployment via URL param for piloting:
   * ?condition=personalized_help
   */
  INTERVENTION_CONDITION: params.get('condition') || 'no_help',

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
   * The server needs to accept these partial uploads. Default: enabled.
   */
  GAZE_STREAMING_ENABLED: true,

  /** Interval between gaze chunk uploads (ms) */
  GAZE_STREAM_INTERVAL_MS: 15000,

  /** Maximum number of gaze samples sent per chunk (0 = unlimited) */
  GAZE_CHUNK_MAX_SAMPLES: 500,

  /** If true, successfully uploaded gaze samples are removed from local memory. */
  GAZE_STREAM_DISCARD_AFTER_UPLOAD: true,

  /** Interval between lightweight session checkpoint POSTs (ms) */
  CHECKPOINT_INTERVAL_MS: 20000,

  // ── INTERNAL (do not edit) ────────────────────────────────────────────────
  RESEARCHER_MODE,
  RESEARCHER_TASK,
  SKIP_TO_SCREEN,
};
