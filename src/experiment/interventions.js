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

// ──────────────────────────────────────────────────────────────────────────
// AOI-SPECIFIC CONTENT
// One editable entry per AOI. These are the three interventions shared by
// static, user-initiated, and system-initiated help. Keep the wording here
// task-specific; the UI supplies the matching FAQ heading for each SA level.
// ──────────────────────────────────────────────────────────────────────────
const AOI_HELP = {};

function setAoiHelp(taskId, entries) {
  AOI_HELP[taskId] = entries;
}

setAoiHelp('broken-nav', {
  'nav-menu': ['Look at the <strong>footer navigation</strong> options.', 'The returns policy is reached from the footer navigation rather than the main menu.', 'After finding the returns policy, select whether you found it in the answer panel.'],
  'shop-home': ['Look at the <strong>footer navigation</strong> options.', 'The page content is not the route to the returns policy; use the footer navigation.', 'After finding the returns policy, select whether you found it in the answer panel.'],
  'bn-help-btn': ['Look at the <strong>footer navigation</strong> options.', 'The Help button is not needed; the returns policy is in the footer navigation.', 'After finding the returns policy, select whether you found it in the answer panel.'],
  'bn-about-link': ['Open the <strong>About</strong> menu in the footer.', 'Open the About menu in the footer to reveal the returns policy link.', 'After finding the returns policy, select whether you found it in the answer panel.'],
  'bn-selection-panel': ['Use the <strong>answer panel</strong> after locating the returns policy.', 'Use this panel only after you have located the returns policy.', 'After finding the returns policy, select whether you found it in the answer panel.'],
});

setAoiHelp('ambiguous-form', {
  'af-field-1': ['Check the <strong>Account nickname</strong> field.', 'This field accepts a nickname; use any plausible value.', 'Continue to the next field once a value is entered.'],
  'af-field-2': ['Check the <strong>Portfolio address</strong> field and its validation message.', 'This field intentionally rejects some endings; enter a plausible address that avoids the listed endings.', 'Continue after entering a value, even if the task feels ambiguous.'],
  'af-field-3': ['Check the <strong>Correspondence preference</strong> field.', 'Enter the contact preference requested by the label.', 'Continue to the next field once a value is entered.'],
  'af-field-4': ['Check the <strong>Notification cadence</strong> dropdown.', 'Choose one of the available cadence options.', 'Continue after selecting an option.'],
  'af-field-5': ['Check the <strong>Account classification</strong> field.', 'Enter a plausible classification value (e.g. VIP, employee, etc...).', 'Continue to the next field once a value is entered.'],
  'af-field-6': ['Check the <strong>Temporary password</strong> field and its validation message.', 'The validator is deliberately confusing; enter a plausible temporary password.', 'Continue after entering a value, then complete the remaining fields.'],
  'af-field-7': ['Check the <strong>Confirm temporary password</strong> field and its validation message.', 'Enter the same password from above.', 'Continue after entering a value, then complete the remaining fields.'],
  'af-field-8': ['Check the <strong>Pager number</strong> field and its validation message.', 'Enter a plausible number that avoids the country codes listed in the message.', 'Continue after entering a value, then submit once every field is complete.'],
});

setAoiHelp('data-table', {
  'dt-header': ['Read the <strong>column headings</strong> before comparing values.', 'Mode share, emissions per kilometre, and weighted emissions are different measures.', 'Use the headings to select the correct values for each answer.'],
  'dt-row-1': ['Look across the <strong>Private Car</strong> row.', 'This row combines the largest mode share with high emissions per kilometre.', 'Compare it with the other rows before answering.'],
  'dt-row-2': ['Look across the <strong>Bus</strong> row.', 'The weighted-emissions value reflects both the bus share and its emissions per kilometre.', 'Use this row when answering the question about bus emissions.'],
  'dt-row-3': ['Look across the <strong>Cycling</strong> row.', 'Cycling has a mode share but zero direct emissions per kilometre.', 'Use that relationship to explain its weighted-emissions result.'],
  'dt-row-4': ['Look across the <strong>Urban Total</strong> row.', 'This row summarises the urban modes above it rather than adding a new transport mode.', 'Use it to check the overall pattern before responding.'],
});

setAoiHelp('math-problem', {
  'mp-problem': ['Find the <strong>patient weight, dosage per kilogram, and daily maximum</strong> in the problem statement.', 'Multiply the weight by the dosage per kilogram to calculate one dose.', 'Compare that result with the tablet sizes and daily maximum.'],
  'mp-table': ['Check the available <strong>tablet sizes</strong> in the table.', 'The table lists the tablet strengths you can use to discuss the calculated dose.', 'Choose the most appropriate strength or combination for your response.'],
  'mp-scratchpad': ['Use the <strong>scratchpad</strong> to record the calculation.', 'Show the weight × dose-per-kilogram calculation so the units remain clear.', 'Use your working to justify the final dose and tablet answer.'],
});

setAoiHelp('visual-search', {
  'vs-legend': ['Read the <strong>legend</strong> to identify each line colour.', 'The legend maps colours to transit lines used in the route diagram.', 'Use those labels when describing the route with the fewest interchanges.'],
  'vs-line-1': ['Trace the <strong>red line</strong> and its station labels.', 'A line is useful when it connects the relevant stations directly or at an interchange.', 'Compare its required changes with the other possible routes.'],
  'vs-line-2': ['Trace the <strong>blue line</strong> and its station labels.', 'A line is useful when it connects the relevant stations directly or at an interchange.', 'Compare its required changes with the other possible routes.'],
  'vs-line-3': ['Trace the <strong>green line</strong> and its station labels.', 'A line is useful when it connects the relevant stations directly or at an interchange.', 'Compare its required changes with the other possible routes.'],
  'vs-line-4': ['Trace the <strong>orange line</strong> and its station labels.', 'A line is useful when it connects the relevant stations directly or at an interchange.', 'Compare its required changes with the other possible routes.'],
  'vs-line-5': ['Trace the <strong>purple line</strong> and its station labels.', 'A line is useful when it connects the relevant stations directly or at an interchange.', 'Compare its required changes with the other possible routes.'],
  'vs-line-6': ['Trace the <strong>pink line</strong> and its station labels.', 'A line is useful when it connects the relevant stations directly or at an interchange.', 'Compare its required changes with the other possible routes.'],
});

setAoiHelp('instruction-following', {
  'if-tab-network': ['Check the <strong>Network</strong> tab and its visible settings.', 'The Network tab contains the security-type setting, not the DNS field.', 'Set or confirm WPA3 here, then move to the tab containing Primary DNS.'],
  'if-tab-security': ['Look for the <strong>lock icon</strong> tab.', 'This tab exposes the Primary DNS setting required by the task.', 'Enter 8.8.8.8 there, then save the configuration.'],
  'if-tab-advanced': ['Check the <strong>Advanced</strong> tab label.', 'Advanced settings are not required for this task.', 'Return to the required settings and save once they are complete.'],
  'if-security': ['Check the <strong>Security Type</strong> control.', 'The required security type is WPA3.', 'After confirming WPA3, enter the required DNS address and save.'],
  'if-dns': ['Check the <strong>Primary DNS</strong> field.', 'The required DNS address is 8.8.8.8.', 'After entering it, click Save Changes.'],
  'if-save': ['Locate the <strong>Save Changes</strong> button.', 'Saving applies the WPA3 and DNS configuration you selected.', 'Click Save Changes after both required settings are complete.'],
});

setAoiHelp('reading-inference', {
  'ri-p1': ['Read the paragraph on <strong>drug absorption and bioavailability</strong>.', 'It explains how a drug enters circulation and which factors affect bioavailability.', 'Use these concepts when answering the absorption question.'],
  'ri-p3': ['Read the paragraph on <strong>individual variation in metabolism</strong>.', 'Genetic polymorphisms and organ impairment can change drug clearance and dose needs.', 'Apply this relationship when explaining which patients need dose adjustment.'],
  'ri-table': ['Read across the <strong>patient-type table</strong>.', 'The table links enzymatic activity with the appropriate dose adjustment and risk.', 'Use the relevant row to support your response about dose adjustment.'],
});

const FAQ_TITLES = {
  [SA_LEVELS.PERCEPTION]: 'Unsure where to look?',
  [SA_LEVELS.COMPREHENSION]: "Don't understand the task?",
  [SA_LEVELS.PROJECTION]: "Don't know what to do next?",
};

function makeAoiArm(saLevel, text) {
  return {
    armId: `sa-${saLevel}`,
    family: saLevel === SA_LEVELS.PERCEPTION ? INTERVENTION_FAMILY.ATTENTIONAL_CUE
      : saLevel === SA_LEVELS.COMPREHENSION ? INTERVENTION_FAMILY.HIGHLIGHT_EXPLAIN
      : INTERVENTION_FAMILY.PREDICTION,
    faqTitle: FAQ_TITLES[saLevel],
    render: { type: 'example-toast', payload: { text, durationMs: 4000 } },
  };
}

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
export function getArms(taskId, saLevel, aoiId = null) {
  const aoiContent = AOI_HELP[taskId]?.[aoiId];
  if (aoiContent) {
    const index = [SA_LEVELS.PERCEPTION, SA_LEVELS.COMPREHENSION, SA_LEVELS.PROJECTION].indexOf(saLevel);
    if (index !== -1) return [makeAoiArm(saLevel, aoiContent[index])];
  }
  const key = `${taskId}::${saLevel}`;
  if (BANK[key]) return BANK[key];
  return BANK[`fallback::${saLevel}`];
}

/** STATIC_HELP condition: always the fixed default (index 0) for that bucket. */
export function getStaticArm(taskId, saLevel, aoiId = null) {
  return getArms(taskId, saLevel, aoiId)[0];
}
