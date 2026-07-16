// ─────────────────────────────────────────────────────────────────────────────
// INTERVENTION CONTENT BANK
// Pure content — no selection logic here. Both STATIC_HELP and
// PERSONALIZED_HELP conditions read from this SAME bank, so any difference
// in outcomes between the two conditions is attributable to the SELECTION
// POLICY (fixed vs. bandit), not to different available content.
//
// Edit content here. Edit selection logic in intervention/interventionEngine.js.
// ─────────────────────────────────────────────────────────────────────────────

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
 *          these SAME across task/SA buckets where semantically equivalent
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
// BANK: keyed by `${taskId}::${saLevel}` -> array of candidate arms.
// Arm order matters for STATIC_HELP: index 0 is the fixed default.
// ──────────────────────────────────────────────────────────────────────────
const BANK = {};

function setBucket(taskId, saLevel, arms) {
  BANK[`${taskId}::${saLevel}`] = arms;
}

// --- broken-nav (navigation task) -------------------------------------------------------------
setBucket('broken-nav', SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Look at the footer area for navigation options.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The "about" dropdown contains the returns policy.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Check the footer at the bottom of the page.', durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Click "about" in the footer, then select "Returns policy".', durationMs: 4000 }),
]);

setBucket('broken-nav', SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The footer dropdown reveals menu options when clicked.', style: 'outline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'How to find returns policy', body: 'Look for the "about" link in the footer area and click it to reveal the returns policy option.' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'If you click the main navigation, you might miss the footer dropdown.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'The returns policy is in the footer, not the main menu.', durationMs: 3000 }),
]);

setBucket('broken-nav', SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Selecting "Returns policy" will show the policy content.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Your final selection is what matters when you submit.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'What happens next', body: 'After finding the returns policy, select whether you found it in the answer panel.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Focus on the footer dropdown, not the Help button.', durationMs: 3000 }),
]);

// --- ambiguous-form (form task) ---------------------------------------------------------
setBucket('ambiguous-form', SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'This field needs to be filled in.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Enter any valid information here.', style: 'outline', durationMs: 3000 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: "You haven't filled this field yet.", durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'You can enter fake information — it won\'t affect the experiment.', durationMs: 3500 }),
]);

setBucket('ambiguous-form', SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Some fields may show validation errors — try different inputs.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Fill all fields to the best of your ability.', style: 'outline', durationMs: 4000 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'About the errors', body: 'Some fields have validation rules that may reject certain inputs. Just fill them out anyway.' }),
  arm('D', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: "All fields must be filled before you can submit.", durationMs: 4000 }),
]);

setBucket('ambiguous-form', SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: "Submitting will complete the form task.", durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Your answers don\'t need to be perfect — just complete the form.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Before you submit', body: 'Make sure all fields have some content, then click submit.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'The task is to complete the form despite any confusing error messages.', durationMs: 3000 }),
]);

// --- data-table (table analysis task) ---------------------------------------------------------
setBucket('data-table', SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Look at the emissions column for each transport mode.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The table shows pre-calculated weighted emissions values.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Compare the emissions values across different modes.', durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Private Car has the highest emissions at 192 g/km.', durationMs: 4000 }),
]);

setBucket('data-table', SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Weighted emissions combine mode share with emissions per km.', style: 'outline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Understanding the table', body: 'The table shows transport modes, their mode share percentages, and their environmental impact in terms of CO₂ emissions.' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Cycling shows 0% weighted emissions because it produces 0 g CO₂/km.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Focus on the relationship between mode share and emissions.', durationMs: 3000 }),
]);

setBucket('data-table', SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'The Urban Total sums the data for all urban transport modes.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Use the table data to answer the question about emissions.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Analyzing the data', body: 'Look for patterns in how different transport modes contribute to overall urban emissions.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Consider which transport mode has the highest environmental impact.', durationMs: 3000 }),
]);

// --- visual-search (transit map task) ----------------------
setBucket('visual-search', SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Each colored line represents a different transit route.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Circles on the map are stations.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Follow the lines to see connections between stations.', durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Use the legend to identify which color corresponds to which line.', durationMs: 4000 }),
]);

setBucket('visual-search', SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'An interchange is where two or more lines meet at the same station.', style: 'outline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Reading the map', body: 'Interchanges allow you to switch between transit lines. Count how many times you need to switch to find the route with fewest interchanges.' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'The route with the fewest interchanges is usually the most direct.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Trace the path from start to end station, counting line switches.', durationMs: 3000 }),
]);

setBucket('visual-search', SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Your answer should specify which line has the fewest interchanges.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Consider both the number of interchanges and the total distance.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Finding the best route', body: 'Compare different possible paths between the start and end stations to find the one with minimal line changes.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Look for direct connections first, then consider one-interchange routes.', durationMs: 3000 }),
]);

// --- math-problem (dosage calculation task) ----------------
setBucket('math-problem', SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Read the problem statement carefully.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The key information is in the first paragraph.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Pay attention to the numbers and units given.', durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Identify the patient weight and dosage per kg first.', durationMs: 4000 }),
]);

setBucket('math-problem', SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Multiply weight by dosage per kg to get the required dose.', style: 'outline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Calculation steps', body: 'Required dose = patient weight (72 kg) × dosage per kg (15 mg/kg).' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'The maximum daily dose is 4800 mg — your calculated dose should be lower.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Use the scratchpad to show your calculations.', durationMs: 3000 }),
]);

setBucket('math-problem', SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Choose tablet sizes that most efficiently deliver the required dose.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Consider combinations of 250 mg, 500 mg, and 1000 mg tablets.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Tablet selection', body: 'For 1080 mg, you could use one 1000 mg tablet plus one 500 mg tablet (total 1500 mg) or other combinations.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Your answer should specify which tablet sizes to use.', durationMs: 3000 }),
]);

// --- instruction-following (router configuration task) ----------
setBucket('instruction-following', SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Click the Security tab (🔒) to access DNS settings.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The DNS settings are in the Security tab, not Network.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Look for the lock icon to find the Security tab.', durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Click the 🔒 button, then find the Primary DNS field.', durationMs: 4000 }),
]);

setBucket('instruction-following', SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The Security tab contains DNS configuration options.', style: 'outline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Router configuration steps', body: '1. Click the Security tab (🔒). 2. Enter 8.8.8.8 in Primary DNS. 3. Click Save Changes.' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'The Network tab only shows WiFi SSID and security type.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'DNS settings are separate from WiFi security type.', durationMs: 3000 }),
]);

setBucket('instruction-following', SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'After setting DNS to 8.8.8.8, click Save Changes to apply.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The Advanced tab is not needed for this configuration.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Completing the task', body: 'Configure DNS in Security tab, then click Save Changes at the bottom.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Your final step is clicking Save Changes.', durationMs: 3000 }),
]);

// --- reading-inference (drug absorption task) ----------------
setBucket('reading-inference', SA_LEVELS.PERCEPTION, [
  arm('A', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Read the passage carefully to understand drug absorption.', durationMs: 3000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'The first paragraph defines what drug absorption means.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Pay attention to the factors that affect bioavailability.', durationMs: 3000 }),
  arm('D', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-toast',
    { text: 'Drug absorption is when a compound enters the bloodstream from its administration site.', durationMs: 4000 }),
]);

setBucket('reading-inference', SA_LEVELS.COMPREHENSION, [
  arm('A', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Bioavailability depends on how much drug reaches systemic circulation.', style: 'outline', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Understanding bioavailability', body: 'Factors like drug solubility, pH stability, and intestinal surface area determine how much drug is absorbed.' }),
  arm('C', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Different administration routes (oral, IV, etc.) affect absorption rates.', durationMs: 4000 }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-arrow',
    { text: 'Focus on the relationship between absorption and bioavailability.', durationMs: 3000 }),
]);

setBucket('reading-inference', SA_LEVELS.PROJECTION, [
  arm('A', INTERVENTION_FAMILY.PREDICTION, 'prediction-toast',
    { text: 'Consider how genetic variations might affect drug metabolism.', durationMs: 4000 }),
  arm('B', INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN, 'highlight-tooltip',
    { text: 'Food intake and gastric pH can influence absorption efficiency.', style: 'pulse', durationMs: 3500 }),
  arm('C', INTERVENTION_FAMILY.WORKED_EXAMPLE, 'example-modal',
    { title: 'Clinical implications', body: 'Understanding absorption helps predict drug effectiveness and potential side effects in different patients.' }),
  arm('D', INTERVENTION_FAMILY.ATTENTIONAL_CUE, 'cue-spotlight',
    { text: 'Apply these concepts to answer questions about specific drugs.', durationMs: 3000 }),
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
  setBucket('fallback', sa, FALLBACK_ARMS)
);

/** Safe lookup — never throws, falls back to fallback bucket for that SA level. */
export function getArms(taskId, saLevel) {
  const key = `${taskId}::${saLevel}`;
  if (BANK[key]) return BANK[key];
  return BANK[`fallback::${saLevel}`];
}

/** STATIC_HELP condition: always the fixed default (index 0) for that bucket. */
export function getStaticArm(taskId, saLevel) {
  return getArms(taskId, saLevel)[0];
}