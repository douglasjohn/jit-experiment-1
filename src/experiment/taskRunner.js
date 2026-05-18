/**
 * taskRunner.js
 *
 * Task definitions + flow orchestration.
 *
 * Changes from previous version:
 *  - ambiguous-form: only Email, Password, Confirm password, and Phone number
 *    fields show error messages. Full name, Correspondence preference,
 *    Notification cadence, and Account classification are error-free.
 *  - All tasks validate required fields before allowing submission:
 *      • text / textarea response inputs must be non-empty
 *      • hidden inputs driven by in-stimulus controls (broken-nav) must have a value
 *      • every radio group in the stimulus must have a selection
 *      • ambiguous-form checks all visible form inputs are filled
 *  - setAOIs is called AFTER the task screen is rendered and visible, inside a
 *    requestAnimationFrame, so element bounding boxes are accurate.
 */

import { CONFIG } from './config';
import { sessionData } from './session';
import { showScreen } from './router';
import { showExperienceProbeOverlay } from '../UI/overlays';
import brokenNavShopImage from '../assets/broken-nav.jpg';

// ─────────────────────────────────────────────────────────────────────────────
// TASK DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const TASK_DEFINITIONS = {

  // ── 1. Broken navigation ──────────────────────────────────────────────────
  'broken-nav': {
    id:    'broken-nav',
    type:  'navigation',
    title: 'Broken Navigation',
    instructions: 'Explore the mini website below and try to navigate to the returns policy page.',
    stimulus_html: `
      <div style="font-family:system-ui,sans-serif;color:#111827;display:flex;flex-direction:column;gap:24px;">
        <style>
          .shop-shell{border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.12);background:#fff}
          .shop-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px;padding:24px 32px;background:#111827;color:#fff}
          .shop-logo{font-size:26px;font-weight:700;letter-spacing:.08em}
          .shop-nav{display:flex;align-items:center;gap:18px}
          .shop-link{color:#fff;text-decoration:none;font-size:14px;opacity:.9;background:transparent;border:none;cursor:pointer}
          .shop-link:hover{opacity:1}
          .shop-image{width:100%;display:block;object-fit:cover;height:300px}
          .shop-main{padding:32px}
          .shop-hero h2{margin:0 0 12px;font-size:40px;line-height:1.05}
          .shop-hero p{margin:0 0 18px;color:#475569;font-size:17px;max-width:720px;line-height:1.7}
          .shop-footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:16px;align-items:center;padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0}
          .continue-button{padding:14px 28px;border:none;border-radius:14px;background:#059669;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
          .continue-button:hover{background:#047857}
          .footer-text-link{background:transparent;border:none;color:#9ca3af;font-size:14px;cursor:pointer;padding:0}
          .footer-text-link:hover{color:#4b5563}
          .footer-dropdown{position:relative}
          .footer-dropdown-content{display:none;position:absolute;bottom:100%;right:0;margin-bottom:10px;min-width:180px;background:#111827;color:#fff;border-radius:16px;border:1px solid rgba(255,255,255,.1);padding:8px 0;box-shadow:0 20px 50px rgba(0,0,0,.18);z-index:5}
          .footer-dropdown.open .footer-dropdown-content{display:block}
          .footer-dropdown-item{display:block;width:100%;padding:10px 16px;color:#e5e7eb;text-align:left;background:transparent;border:none;cursor:pointer;font-size:14px}
          .footer-dropdown-item:hover{background:rgba(255,255,255,.08)}
          .bn-popup{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.45)}
          .bn-popup-content{width:100%;max-width:420px;background:#fff;border-radius:22px;padding:28px;box-shadow:0 24px 60px rgba(15,23,42,.18);text-align:left}
          .bn-popup-content h3{margin-top:0;font-size:22px}
          .bn-popup-content p{margin:14px 0 22px;color:#475569;line-height:1.7}
          .nav-choice{padding:18px 16px;border-radius:18px;border:1px solid #d1d5db;background:#f8fafc;font-size:16px;font-weight:700;cursor:pointer;color:#111827;text-align:center;transition:transform .15s,border-color .15s,background .15s;width:100%}
          .nav-choice:hover{transform:translateY(-2px);border-color:#4f46e5}
          .nav-choice.selected{background:#4f46e5;color:#fff;border-color:#4338ca}
        </style>

        <!-- ① The shop — shown first -->
        <div class="shop-shell">
          <div class="shop-header">
            <div class="shop-logo">Glimmer Goods</div>
            <nav class="shop-nav" data-aoi="nav-menu">
              <a class="shop-link" href="#" onclick="return false;">Home</a>
              <a class="shop-link" href="#" onclick="return false;">Shop</a>
              <button class="shop-link" id="bn-help-btn" onclick="document.getElementById('bn-help-popup').style.display='flex';return false;">Help</button>
            </nav>
          </div>

          <img class="shop-image" src="${brokenNavShopImage}" alt="Shopfront" />

          <div class="shop-main">
            <div id="shop-home" class="shop-hero">
              <h2>Welcome to Glimmer Goods</h2>
              <p>We've redesigned the shopping experience to feel more polished and easier to navigate. Your goal is to find the returns policy.</p>
              <button type="button" class="continue-button" onclick="return false;">Begin</button>
            </div>
          </div>

          <div class="shop-footer">
            <div class="footer-dropdown" id="bn-about-dropdown">
              <button type="button" class="footer-text-link" id="bn-about-link"
                onclick="document.getElementById('bn-about-dropdown').classList.toggle('open');return false;">about</button>
              <div class="footer-dropdown-content">
                <button type="button" class="footer-dropdown-item"
                  onclick="document.getElementById('bn-aboutus-popup').style.display='flex';document.getElementById('bn-about-dropdown').classList.remove('open');return false;">About us</button>
                <button type="button" class="footer-dropdown-item"
                  onclick="document.getElementById('bn-contact-popup').style.display='flex';document.getElementById('bn-about-dropdown').classList.remove('open');return false;">Contact</button>
                <button type="button" class="footer-dropdown-item"
                  onclick="document.getElementById('bn-loyalty-popup').style.display='flex';document.getElementById('bn-about-dropdown').classList.remove('open');return false;">Loyalty program</button>
                <button type="button" class="footer-dropdown-item"
                  onclick="document.getElementById('bn-returns-popup').style.display='flex';document.getElementById('bn-about-dropdown').classList.remove('open');return false;">Returns policy</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ② Answer panel — shown BELOW the shop -->
        <div id="bn-selection-panel" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:20px;padding:22px;">
          <h3 style="margin:0 0 8px;font-size:20px;color:#111827;">Which option did you choose?</h3>
          <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
            Select the option that best describes what happened during your navigation attempt.
          </p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
            <button type="button" class="nav-choice" id="bn-yes"
              onclick="document.getElementById('broken-nav-answer').value='Yes';document.querySelectorAll('.nav-choice').forEach(b=>b.classList.remove('selected'));this.classList.add('selected');document.getElementById('bn-status').textContent='✓ Selected: Yes — I found it';">
              ✓ Yes — I found it
            </button>
            <button type="button" class="nav-choice" id="bn-no"
              onclick="
                document.getElementById('broken-nav-answer').value='No';
                document.querySelectorAll('.nav-choice').forEach(b=>b.classList.remove('selected'));
                this.classList.add('selected');
                document.getElementById('bn-status').textContent = "✓ Selected: No — I couldn't find it";
              ">
              ✗ No — I couldn't find it
            </button>
            <button type="button" class="nav-choice" id="bn-gaveup"
              onclick="document.getElementById('broken-nav-answer').value='I gave up';document.querySelectorAll('.nav-choice').forEach(b=>b.classList.remove('selected'));this.classList.add('selected');document.getElementById('bn-status').textContent='✓ Selected: I gave up';">
              ↩ I gave up
            </button>
          </div>
          <p id="bn-status" style="margin:12px 0 0;font-size:13px;color:#6b7280;font-weight:500;">No selection yet.</p>
          <input type="hidden" id="broken-nav-answer" value="" />
        </div>
      </div>

      <!-- Popups (position:fixed — float above everything) -->
      <div id="bn-help-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Help</h3><p>Help is currently unavailable.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-help-popup').style.display='none';return false;">Close</button></div></div>
      <div id="bn-aboutus-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>About us</h3><p>Glimmer Goods launched to explore how people use navigation labels and hidden menus in shopping experiences.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-aboutus-popup').style.display='none';return false;">Close</button></div></div>
      <div id="bn-contact-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Contact</h3><p>Email support@glimmergoods.example or call +1 (555) 123-4567.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-contact-popup').style.display='none';return false;">Close</button></div></div>
      <div id="bn-loyalty-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Loyalty program</h3><p>Join our loyalty program for early access to sales, bonus points, and exclusive offers.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-loyalty-popup').style.display='none';return false;">Close</button></div></div>
      <div id="bn-returns-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Returns policy</h3><p>The returns policy is currently inaccessible. Please contact us for more information.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-returns-popup').style.display='none';return false;">Close</button></div></div>
    `,
    aois: [
      { id: 'nav-menu' }, { id: 'shop-home' },
      { id: 'bn-help-btn' }, { id: 'bn-about-link' }, { id: 'bn-selection-panel' },
    ],
    questions: [
      { id: 'broken-nav-answer', prompt: 'Which option did you choose?', type: 'hidden' },
    ],
  },

  // ── 2. Ambiguous form ─────────────────────────────────────────────────────
  'ambiguous-form': {
    id:    'ambiguous-form',
    type:  'form',
    title: 'Ambiguous Form',
    instructions: 'Fill out the registration form completely and submit it.',
    stimulus_html: (() => {
      // Fields: hasError drives whether an error span appears on input.
      // Per spec: Full name, Correspondence preference, Notification cadence,
      // and Account classification have NO errors. The other four do.
      const fields = [
        { label: 'Full name',                 type: 'text',   hasError: false },
        { label: 'Email address',             type: 'text',   hasError: true,  error: '.net, .mail, and .gov are not permitted' },
        { label: 'Correspondence preference', type: 'text',   hasError: false },
        { label: 'Notification cadence',      type: 'select', hasError: false,
          options: ['Choose cadence', 'steady', 'never', 'rapid', 'bi-weekly', 'daily'] },
        { label: 'Account classification',    type: 'text',   hasError: false },
        { label: 'Password',                  type: 'text',   hasError: true,  error: 'Invalid value — check format' },
        { label: 'Confirm password',          type: 'text',   hasError: true,  error: 'Invalid value — check format' },
        { label: 'Phone number',              type: 'text',   hasError: true,  error: 'Include country code. +3, +111, +625, & +332 are not permitted.' },
      ];

      const rows = fields.map((f, i) => {
        const id   = `af-field-${i + 1}`;
        const errorSpan = f.hasError
          ? `<span id="${id}-error" style="display:none;color:#dc2626;font-size:13px;margin-top:4px;">${f.error}</span>`
          : '';

        let input;
        if (f.type === 'select') {
          const opts = f.options.map((o, oi) =>
            `<option value="${oi === 0 ? '' : o}">${o}</option>`
          ).join('');
          // No error on select — just track focus for dwell
          input = `<select id="${id}" name="${id}"
            style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:12px;font-size:15px;background:#fff;"
            onfocus="window.taskDwellStart?.('${id}')" onblur="window.taskDwellEnd?.('${id}')">
            ${opts}
          </select>`;
        } else {
          // For error fields show the error span the moment there is any value,
          // mimicking a confusing validator that rejects all input.
          const onInput = f.hasError
            ? `oninput="const e=document.getElementById('${id}-error');if(e)e.style.display=this.value.trim()?'block':'none';"`
            : '';
          input = `<input id="${id}" name="${id}" type="text"
            style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:12px;font-size:15px;box-sizing:border-box;"
            onfocus="window.taskDwellStart?.('${id}')" onblur="window.taskDwellEnd?.('${id}')"
            ${onInput} />`;
        }

        return `
          <div data-aoi="${id}" style="display:grid;gap:6px;">
            <label for="${id}" style="font-weight:600;color:#111827;">${f.label}</label>
            ${input}
            ${errorSpan}
          </div>`;
      }).join('');

      return `
        <div style="font-family:system-ui,sans-serif;color:#111827;border:1px solid #d1d5db;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.12);">
          <div style="padding:28px;background:#fff;">
            <h2 style="margin:0 0 8px;font-size:28px;">Create your account</h2>
            <p style="margin:0 0 24px;color:#475569;line-height:1.7;">Complete all fields below.</p>
            <div id="af-form" style="display:grid;gap:18px;">${rows}</div>
          </div>
        </div>`;
    })(),
    aois: Array.from({ length: 8 }, (_, i) => ({ id: `af-field-${i + 1}` })),
    questions: [],  // responses collected directly from the form inputs by _getResponses
  },

  // ── 3. Data table ─────────────────────────────────────────────────────────
  'data-table': {
    id:    'data-table',
    type:  'table',
    title: 'Data Table Analysis',
    instructions: 'Analyse the table and answer the questions below.',
    stimulus_html: `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#f0fdf4;font-family:system-ui,sans-serif;">
        <table data-aoi="dt-header" style="width:100%;border-collapse:collapse;font-size:14px;text-align:left;">
          <thead>
            <tr style="background:#dcfce7;border-bottom:2px solid #86efac;">
              <th style="padding:12px;border:1px solid #d1d5db;">Transport Mode</th>
              <th style="padding:12px;border:1px solid #d1d5db;text-align:right;">Mode Share (%)</th>
              <th style="padding:12px;border:1px solid #d1d5db;text-align:right;">Emissions (g CO₂/km)</th>
              <th style="padding:12px;border:1px solid #d1d5db;text-align:right;">Weighted Emissions (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr data-aoi="dt-row-1" style="border-bottom:1px solid #d1d5db;"><td style="padding:12px;border:1px solid #d1d5db;">Private Car</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">58%</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">192</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">71.2%</td></tr>
            <tr data-aoi="dt-row-2" style="border-bottom:1px solid #d1d5db;"><td style="padding:12px;border:1px solid #d1d5db;">Bus</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">22%</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">54</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">15.4%</td></tr>
            <tr data-aoi="dt-row-3" style="border-bottom:1px solid #d1d5db;"><td style="padding:12px;border:1px solid #d1d5db;">Cycling</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">12%</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">0</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">0%</td></tr>
            <tr data-aoi="dt-row-4" style="background:#fafafa;"><td style="padding:12px;border:1px solid #d1d5db;"><strong>Urban Total</strong></td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;"><strong>92%</strong></td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;"><strong>—</strong></td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;"><strong>86.6%</strong></td></tr>
          </tbody>
        </table>
      </div>`,
    aois: [
      { id: 'dt-header' }, { id: 'dt-row-1' }, { id: 'dt-row-2' },
      { id: 'dt-row-3' }, { id: 'dt-row-4' },
    ],
    questions: [
      { id: 'dt-q1', prompt: 'Which transport mode has the highest emissions per kilometre?', type: 'text' },
      { id: 'dt-q2', prompt: 'What percentage of total urban emissions does the bus contribute?', type: 'text' },
      { id: 'dt-q3', prompt: 'Why might cycling show 0% weighted emissions despite its mode share?', type: 'textarea' },
    ],
  },

  // ── 4. Math problem ───────────────────────────────────────────────────────
  'math-problem': {
    id:    'math-problem',
    type:  'calculation',
    title: 'Medication Dosage Calculation',
    instructions: 'Solve the multi-step problem. Use the scratchpad to show your working.',
    stimulus_html: `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#fff7ed;font-family:system-ui,sans-serif;">
        <div data-aoi="mp-problem" style="margin-bottom:20px;">
          <h3 style="margin:0 0 12px;font-size:18px;color:#92400e;">Problem</h3>
          <p style="margin:0;line-height:1.7;color:#78350f;">
            A patient weighs 72 kg and needs an antibiotic injection. The prescribed dosage is
            15 mg per kilogram of body weight. Available tablets come in 250 mg, 500 mg, and
            1000 mg sizes. The maximum daily dose is 4800 mg.
          </p>
        </div>
        <div data-aoi="mp-table" style="margin-bottom:20px;padding:16px;background:#fef3c7;border-radius:8px;border:1px solid #fbbf24;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr style="border-bottom:1px solid #fbbf24;"><th style="padding:8px;text-align:left;color:#92400e;">Tablet Size</th><th style="padding:8px;text-align:center;color:#92400e;">Available</th></tr>
            <tr style="border-bottom:1px solid #fbbf24;"><td style="padding:8px;">250 mg</td><td style="padding:8px;text-align:center;">✓</td></tr>
            <tr style="border-bottom:1px solid #fbbf24;"><td style="padding:8px;">500 mg</td><td style="padding:8px;text-align:center;">✓</td></tr>
            <tr><td style="padding:8px;">1000 mg</td><td style="padding:8px;text-align:center;">✓</td></tr>
          </table>
        </div>
        <div data-aoi="mp-scratchpad">
          <label for="mp-scratch" style="display:block;font-weight:600;margin-bottom:8px;color:#92400e;">Scratchpad (show your calculations):</label>
          <textarea id="mp-scratch" style="width:100%;height:100px;padding:12px;border:1px solid #fbbf24;border-radius:8px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
        </div>
      </div>`,
    aois: [{ id: 'mp-problem' }, { id: 'mp-table' }, { id: 'mp-scratchpad' }],
    questions: [
      { id: 'mp-q1', prompt: 'How many mg should be administered per dose?', type: 'text' },
      { id: 'mp-q2', prompt: 'Which tablet size(s) deliver this dose most efficiently?', type: 'text' },
      { id: 'mp-q3', prompt: 'Does this dose exceed the daily maximum of 4800 mg?', type: 'text' },
    ],
  },

  // ── 5. Visual search ──────────────────────────────────────────────────────
  'visual-search': {
    id:    'visual-search',
    type:  'search',
    title: 'Transit Network Analysis',
    instructions: 'Study the transit map and answer the question about the optimal route.',
    stimulus_html: `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#eff6ff;font-family:system-ui,sans-serif;position:relative;">
        <div data-aoi="vs-legend" style="position:absolute;top:36px;right:36px;padding:12px;background:#fff;border:1px solid #d1d5db;border-radius:8px;font-size:12px;z-index:1;">
          <div style="margin-bottom:8px;font-weight:600;">Legend</div>
          <div style="display:flex;gap:8px;flex-direction:column;">
            <div style="display:flex;align-items:center;gap:6px;"><div style="width:16px;height:3px;background:#ef4444;"></div><span>Line 1 (Red)</span></div>
            <div style="display:flex;align-items:center;gap:6px;"><div style="width:16px;height:3px;background:#3b82f6;"></div><span>Line 2 (Blue)</span></div>
            <div style="display:flex;align-items:center;gap:6px;"><div style="width:16px;height:3px;background:#10b981;"></div><span>Line 3 (Green)</span></div>
            <div style="display:flex;align-items:center;gap:6px;"><div style="width:16px;height:3px;background:#f59e0b;"></div><span>Line 4 (Orange)</span></div>
            <div style="display:flex;align-items:center;gap:6px;"><div style="width:16px;height:3px;background:#8b5cf6;"></div><span>Line 5 (Purple)</span></div>
            <div style="display:flex;align-items:center;gap:6px;"><div style="width:16px;height:3px;background:#ec4899;"></div><span>Line 6 (Pink)</span></div>
          </div>
        </div>
        <svg width="100%" height="400" viewBox="0 0 800 400" style="border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;margin-bottom:20px;">
          <g data-aoi="vs-line-1"><polyline points="50,100 150,100 250,150 350,150 450,100" stroke="#ef4444" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="50" cy="100" r="5" fill="#ef4444"/><circle cx="150" cy="100" r="5" fill="#ef4444"/><circle cx="250" cy="150" r="5" fill="#ef4444"/><circle cx="350" cy="150" r="5" fill="#ef4444"/><circle cx="450" cy="100" r="5" fill="#ef4444"/><text x="55" y="95" font-size="11" fill="#1f2937">St.A</text><text x="155" y="95" font-size="11" fill="#1f2937">St.B</text><text x="255" y="145" font-size="11" fill="#1f2937">St.C</text><text x="355" y="145" font-size="11" fill="#1f2937">St.D</text><text x="455" y="95" font-size="11" fill="#1f2937">St.E</text></g>
          <g data-aoi="vs-line-2"><polyline points="100,300 200,250 300,250 400,300 500,250" stroke="#3b82f6" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="100" cy="300" r="5" fill="#3b82f6"/><circle cx="200" cy="250" r="5" fill="#3b82f6"/><circle cx="300" cy="250" r="5" fill="#3b82f6"/><circle cx="400" cy="300" r="5" fill="#3b82f6"/><circle cx="500" cy="250" r="5" fill="#3b82f6"/><text x="105" y="315" font-size="11" fill="#1f2937">St.F</text><text x="205" y="240" font-size="11" fill="#1f2937">St.G</text><text x="305" y="240" font-size="11" fill="#1f2937">St.H</text><text x="405" y="315" font-size="11" fill="#1f2937">St.I</text><text x="505" y="240" font-size="11" fill="#1f2937">St.J</text></g>
          <g data-aoi="vs-line-3"><polyline points="150,200 250,180 350,200 450,200 550,180" stroke="#10b981" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="150" cy="200" r="5" fill="#10b981"/><circle cx="250" cy="180" r="5" fill="#10b981"/><circle cx="350" cy="200" r="5" fill="#10b981"/><circle cx="450" cy="200" r="5" fill="#10b981"/><circle cx="550" cy="180" r="5" fill="#10b981"/><text x="155" y="215" font-size="11" fill="#1f2937">St.K</text><text x="255" y="170" font-size="11" fill="#1f2937">St.L</text><text x="355" y="215" font-size="11" fill="#1f2937">St.M</text><text x="455" y="215" font-size="11" fill="#1f2937">St.N</text><text x="555" y="170" font-size="11" fill="#1f2937">St.O</text></g>
          <g data-aoi="vs-line-4"><polyline points="500,100 550,150 600,150 650,100" stroke="#f59e0b" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="500" cy="100" r="5" fill="#f59e0b"/><circle cx="550" cy="150" r="5" fill="#f59e0b"/><circle cx="600" cy="150" r="5" fill="#f59e0b"/><circle cx="650" cy="100" r="5" fill="#f59e0b"/><text x="505" y="95" font-size="11" fill="#1f2937">St.P</text><text x="555" y="145" font-size="11" fill="#1f2937">St.Q</text><text x="605" y="145" font-size="11" fill="#1f2937">St.R</text><text x="655" y="95" font-size="11" fill="#1f2937">St.S</text></g>
          <g data-aoi="vs-line-5"><polyline points="600,300 650,280 700,300" stroke="#8b5cf6" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="600" cy="300" r="5" fill="#8b5cf6"/><circle cx="650" cy="280" r="5" fill="#8b5cf6"/><circle cx="700" cy="300" r="5" fill="#8b5cf6"/><text x="605" y="315" font-size="11" fill="#1f2937">St.T</text><text x="655" y="270" font-size="11" fill="#1f2937">St.U</text><text x="705" y="315" font-size="11" fill="#1f2937">St.V</text></g>
          <g data-aoi="vs-line-6"><polyline points="350,300 450,330 550,300" stroke="#ec4899" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="350" cy="300" r="5" fill="#ec4899"/><circle cx="450" cy="330" r="5" fill="#ec4899"/><circle cx="550" cy="300" r="5" fill="#ec4899"/><text x="355" y="315" font-size="11" fill="#1f2937">St.W</text><text x="455" y="345" font-size="11" fill="#1f2937">St.X</text><text x="555" y="315" font-size="11" fill="#1f2937">St.Y</text></g>
        </svg>
      </div>`,
    aois: [
      { id: 'vs-legend' }, { id: 'vs-line-1' }, { id: 'vs-line-2' },
      { id: 'vs-line-3' }, { id: 'vs-line-4' }, { id: 'vs-line-5' }, { id: 'vs-line-6' },
    ],
    questions: [
      { id: 'vs-q1', prompt: 'Which line connects Station H to Station X with the fewest interchanges?', type: 'text' },
    ],
  },

  // ── 6. Error diagnosis ────────────────────────────────────────────────────
  'error-diagnosis': {
    id:    'error-diagnosis',
    type:  'debug',
    title: 'JavaScript Error Diagnosis',
    instructions: 'Examine the error and answer all three diagnostic questions.',
    attention_check: true,
    stimulus_html: `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#fef2f2;font-family:system-ui,sans-serif;">
        <div data-aoi="ed-trace" style="padding:16px;background:#1f2937;color:#10b981;border-radius:8px;font-family:'Courier New',monospace;font-size:12px;line-height:1.6;overflow-x:auto;">
          <div style="color:#ef4444;margin-bottom:8px;"><strong>TypeError: Cannot read properties of undefined (reading 'map')</strong></div>
          <div style="color:#9ca3af;">at processUserData (app.js:45:12)</div>
          <div style="color:#9ca3af;">at getUserList (app.js:32:8)</div>
          <div style="color:#9ca3af;">at async fetchAndProcess (app.js:18:5)</div>
          <div style="color:#9ca3af;">at async main (app.js:5:3)</div>
          <div style="margin-top:12px;">
            <div style="color:#6b7280;font-size:11px;"><strong>app.js:43–47</strong></div>
            <div style="margin-top:6px;padding:8px;background:#111827;border-left:3px solid #ef4444;">
              <div><span style="color:#9ca3af;">43:</span> <span style="color:#10b981;">function</span> processUserData(data) {</div>
              <div><span style="color:#9ca3af;">44:</span>   <span style="color:#9ca3af;">// filtering logic</span></div>
              <div style="background:#7f1d1d;"><span style="color:#ef4444;">45:</span>   <span style="color:#f87171;">const result = data.map(item =&gt; ({...item, active: true}));</span></div>
              <div><span style="color:#9ca3af;">46:</span>   <span style="color:#10b981;">return</span> result;</div>
              <div><span style="color:#9ca3af;">47:</span> }</div>
            </div>
          </div>
        </div>

        <div data-aoi="ed-questions" style="display:grid;gap:16px;margin-top:20px;">
          <div style="padding:16px;background:#fef3c7;border-radius:8px;border:1px solid #fcd34d;">
            <p style="margin:0 0 10px;font-weight:600;color:#92400e;">1. What type of error occurred?</p>
            <div style="display:grid;gap:8px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-type" value="syntax" /> Syntax Error</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-type" value="reference" /> Reference Error</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-type" value="type" /> <strong>Type Error</strong></label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-type" value="logic" /> Logic Error</label>
            </div>
          </div>
          <div style="padding:16px;background:#fef3c7;border-radius:8px;border:1px solid #fcd34d;">
            <p style="margin:0 0 10px;font-weight:600;color:#92400e;">2. On which line did the error occur?</p>
            <div style="display:grid;gap:8px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-line" value="32" /> Line 32</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-line" value="45" /> <strong>Line 45</strong></label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-line" value="18" /> Line 18</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-line" value="5" /> Line 5</label>
            </div>
          </div>
          <div style="padding:16px;background:#dbeafe;border-radius:8px;border:1px solid #93c5fd;">
            <p style="margin:0 0 10px;font-weight:600;color:#1e40af;">
              3. <span style="background:#fef08a;padding:2px 6px;border-radius:4px;">Attention check: for this question only, please select option C.</span>
              What is the most likely root cause?
            </p>
            <div style="display:grid;gap:8px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-cause" value="a" /> <strong>A:</strong>&nbsp;data is null or undefined when passed to processUserData()</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-cause" value="b" /> <strong>B:</strong>&nbsp;map() does not exist in this JS version</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-cause" value="c" /> <strong style="color:#dc2626;">C:</strong>&nbsp;A syntax error in the function declaration</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="ed-error-cause" value="d" /> <strong>D:</strong>&nbsp;The item variable is not defined</label>
            </div>
          </div>
        </div>
      </div>`,
    aois: [{ id: 'ed-trace' }, { id: 'ed-questions' }],
    // Radio values collected by _getResponses via querySelectorAll; no text fields needed
    questions: [],
  },

  // ── 7. Instruction following ──────────────────────────────────────────────
  'instruction-following': {
    id:    'instruction-following',
    type:  'following',
    title: 'Router Configuration',
    instructions: 'Configure the router: set Security Type to WPA3, enter DNS 8.8.8.8, then click Save Changes.',
    attention_check: true,
    stimulus_html: `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#eef2ff;font-family:system-ui,sans-serif;">
        <div style="max-width:700px;margin:0 auto;">
          <div style="background:#fff;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1);">
            <div style="display:flex;border-bottom:2px solid #d1d5db;background:#f9fafb;" id="if-tabs">
              <button data-tab="0" style="flex:1;padding:16px;background:#fff;border:none;border-bottom:3px solid #4f46e5;cursor:pointer;font-weight:600;color:#1f2937;" data-aoi="if-tab-network">Network</button>
              <button data-tab="1" style="flex:1;padding:16px;background:#f9fafb;border:none;cursor:pointer;font-size:20px;color:#6b7280;" data-aoi="if-tab-security">🔒</button>
              <button data-tab="2" style="flex:1;padding:16px;background:#f9fafb;border:none;cursor:pointer;font-weight:600;color:#6b7280;" data-aoi="if-tab-advanced">Advanced</button>
            </div>
            <div id="if-panel-0" style="padding:24px;display:block;">
              <div style="display:grid;gap:16px;">
                <div><label style="display:block;font-weight:600;margin-bottom:6px;">WiFi SSID</label><input type="text" value="GuestNetwork" disabled style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;box-sizing:border-box;"/></div>
                <div data-aoi="if-security"><label style="display:block;font-weight:600;margin-bottom:6px;">Security Type</label><select id="if-security-select" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;"><option>WEP</option><option>WPA2</option><option selected>WPA3</option></select></div>
              </div>
            </div>
            <div id="if-panel-1" style="padding:24px;display:none;">
              <div style="display:grid;gap:16px;">
                <div data-aoi="if-dns"><label style="display:block;font-weight:600;margin-bottom:6px;">Primary DNS</label><input id="if-dns-input" type="text" placeholder="8.8.8.8" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"/></div>
                <div><label style="display:block;font-weight:600;margin-bottom:6px;">Secondary DNS</label><input type="text" value="8.8.4.4" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"/></div>
                <div><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" checked style="width:18px;height:18px;"/> Enable DoH (DNS over HTTPS)</label></div>
              </div>
            </div>
            <div id="if-panel-2" style="padding:24px;display:none;">
              <div><label style="display:block;font-weight:600;margin-bottom:6px;">Channel Width</label><select style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;"><option>20 MHz</option><option selected>40 MHz</option><option>80 MHz</option></select></div>
            </div>
            <div style="padding:24px;background:#f9fafb;border-top:1px solid #d1d5db;display:flex;gap:12px;justify-content:flex-end;">
              <button data-aoi="if-save" id="if-save-btn"
                style="padding:10px 24px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;transition:background .2s;"
                onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'"
                onclick="this.textContent='✓ Saved';this.style.background='#059669';setTimeout(()=>{this.textContent='Save Changes';this.style.background='#4f46e5';},2000);">
                Save Changes
              </button>
              <button style="padding:10px 24px;background:#f3f4f6;color:#1f2937;border:1px solid #d1d5db;border-radius:6px;font-weight:600;cursor:pointer;">Cancel</button>
            </div>
          </div>
        </div>
        <script>
          (function(){
            const panels=[document.getElementById('if-panel-0'),document.getElementById('if-panel-1'),document.getElementById('if-panel-2')];
            document.getElementById('if-tabs').querySelectorAll('button').forEach((btn,idx)=>{
              btn.onclick=()=>{
                panels.forEach(p=>p.style.display='none');
                panels[idx].style.display='block';
                document.getElementById('if-tabs').querySelectorAll('button').forEach(b=>{b.style.background='#f9fafb';b.style.borderBottom='none';b.style.color='#6b7280';});
                btn.style.background='#fff';btn.style.borderBottom='3px solid #4f46e5';btn.style.color='#1f2937';
              };
            });
          })();
        <\/script>
      </div>`,
    aois: [
      { id: 'if-tab-network' }, { id: 'if-tab-security' }, { id: 'if-tab-advanced' },
      { id: 'if-security' }, { id: 'if-dns' }, { id: 'if-save' },
    ],
    questions: [
      { id: 'if-q1', prompt: 'What security type did you select in the Network tab?', type: 'text' },
      { id: 'if-q2', prompt: 'What DNS server address did you enter?', type: 'text' },
      { id: 'if-q3', prompt: 'Did you click "Save Changes"? (yes / no)', type: 'text' },
    ],
  },

  // ── 8. Reading inference ──────────────────────────────────────────────────
  'reading-inference': {
    id:    'reading-inference',
    type:  'reading',
    title: 'Pharmacokinetics: Drug Absorption & Metabolism',
    instructions: 'Read the passage carefully, then answer all comprehension and inference questions.',
    stimulus_html: `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#f7fee7;font-family:system-ui,sans-serif;max-width:800px;line-height:1.8;">
        <div data-aoi="ri-p1" style="margin-bottom:16px;"><p style="margin:0;color:#1f2937;"><strong>Drug absorption</strong> occurs when a pharmaceutical compound enters the bloodstream from its site of administration. For oral medications, this process begins in the gastrointestinal tract where the drug dissolves and crosses the intestinal epithelium through passive diffusion, active transport, or carrier-mediated mechanisms. The rate and extent of absorption depend on drug solubility, pH stability, and intestinal surface area. Factors such as food intake, gastric pH, and individual genetic variations significantly influence bioavailability — the fraction of the administered dose that reaches systemic circulation.</p></div>
        <div data-aoi="ri-p2" style="margin-bottom:16px;"><p style="margin:0;color:#1f2937;"><strong>First-pass metabolism</strong> refers to the hepatic degradation of a drug after absorption but before it reaches systemic circulation. When a drug is absorbed from the gastrointestinal tract, it enters the portal blood supply and passes through the liver before reaching general circulation. The hepatic cytochrome P450 enzyme system metabolises many drugs, potentially reducing their bioavailability significantly. Some drugs undergo extensive first-pass metabolism (60–90% reduction), necessitating alternative routes such as sublingual or transdermal application.</p></div>
        <div data-aoi="ri-p3" style="margin-bottom:20px;"><p style="margin:0;color:#1f2937;"><strong>Individual variation</strong> in drug metabolism is largely determined by genetic polymorphisms in the cytochrome P450 gene family, particularly CYP2D6 and CYP3A4. Subjects are classified as poor, intermediate, normal (extensive), or ultra-rapid metabolisers based on their enzymatic activity. Elderly patients and those with hepatic or renal impairment typically experience reduced drug clearance, requiring dose adjustment to prevent toxicity. Conversely, ultra-rapid metabolisers may need higher doses to achieve therapeutic effect.</p></div>
        <div data-aoi="ri-table" style="margin:20px 0;padding:16px;background:#dcfce7;border-radius:8px;border:1px solid #86efac;overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#bbf7d0;border-bottom:2px solid #6ee7b7;"><th style="padding:10px;text-align:left;color:#15803d;">Patient Type</th><th style="padding:10px;color:#15803d;">Enzymatic Activity</th><th style="padding:10px;color:#15803d;">Dose Adjustment</th><th style="padding:10px;color:#15803d;">Risk</th></tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid #86efac;"><td style="padding:10px;">Poor Metabolisers</td><td style="padding:10px;">Very Low</td><td style="padding:10px;color:#dc2626;font-weight:600;">Reduce 50–75%</td><td style="padding:10px;">High (Toxicity)</td></tr>
              <tr style="border-bottom:1px solid #86efac;"><td style="padding:10px;">Intermediate Metabolisers</td><td style="padding:10px;">Low</td><td style="padding:10px;color:#f59e0b;font-weight:600;">Reduce 25–50%</td><td style="padding:10px;">Moderate</td></tr>
              <tr style="border-bottom:1px solid #86efac;"><td style="padding:10px;">Normal (Extensive)</td><td style="padding:10px;">Normal</td><td style="padding:10px;color:#10b981;font-weight:600;">Standard dose</td><td style="padding:10px;">Low</td></tr>
              <tr><td style="padding:10px;">Ultra-rapid Metabolisers</td><td style="padding:10px;">Very High</td><td style="padding:10px;color:#3b82f6;font-weight:600;">Increase 50–100%</td><td style="padding:10px;">Low (Therapeutic Failure)</td></tr>
            </tbody>
          </table>
        </div>
      </div>`,
    aois: [{ id: 'ri-p1' }, { id: 'ri-p2' }, { id: 'ri-p3' }, { id: 'ri-table' }],
    questions: [
      { id: 'ri-q1', prompt: 'Which enzyme system is primarily responsible for hepatic drug metabolism?', type: 'text' },
      { id: 'ri-q2', prompt: 'Which patient population should most likely receive a dose adjustment, and why?', type: 'textarea' },
    ],
  },

}; // end TASK_DEFINITIONS

// ─────────────────────────────────────────────────────────────────────────────
// TASK RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export function initTaskRunner(gazeManager) {
  const tasks = CONFIG.TASK_ORDER.map(id => TASK_DEFINITIONS[id]).filter(Boolean);

  let currentTaskIndex = 0;
  let currentTask      = null;
  let currentTaskStart = null;
  let pilotTimeout     = null;
  let endOfTaskResolve = null;

  // ── Probe subscriptions ───────────────────────────────────────────────────
  gazeManager.onProbe('overrun', async (payload) => {
    if (!currentTask || payload.taskId !== currentTask.id) return;
    await _handleOverrunProbe(payload);
  });
  gazeManager.onProbe('end-of-task', async (payload) => {
    if (!currentTask || payload.taskId !== currentTask.id) return;
    await _handleEndOfTaskProbe(payload);
  });

  // ── Dwell tracking ────────────────────────────────────────────────────────
  function _initDwellTracking() {
    window.taskDwellRecords = {};
    window.taskDwellStart   = (id) => {
      const r = window.taskDwellRecords[id] || { total: 0, current: null };
      if (r.current === null) r.current = Date.now();
      window.taskDwellRecords[id] = r;
    };
    window.taskDwellEnd = (id) => {
      const r = window.taskDwellRecords[id];
      if (!r || r.current === null) return;
      r.total += Date.now() - r.current;
      r.current = null;
      window.taskDwellRecords[id] = r;
    };
    window.taskDwellFinalize = () => {
      const now = Date.now();
      const recs = window.taskDwellRecords || {};
      Object.keys(recs).forEach(id => {
        const r = recs[id];
        if (r.current !== null) { r.total += now - r.current; r.current = null; }
      });
      return recs;
    };
  }

  function _getDwellFlaggedFields() {
    const recs = window.taskDwellFinalize?.() ?? {};
    return Object.entries(recs).filter(([, r]) => r.total >= 8000).map(([id]) => id);
  }

  function _clearTimers() {
    if (pilotTimeout) { clearTimeout(pilotTimeout); pilotTimeout = null; }
  }

  function _logEvent(type, extra = {}) {
    sessionData.events.push({ type, task_id: currentTask?.id || null, timestamp: Date.now(), ...extra });
  }

  // ── Validation ────────────────────────────────────────────────────────────
  /**
   * Returns an array of error message strings (empty = valid).
   * Checks:
   *   (a) Non-hidden text/textarea response fields
   *   (b) Hidden inputs driven by in-stimulus controls (broken-nav)
   *   (c) Radio groups present in the stimulus
   *   (d) All visible form inputs for ambiguous-form
   */
  function _validateResponses() {
    const msgs = new Set();

    // (a) Rendered response form inputs
    const form = document.getElementById('task-response-form');
    if (form) {
      form.querySelectorAll('input[type="text"], textarea').forEach(inp => {
        if (!inp.disabled && !inp.value.trim()) {
          msgs.add('Please answer all questions before submitting.');
        }
      });
    }

    // (b) Hidden inputs in stimulus
    if (currentTask) {
      currentTask.questions.filter(q => q.type === 'hidden').forEach(q => {
        const inp = document.getElementById(q.id);
        if (!inp || !inp.value.trim()) {
          msgs.add('Please make a selection before submitting.');
        }
      });
    }

    // (c) Radio groups in the stimulus
    const radioNames = new Set(
      Array.from(document.querySelectorAll('#task-stimulus input[type="radio"]'))
        .map(r => r.name).filter(Boolean)
    );
    radioNames.forEach(name => {
      if (!document.querySelector(`input[type="radio"][name="${name}"]:checked`)) {
        msgs.add('Please answer all questions before submitting.');
      }
    });

    // (d) Ambiguous-form: all visible inputs must be filled
    if (currentTask?.id === 'ambiguous-form') {
      const allFilled = Array.from(
        document.querySelectorAll('#task-stimulus input[type="text"]:not([disabled]), #task-stimulus select:not([disabled])')
      ).every(inp => inp.value.trim() !== '');
      if (!allFilled) msgs.add('Please fill in all form fields before submitting.');
    }

    return [...msgs];
  }

  // ── Collect responses ─────────────────────────────────────────────────────
  function _getResponses() {
    if (!currentTask) return {};

    // Radio groups (anywhere in the task)
    const radios = {};
    document.querySelectorAll('input[type="radio"]:checked').forEach(r => {
      radios[r.name] = r.value;
    });

    // Named question inputs
    const fields = (currentTask.questions || []).reduce((acc, q) => {
      const el = document.getElementById(q.id);
      acc[q.id] = el ? el.value.trim() : null;
      return acc;
    }, {});

    // For ambiguous-form: also capture all af-field values
    if (currentTask.id === 'ambiguous-form') {
      document.querySelectorAll('#task-stimulus [id^="af-field-"]').forEach(el => {
        fields[el.id] = el.value.trim();
      });
    }

    return { ...radios, ...fields };
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function _renderInstructionScreen(task) {
    const el = document.getElementById('screen-task-instruction');
    if (!el) return;

    const attentionBanner = task.attention_check
      ? `<div style="margin-bottom:18px;padding:12px 16px;background:#fef9c3;color:#92400e;border-radius:12px;border:1px solid #facc15;">
           ⚠ This task contains an attention check. Please read carefully before you begin.
         </div>`
      : '';

    el.innerHTML = `
      <div style="max-width:760px;margin:0 auto;text-align:left;padding:28px;">
        <h1 style="margin:0 0 16px;font-size:32px;color:#111827;">${task.title}</h1>
        ${attentionBanner}
        <div style="margin-bottom:24px;color:#374151;line-height:1.75;font-size:16px;">${task.instructions}</div>
        <button id="begin-task-btn" style="
          padding:14px 28px;border:none;border-radius:12px;
          background:#4f46e5;color:#fff;cursor:pointer;font-size:16px;font-weight:600;
          transition:background .2s;"
          onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
          Begin Task →
        </button>
      </div>`;

    document.getElementById('begin-task-btn').onclick = _beginCurrentTask;
  }

  function _renderTaskScreen(task) {
    const el = document.getElementById('screen-task');
    if (!el) return;

    _initDwellTracking();

    const pilotBanner = CONFIG.PILOT_MODE
      ? `<div style="margin-bottom:20px;padding:12px 16px;background:#fef9c3;color:#92400e;border-radius:12px;border:1px solid #facc15;">
           ⏱ Pilot mode — auto-submits after 60 s.
         </div>`
      : '';

    const questionsHtml = (task.questions || [])
      .filter(q => q.type !== 'hidden')
      .map(q => {
        if (q.type === 'textarea') {
          return `<div style="margin-bottom:18px;">
            <label for="${q.id}" style="display:block;margin-bottom:6px;color:#111827;font-weight:600;">${q.prompt}</label>
            <textarea id="${q.id}" rows="4" style="width:100%;min-height:120px;padding:12px;border:1px solid #d1d5db;border-radius:12px;font-size:15px;box-sizing:border-box;"></textarea>
          </div>`;
        }
        return `<div style="margin-bottom:18px;">
          <label for="${q.id}" style="display:block;margin-bottom:6px;color:#111827;font-weight:600;">${q.prompt}</label>
          <input id="${q.id}" type="text" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:12px;font-size:15px;box-sizing:border-box;" />
        </div>`;
      }).join('');

    const progressPct = ((currentTaskIndex + 1) / tasks.length) * 100;

    el.innerHTML = `
      <div style="max-width:900px;margin:0 auto;text-align:left;padding:28px;">

        <div style="margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:14px;color:#6b7280;font-weight:600;">Task Progress</span>
            <span style="font-size:14px;color:#4f46e5;font-weight:700;">${currentTaskIndex + 1} of ${tasks.length}</span>
          </div>
          <div style="width:100%;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
            <div style="width:${progressPct}%;height:100%;background:#4f46e5;transition:width .3s;"></div>
          </div>
        </div>

        ${pilotBanner}

        <div id="task-stimulus" style="margin-bottom:28px;">${task.stimulus_html}</div>

        ${questionsHtml ? `
          <div style="padding:24px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;margin-bottom:24px;">
            <h3 style="margin:0 0 18px;font-size:18px;color:#111827;">Your responses</h3>
            <div id="task-response-form">${questionsHtml}</div>
          </div>
        ` : ''}

        <div id="submit-error" style="display:none;margin-bottom:12px;padding:12px 16px;
          background:#fef2f2;border:1px solid #fecaca;border-radius:8px;
          color:#dc2626;font-size:14px;font-weight:500;"></div>

        <button id="submit-task-btn" style="
          padding:14px 28px;border:none;border-radius:12px;
          background:#059669;color:#fff;cursor:pointer;font-size:16px;font-weight:600;
          transition:background .2s;"
          onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
          Submit Response →
        </button>
      </div>`;

    document.getElementById('submit-task-btn').onclick = (e) => {
      e.preventDefault();
      const errors = _validateResponses();
      const errEl  = document.getElementById('submit-error');
      if (errors.length > 0) {
        if (errEl) { errEl.textContent = errors[0]; errEl.style.display = 'block'; }
        // Scroll error into view
        errEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (errEl) errEl.style.display = 'none';
      _submitResponse(currentTask.id, { responses: _getResponses() });
    };
  }

  // ── Flow ──────────────────────────────────────────────────────────────────
  async function _beginCurrentTask() {
    if (!currentTask) return;

    _logEvent('task-begin', { task_id: currentTask.id });
    currentTaskStart = performance.now();

    gazeManager.setActiveTask(currentTask.id);
    gazeManager.startOverrunTimer(
      currentTask.id,
      CONFIG.TASK_EXPECTED_DURATIONS[currentTask.id],
      CONFIG.TIME_OVERRUN_FACTOR
    );

    _renderTaskScreen(currentTask);
    showScreen('screen-task');

    // AOI bounds must be computed AFTER the task screen is rendered and visible.
    // requestAnimationFrame guarantees the browser has painted the layout.
    requestAnimationFrame(() => {
      gazeManager.setAOIs(currentTask.aois || []);
    });

    if (CONFIG.PILOT_MODE) {
      _clearTimers();
      pilotTimeout = setTimeout(() => {
        _submitResponse(currentTask.id, { responses: _getResponses() }, { autoSubmitted: true });
      }, 60000);
    }
  }

  async function _submitResponse(taskId, responseData = {}, options = {}) {
    if (!currentTask || taskId !== currentTask.id) return;
    _clearTimers();

    const metadata = {
      task_id:              currentTask.id,
      submitted_at:         Date.now(),
      elapsed_ms:           performance.now() - currentTaskStart,
      responses:            responseData.responses || {},
      auto_submitted:       options.autoSubmitted === true,
      attention_check:      !!currentTask.attention_check,
      dwell_flagged_fields: _getDwellFlaggedFields(),
    };

    sessionData.taskResponses = sessionData.taskResponses || [];
    sessionData.taskResponses.push(metadata);
    _logEvent('task-submit', { response_data: metadata });

    const probePromise = new Promise(resolve => { endOfTaskResolve = resolve; });
    gazeManager.fireEndOfTaskProbe(currentTask.id);

    const failsafe = setTimeout(() => {
      if (typeof endOfTaskResolve === 'function') {
        endOfTaskResolve();
        endOfTaskResolve = null;
        gazeManager.clearTaskState(currentTask.id);
        currentTaskIndex += 1;
        loadNextTask();
      }
    }, 45000);

    await probePromise;
    clearTimeout(failsafe);
  }

  async function _handleOverrunProbe(payload) {
    if (!currentTask) return;
    _logEvent('task-overrun-probe', { elapsedMs: payload.elapsedMs });
    await showExperienceProbeOverlay({ taskId: currentTask.id, triggerType: 'overrun', triggerTime: Date.now() });
    showScreen('screen-task');
  }

  async function _handleEndOfTaskProbe(payload) {
    if (!currentTask) return;

    await showExperienceProbeOverlay({ taskId: currentTask.id, triggerType: 'end-of-task', triggerTime: Date.now() });

    if (typeof endOfTaskResolve === 'function') {
      endOfTaskResolve();
      endOfTaskResolve = null;
    }

    gazeManager.clearTaskState(currentTask.id);
    currentTaskIndex += 1;
    window.requestAnimationFrame(() => { loadNextTask(); });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function loadNextTask() {
    if (currentTaskIndex >= tasks.length) {
      showScreen('screen-nasatlx');
      return;
    }
    currentTask = tasks[currentTaskIndex];
    _logEvent('task-load', { task_id: currentTask.id });
    _renderInstructionScreen(currentTask);
    showScreen('screen-task-instruction');
  }

  return { loadNextTask, submitResponse: _submitResponse };
}
