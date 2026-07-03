// ─────────────────────────────────────────────────────────────────────────────
// INTERVENTION CONTENT BANK
// Pure content — no selection logic here. Both STATIC_HELP and
// PERSONALIZED_HELP conditions read from this SAME bank, so any difference
// in outcomes between the two conditions is attributable to the SELECTION
// POLICY (fixed vs. bandit), not to different available content.
//
// Edit content here. Edit selection logic in intervention/interventionEngine.js.
// ─────────────────────────────────────────────────────────────────────────────

// AOI types — MUST match whatever string your classifier / fixation
// pipeline actually emits as `aoi_id` / `aoi_type`. Update this list to
// mirror your real taxonomy before running anything.
export const AOI_TYPES = {
  NAVIGATION: 'navigation',
  FORM_FIELD: 'form_field',
  TEXT_CONTENT: 'text_content',
  ICON_BUTTON: 'icon_button',
  DATA_TABLE_CELL: 'data_table_cell',
  DIAGRAM_OR_FIGURE: 'diagram_or_figure',
  UNKNOWN: 'unknown',
};

// Situational awareness levels — mirrors classifier.js SA_NORM keys (1,2,3)
// mapped to Endsley-style labels. Keep numeric keys too since your Python
// classifier reference uses SA_NORM = {1: perception, 2: comprehension, 3: projection}.
export const SA_LEVELS = {
  PERCEPTION: 'perception',      // SA1 — didn't notice/register the element
  COMPREHENSION: 'comprehension', // SA2 — saw it, doesn't understand it
  PROJECTION: 'projection',       // SA3 — understands it, unsure what happens next
};

export const SA_LEVEL_FROM_NUMERIC = { 1: SA_LEVELS.PERCEPTION, 2: SA_LEVELS.COMPREHENSION, 3: SA_LEVELS.PROJECTION };

// Intervention "families" — the four types you described. Each arm below
// declares which family it belongs to purely for your own analysis/logging
// (e.g. "did PREDICTION-type arms outperform EXAMPLE-type arms for SA3?").
export const INTERVENTION_FAMILY = {
  ATTENTIONAL_CUE: 'attentional_cue',   // "look at the bottom-left button"
  HIGHLIGHT_EXPLAIN: 'highlight_explain', // highlight target + short explanation
  PREDICTION: 'prediction',              // "what happens next if X keeps happening"
  WORKED_EXAMPLE: 'worked_example',      // small concrete example
};

/**
 * Arm shape:
 * {
 *   armId: stable id, logged verbatim, used as the bandit's arm key. Keep
 *          these SAME across AOI/SA buckets where semantically equivalent
 *          (e.g. "A" is always "attentional cue") so pooled population
 *          priors generalize across contexts instead of fragmenting.
 *   family: one of INTERVENTION_FAMILY
 *   render: { type, payload } — consumed by UI/overlays.js. `type` picks
 *           the overlay component; `payload` is its props.
 * }
 */

// Helper to keep entries terse.
const arm = (armId, family, type, payload) => ({ armId, family, render: { type, payload } });

// ──────────────────────────────────────────────────────────────────────────
// BANK: keyed by `${aoiType}::${saLevel}` -> array of candidate arms.
// Arm order matters for STATIC_HELP: index 0 is the fixed default.
// ──────────────────────────────────────────────────────────────────────────
const BANK = {};

function setBucket(aoiType, saLevel, arms) {
  BANK[`${aoiType}::${saLevel}`] = arms;
}

// --- NAVIGATION -------------------------------------------------------------
setBucket(AOI_TYPES.NAVIGATION, SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Look here to navigate.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'This is the main menu.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'This element controls where you go next.', durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'E.g. clicking "Next" here moves you forward.', durationMs: 4000 }),
]);

setBucket(AOI_TYPES.NAVIGATION, SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'This menu lets you switch between sections.', style: 'outline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'How this works', body: 'Clicking a section name jumps you straight there.' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'If you keep scrolling past this, you may miss the menu entirely.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'This is a navigation control, not body text.', durationMs: 3000 }),
]);

setBucket(AOI_TYPES.NAVIGATION, SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Clicking this will take you to the next step, not submit your answer.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'This advances the task; it does not save anything.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'What happens next', body: 'After this click, a new task screen loads.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Check what this button says before clicking.', durationMs: 3000 }),
]);

// --- FORM_FIELD ---------------------------------------------------------
setBucket(AOI_TYPES.FORM_FIELD, SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'This field needs an answer.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Enter your response here.', style: 'outline', durationMs: 3000 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: "You haven't filled this in yet.", durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'This is where your numeric answer goes.', durationMs: 3500 }),
]);

setBucket(AOI_TYPES.FORM_FIELD, SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Example: "42" would be a valid entry here.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'This field expects a number, not text.', style: 'outline', durationMs: 4000 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Format expected', body: 'Use digits only, e.g. "1500".' }),
  arm('D', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: "If this is left blank, you won't be able to submit.", durationMs: 4000 }),
]);

setBucket(AOI_TYPES.FORM_FIELD, SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: "Submitting will lock this answer — you can't edit it after.", durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'This determines how your response is scored.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Before you submit', body: 'Double check the value, then continue.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'This is your final answer for this field.', durationMs: 3000 }),
]);

// --- TEXT_CONTENT (e.g. reading comprehension) ---------------------------
setBucket(AOI_TYPES.TEXT_CONTENT, SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-inline',
    { text: 'This is the key term the question refers to.', style: 'underline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'In other words', body: 'This sentence is defining the term used just above it.' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'This detail will matter for the question that follows.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Re-read this sentence carefully.', durationMs: 3000 }),
]);

// --- Fallback bucket: ALWAYS present so lookups never fail. -----------------
const FALLBACK_ARMS = [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'This might be worth a closer look.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: "Not sure what this does? Here's a hint.", style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Take a moment before continuing.', durationMs: 3500 }),
  arm('D', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Consider what this leads to next.', durationMs: 3500 }),
];
[SA_LEVELS.PERCEPTION, SA_LEVELS.COMPREHENSION, SA_LEVELS.PROJECTION].forEach((sa) =>
  setBucket(AOI_TYPES.UNKNOWN, sa, FALLBACK_ARMS)
);

/** Safe lookup — never throws, falls back to UNKNOWN bucket for that SA level. */
export function getArms(aoiType, saLevel) {
  const key = `${aoiType}::${saLevel}`;
  if (BANK[key]) return BANK[key];
  return BANK[`${AOI_TYPES.UNKNOWN}::${saLevel}`];
}

/** STATIC_HELP condition: always the fixed default (index 0) for that bucket. */
export function getStaticArm(aoiType, saLevel) {
  return getArms(aoiType, saLevel)[0];
}