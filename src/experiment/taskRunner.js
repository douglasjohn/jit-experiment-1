/**
 * taskRunner.js
 *
 * Task definitions + flow orchestration.
 *
 * Changes from previous version:
 * - ambiguous-form: only Email, Password, Confirm password, and Phone number
 * fields show error messages. Full name, Correspondence preference,
 * Notification cadence, and Account classification are error-free.
 * - All tasks validate required fields before allowing submission:
 * • text / textarea response inputs must be non-empty
 * • hidden inputs driven by in-stimulus controls (broken-nav) must have a value
 * • every radio group in the stimulus must have a selection
 * • ambiguous-form checks all visible form inputs are filled
 * - setAOIs is called AFTER the task screen is rendered and visible, inside a
 * requestAnimationFrame, so element bounding boxes are accurate.
 */

import { CONFIG } from './config';
import { sessionData } from './session';
import { showScreen } from './router';
import { showExperienceProbeOverlay } from '../UI/overlays';
import brokenNavShopImage from '../assets/broken-nav.jpg';
import { onConfusionFired } from '../intervention/classifier.js';
import { CONDITIONS } from '../intervention/interventionEngine.js';
import { createLiveConfusionClassifier } from '../intervention/liveClassifier.js';
import { getArms, SA_LEVELS, SA_LEVEL_FROM_NUMERIC } from './interventions.js';
import { predictFromGaze, inferAoiType } from '../intervention/treeEnsembleClassifier.js';

// ─────────────────────────────────────────────────────────────────────────────
// STATIC HELP CONTENT GENERATION
// Generates exhaustive help content from interventions.js for static_help condition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates static help content for a task by pulling all interventions
 * from interventions.js for that task across all SA levels
 */
function generateStaticHelpContent(taskId, aoiId = null) {
  const content = {
    title: `${taskId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Help`,
    taskId: taskId,
    saLevels: {}
  };

  // Get all interventions for each SA level
  [SA_LEVELS.PERCEPTION, SA_LEVELS.COMPREHENSION, SA_LEVELS.PROJECTION].forEach(saLevel => {
    const arms = getArms(taskId, saLevel, aoiId);
    content.saLevels[saLevel] = arms.map(arm => ({
      armId: arm.armId,
      family: arm.family,
      faqTitle: arm.faqTitle,
      render: arm.render
    }));
  });

  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC HELP HELPER FUNCTIONS
// Must be defined before TASK_DEFINITIONS since they're used in stimulus_html
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates per-AOI help dropdowns for static_help condition
 * Each dropdown shows all SA levels with all intervention arms
 */
function generatePerAoiHelpDropdowns(taskId) {
  const content = generateStaticHelpContent(taskId);
  if (!content) return '';

  let dropdownsHtml = '';
  
  // For each SA level, create a dropdown
  Object.entries(content.saLevels).forEach(([saLevel, arms]) => {
    const saLabel = saLevel.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    dropdownsHtml += `
      <div class="aoi-help-dropdown" style="margin-bottom:16px;">
        <button id="help-dropdown-${saLevel}-${taskId}" 
          style="width:100%;padding:12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;cursor:pointer;text-align:left;font-weight:600;display:flex;justify-content:space-between;align-items:center;"
          onclick="document.getElementById('help-content-${saLevel}-${taskId}').style.display=document.getElementById('help-content-${saLevel}-${taskId}').style.display==='block'?'none':'block';">
          ${saLabel} Help
          <span style="font-size:18px;">▼</span>
        </button>
        <div id="help-content-${saLevel}-${taskId}" style="display:none;background:#fff;border:1px solid #d1d5db;border-radius:8px;margin-top:8px;padding:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          ${arms.map(arm => `
            <div style="padding:12px;margin-bottom:8px;background:#f9fafb;border-radius:6px;border-left:4px solid #4f46e5;">
              <div style="font-weight:600;margin-bottom:4px;color:#1f2937;">${arm.family.replace('_', ' ').toUpperCase()}</div>
              <div style="color:#4b5563;font-size:14px;">${arm.render.payload.text || arm.render.payload.body || 'Help content'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  return dropdownsHtml;
}

/**
 * Generates per-AOI hamburger menus for static_help condition
 * Each hamburger menu is positioned near its corresponding AOI element
 */
function generatePerAoiHamburgerMenus(taskId) {
  const content = generateStaticHelpContent(taskId);
  if (!content) return '';

  let menusHtml = '';
  
  // Generate a single popup that will be shared by all hamburger menus
  const popupId = `static-help-popup-${taskId}`;
  menusHtml += generateStaticHelpPopup(taskId);
  
  return menusHtml;
}

/**
 * Generates a single hamburger menu button for a specific AOI
 * This is called inline in the task HTML where each AOI is defined
 */
function generateAoiHamburgerButton(aoiId, taskId) {
  const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
  if (!isStaticHelp) return '';

  return `
    <button 
      class="aoi-help-btn" 
      data-aoi-help="${aoiId}"
      type="button"
      aria-label="Help"
      style="display:block;margin:8px 0 0 auto;width:30px;height:30px;padding:0;background:#f3f4f6;border:1px solid #d1d5db;border-radius:50%;cursor:pointer;font-size:17px;font-weight:700;color:#374151;"
      onclick="event.stopPropagation();window._openAoiHelp('${aoiId}');return false;"
      title="Click for help"
    >
      ?
    </button>
  `;
}

function generateSvgAoiHamburgerButton(aoiId, x, y) {
  const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
  if (!isStaticHelp) return '';

  return `<foreignObject x="${x}" y="${y}" width="30" height="30">
    <button xmlns="http://www.w3.org/1999/xhtml" class="aoi-help-btn" data-aoi-help="${aoiId}" type="button"
      style="width:28px;height:28px;padding:0;background:#f3f4f6;border:1px solid #d1d5db;border-radius:50%;cursor:pointer;font-size:17px;font-weight:700;color:#374151;"
      onclick="event.stopPropagation();window._openAoiHelp('${aoiId}');return false;" title="Click for help">?</button>
  </foreignObject>`;
}

// Helper function to generate help popup HTML for static_help condition (legacy, kept for compatibility)
function generateStaticHelpPopup(taskId, aoiId = null) {
  const content = generateStaticHelpContent(taskId, aoiId);
  if (!content) return '';

  let faqItems = '';
  
  // Generate FAQ items for each SA level and arm
  Object.entries(content.saLevels).forEach(([saLevel, arms]) => {
    const saLabel = saLevel.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    arms.forEach((arm, armIndex) => {
      const index = `${saLevel}-${armIndex}`;
      const question = arm.faqTitle || `${saLabel}: ${arm.family.replace('_', ' ').toUpperCase()}`;
      const answer = arm.render.payload.text || arm.render.payload.body || 'Help content';
      
      faqItems += `
        <div class="static-help-item" data-index="${index}" style="margin-bottom:12px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;">
          <button class="static-help-question" style="width:100%;padding:12px 16px;text-align:left;background:#f9fafb;border:none;cursor:pointer;font-size:14px;font-weight:600;color:#374151;display:flex;justify-content:space-between;align-items:center;"
            onclick="const answer=this.nextElementSibling;const isOpen=answer.style.display==='block';answer.style.display=isOpen?'none':'block';this.querySelector('.help-icon').textContent=isOpen?'▶':'▼';window._logStaticHelpItem?.('${index}', '${question.replace(/'/g, "\\'")}');">
            <span>${question}</span>
            <span class="help-icon" style="font-size:12px;color:#6b7280;">▶</span>
          </button>
          <div class="static-help-answer" style="display:none;padding:12px 16px;background:#fff;border-top:1px solid #e5e7eb;font-size:14px;line-height:1.6;color:#4b5563;">
            ${answer}
          </div>
        </div>
      `;
    });
  });

  return `
    <div id="static-help-popup-${taskId}" class="bn-popup" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;" onclick="window._closeAoiHelp?.();">
      <div class="bn-popup-content" style="max-width:500px;max-height:80vh;overflow-y:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);" onclick="event.stopPropagation();">
        <h3 style="margin:0 0 16px;font-size:20px;color:#111827;display:flex;align-items:center;gap:8px;">
          <span>${content.title}</span>
        </h3>
        <div class="static-help-faq">
          ${faqItems}
        </div>
      </div>
    </div>
  `;
}

// Helper function to generate hamburger menu with help for static_help condition
function generateHamburgerMenu(taskId) {
  const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
  const isUserInitiated = CONFIG.INTERVENTION_CONDITION === 'user_initiated';
  const isSystemInitiated = CONFIG.INTERVENTION_CONDITION === 'system_initiated';
  if (!isStaticHelp) return '';

  return `
    <div id="hamburger-container-${taskId}">
      <button id="hamburger-btn-${taskId}" aria-label="Help" style="width:34px;height:34px;padding:0;background:#f3f4f6;border:1px solid #d1d5db;border-radius:50%;cursor:pointer;font-size:18px;font-weight:700;color:#374151;" onclick="document.getElementById('hamburger-btn-${taskId}').style.display='none';document.getElementById('close-btn-${taskId}').style.display='block';document.getElementById('static-help-popup-${taskId}').style.display='flex';return false;">?</button>
      <button id="close-btn-${taskId}" style="display:none;padding:8px 12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;cursor:pointer;font-size:18px;color:#374151;" onclick="document.getElementById('hamburger-btn-${taskId}').style.display='block';document.getElementById('close-btn-${taskId}').style.display='none';document.getElementById('static-help-popup-${taskId}').style.display='none';return false;">✕</button>
    </div>
    ${generateStaticHelpPopup(taskId)}
  `;
}

// Helper function to generate floating "I'm confused" button for user_initiated condition
function generateConfusedButton(taskId) {
  const isUserInitiated = CONFIG.INTERVENTION_CONDITION === 'user_initiated';
  // Don't show button for attention check task
  if (!isUserInitiated || taskId === 'error-diagnosis') return '';

  return `
    <button id="confused-btn" style="position:fixed;bottom:24px;right:24px;padding:12px 20px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 12px rgba(239,68,68,0.3);z-index:1000;transition:transform 0.2s,background 0.2s;" onmouseover="this.style.background='#dc2626';this.style.transform='translateY(-2px)';" onmouseout="this.style.background='#ef4444';this.style.transform='translateY(0)';" onclick="window._handleConfusedClick();return false;">I'm confused</button>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const TASK_DEFINITIONS = {

  // ── 1. Broken navigation ──────────────────────────────────────────────────
  'broken-nav': {
    id:    'broken-nav',
    type:  'navigation',
    title: 'Broken Navigation',
    instructions: (() => {
      const condition = CONFIG.INTERVENTION_CONDITION;
      if (condition === 'static_help') {
        return 'Explore the mini website below and try to navigate to the returns policy page. You may enter fake information where needed — it will not affect the outcome of the experiment. Help is available in the Help tab.';
      } else if (condition === 'user_initiated') {
        return 'Explore the mini website below and try to navigate to the returns policy page. You may enter fake information where needed — it will not affect the outcome of the experiment. If you need help, click the "I\'m confused" button at the bottom right.';
      } else {
        return 'Explore the mini website below and try to navigate to the returns policy page. You may enter fake information where needed — it will not affect the outcome of the experiment.';
      }
    })(),
    stimulus_html: (() => {
      const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
      const helpPopup = isStaticHelp ? generatePerAoiHamburgerMenus('broken-nav') : '';
      const helpButtonAction = isStaticHelp 
        ? `onclick="window._openAoiHelp('bn-about-link');return false;"`
        : `onclick="document.getElementById('bn-help-popup').style.display='flex';return false;"`;
      const closePopupAction = isStaticHelp
        ? `onclick="document.getElementById('static-help-popup-broken-nav').style.display='none';return false;"`
        : `onclick="document.getElementById('bn-help-popup').style.display='none';return false;"`;
      
      return `
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
              <button class="shop-link" id="bn-help-btn" ${helpButtonAction}>Help</button>
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
                onclick="document.getElementById('bn-about-dropdown').classList.toggle('open');return false;">about ▾</button>
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
              onclick="document.getElementById('broken-nav-answer').value='No';document.querySelectorAll('.nav-choice').forEach(b=>b.classList.remove('selected'));this.classList.add('selected');document.getElementById('bn-status').textContent='✓ Selected: No — I could not find it';">
              ✗ No — I could not find it
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
      ${!isStaticHelp ? '<div id="bn-help-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Help</h3><p>Help is currently unavailable.</p><button type="button" class="continue-button" onclick="document.getElementById(\'bn-help-popup\').style.display=\'none\';return false;">Close</button></div></div>' : ''}
      <div id="bn-aboutus-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>About us</h3><p>Glimmer Goods launched to explore how people use navigation labels and hidden menus in shopping experiences.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-aboutus-popup').style.display='none';return false;">Close</button></div></div>
      <div id="bn-contact-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Contact</h3><p>Email support@glimmergoods.example or call +1 (555) 123-4567.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-contact-popup').style.display='none';return false;">Close</button></div></div>
      <div id="bn-loyalty-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Loyalty program</h3><p>Join our loyalty program for early access to sales, bonus points, and exclusive offers.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-loyalty-popup').style.display='none';return false;">Close</button></div></div>
      <div id="bn-returns-popup" class="bn-popup" style="display:none;"><div class="bn-popup-content"><h3>Returns policy</h3><p>The returns policy is currently inaccessible. Please contact us for more information.</p><button type="button" class="continue-button" onclick="document.getElementById('bn-returns-popup').style.display='none';return false;">Close</button></div></div>
      ${helpPopup}
    `;
    })(),
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
    instructions: (() => {
      const condition = CONFIG.INTERVENTION_CONDITION;
      if (condition === 'static_help') {
        return 'Fill out the registration form completely and submit it. You may enter fake information where needed — it will not affect the outcome of the experiment. Help is available via the question mark icon (?).';
      } else if (condition === 'user_initiated') {
        return 'Fill out the registration form completely and submit it. You may enter fake information where needed — it will not affect the outcome of the experiment. If you need help, click the "I\'m confused" button at the bottom right.';
      } else {
        return 'Fill out the registration form completely and submit it. You may enter fake information where needed — it will not affect the outcome of the experiment.';
      }
    })(),
    stimulus_html: (() => {
      const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
      const helpPopup = isStaticHelp ? generatePerAoiHamburgerMenus('ambiguous-form') : '';
      
      // Fields: hasError drives whether an error span appears on input.
      // Per spec: Full name, Correspondence preference, Notification cadence,
      // and Account classification have NO errors. The other four do.
      const fields = [
        { label: 'Account nickname',                 type: 'text',   hasError: false },
        { label: 'Portfolio address',             type: 'text',   hasError: true,  error: '.net, .mail, and .gov are not permitted' },
        { label: 'Correspondence preference', type: 'text',   hasError: false },
        { label: 'Notification cadence',      type: 'select', hasError: false,
          options: ['Choose cadence', 'steady', 'never', 'rapid', 'bi-weekly', 'daily'] },
        { label: 'Account classification',    type: 'text',   hasError: false },
        { label: 'Temporary password',                  type: 'text',   hasError: true,  error: 'Invalid value — check format' },
        { label: 'Confirm temporary password',          type: 'text',   hasError: true,  error: 'Invalid value — check format' },
        { label: 'Pager number',              type: 'text',   hasError: true,  error: 'Include country code. +3, +111, +625, & +332 are not permitted.' },
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

        const hamburgerButton = isStaticHelp ? generateAoiHamburgerButton(id, 'ambiguous-form') : '';

        return `
          <div data-aoi="${id}" style="display:grid;gap:6px;position:relative;">
            <label for="${id}" style="font-weight:600;color:#111827;">${f.label}</label>
            ${input}
            ${errorSpan}
            ${hamburgerButton}
          </div>`;
      }).join('');

      return `
        <div style="font-family:system-ui,sans-serif;color:#111827;border:1px solid #d1d5db;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.12);">
          <div style="padding:28px;background:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
            <div style="flex:1;">
              <h2 style="margin:0 0 8px;font-size:28px;">Create your account</h2>
              <p style="margin:0 0 16px;color:#475569;font-weight:500;font-style:italic;">Fill out the form to the best of your ability and submit when you feel comfortable.</p>
              <p style="margin:0 0 24px;color:#475569;line-height:1.7;">Complete all fields below.</p>
            </div>
          </div>
          <div style="padding:0 28px 28px;background:#fff;">
            <div id="af-form" style="display:grid;gap:18px;">${rows}</div>
          </div>
        </div>
        ${helpPopup}`;
    })(),
    aois: Array.from({ length: 8 }, (_, i) => ({ id: `af-field-${i + 1}` })),
    questions: [],  // responses collected directly from the form inputs by _getResponses
  },

  // ── 3. Data table ─────────────────────────────────────────────────────────
  'data-table': {
    id:    'data-table',
    type:  'table',
    title: 'Data Table Analysis',
    instructions: (() => {
      const condition = CONFIG.INTERVENTION_CONDITION;
      if (condition === 'static_help') {
        return 'Analyse the table and answer the questions below. You may enter fake information where needed — it will not affect the outcome of the experiment. Help is available via the question mark icon (?).';
      } else if (condition === 'user_initiated') {
        return 'Analyse the table and answer the questions below. You may enter fake information where needed — it will not affect the outcome of the experiment. If you need help, click the "I\'m confused" button at the bottom right.';
      } else {
        return 'Analyse the table and answer the questions below. You may enter fake information where needed — it will not affect the outcome of the experiment.';
      }
    })(),
    stimulus_html: (() => {
      const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
      const helpPopup = isStaticHelp ? generatePerAoiHamburgerMenus('data-table') : '';
      
      return `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#f0fdf4;font-family:system-ui,sans-serif;position:relative;">
        <table data-aoi="dt-header" style="width:100%;border-collapse:collapse;font-size:14px;text-align:left;">
          <thead>
            <tr style="background:#dcfce7;border-bottom:2px solid #86efac;">
              <th style="padding:12px;border:1px solid #d1d5db;">Transport Mode</th>
              <th style="padding:12px;border:1px solid #d1d5db;text-align:right;">Mode Share (%)</th>
              <th style="padding:12px;border:1px solid #d1d5db;text-align:right;">Emissions (g CO₂/km)</th>
              <th style="padding:12px;border:1px solid #d1d5db;text-align:right;">Weighted Emissions (%)</th>
              <th style="padding:4px;border:1px solid #d1d5db;">${isStaticHelp ? generateAoiHamburgerButton('dt-header', 'data-table') : ''}</th>
            </tr>
          </thead>
          <tbody>
            <tr data-aoi="dt-row-1" style="border-bottom:1px solid #d1d5db;"><td style="padding:12px;border:1px solid #d1d5db;">Private Car</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">58%</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">192</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">71.2%</td><td style="padding:4px;border:1px solid #d1d5db;">${isStaticHelp ? generateAoiHamburgerButton('dt-row-1', 'data-table') : ''}</td></tr>
            <tr data-aoi="dt-row-2" style="border-bottom:1px solid #d1d5db;"><td style="padding:12px;border:1px solid #d1d5db;">Bus</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">22%</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">54</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">15.4%</td><td style="padding:4px;border:1px solid #d1d5db;">${isStaticHelp ? generateAoiHamburgerButton('dt-row-2', 'data-table') : ''}</td></tr>
            <tr data-aoi="dt-row-3" style="border-bottom:1px solid #d1d5db;"><td style="padding:12px;border:1px solid #d1d5db;">Cycling</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">12%</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">0</td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;">0%</td><td style="padding:4px;border:1px solid #d1d5db;">${isStaticHelp ? generateAoiHamburgerButton('dt-row-3', 'data-table') : ''}</td></tr>
            <tr data-aoi="dt-row-4" style="background:#fafafa;"><td style="padding:12px;border:1px solid #d1d5db;"><strong>Urban Total</strong></td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;"><strong>92%</strong></td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;"><strong>—</strong></td><td style="padding:12px;border:1px solid #d1d5db;text-align:right;"><strong>86.6%</strong></td><td style="padding:4px;border:1px solid #d1d5db;">${isStaticHelp ? generateAoiHamburgerButton('dt-row-4', 'data-table') : ''}</td></tr>
          </tbody>
        </table>
        ${helpPopup}
      </div>`;
    })(),
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
    instructions: (() => {
      const condition = CONFIG.INTERVENTION_CONDITION;
      if (condition === 'static_help') {
        return 'Solve the multi-step problem. Use the scratchpad to show your working. You may enter fake information where needed — it will not affect the outcome of the experiment. Help is available via the question mark icon (?).';
      } else if (condition === 'user_initiated') {
        return 'Solve the multi-step problem. Use the scratchpad to show your working. You may enter fake information where needed — it will not affect the outcome of the experiment. If you need help, click the "I\'m confused" button at the bottom right.';
      } else {
        return 'Solve the multi-step problem. Use the scratchpad to show your working. You may enter fake information where needed — it will not affect the outcome of the experiment.';
      }
    })(),
    stimulus_html: (() => {
      const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
      const helpPopup = isStaticHelp ? generatePerAoiHamburgerMenus('math-problem') : '';
      
      return `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#fff7ed;font-family:system-ui,sans-serif;position:relative;">
        <div data-aoi="mp-problem" style="margin-bottom:20px;position:relative;">
          <h3 style="margin:0 0 12px;font-size:18px;color:#92400e;">Problem</h3>
          <p style="margin:0;line-height:1.7;color:#78350f;">
            A patient weighs 72 kg and needs an antibiotic injection. The prescribed dosage is
            15 mg per kilogram of body weight. Available tablets come in 250 mg, 500 mg, and
            1000 mg sizes. The maximum daily dose is 4800 mg.
          </p>
          ${isStaticHelp ? generateAoiHamburgerButton('mp-problem', 'math-problem') : ''}
        </div>
        <div data-aoi="mp-table" style="margin-bottom:20px;padding:16px;background:#fef3c7;border-radius:8px;border:1px solid #fbbf24;position:relative;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr style="border-bottom:1px solid #fbbf24;"><th style="padding:8px;text-align:left;color:#92400e;">Tablet Size</th><th style="padding:8px;text-align:center;color:#92400e;">Available</th></tr>
            <tr style="border-bottom:1px solid #fbbf24;"><td style="padding:8px;">250 mg</td><td style="padding:8px;text-align:center;">✓</td></tr>
            <tr style="border-bottom:1px solid #fbbf24;"><td style="padding:8px;">500 mg</td><td style="padding:8px;text-align:center;">✓</td></tr>
            <tr><td style="padding:8px;">1000 mg</td><td style="padding:8px;text-align:center;">✓</td></tr>
          </table>
          ${isStaticHelp ? generateAoiHamburgerButton('mp-table', 'math-problem') : ''}
        </div>
        <div data-aoi="mp-scratchpad" style="position:relative;">
          <label for="mp-scratch" style="display:block;font-weight:600;margin-bottom:8px;color:#92400e;">Scratchpad (show your calculations):</label>
          <textarea id="mp-scratch" style="width:100%;height:100px;padding:12px;border:1px solid #fbbf24;border-radius:8px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
          ${isStaticHelp ? generateAoiHamburgerButton('mp-scratchpad', 'math-problem') : ''}
        </div>
        ${helpPopup}
      </div>`;
    })(),
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
    instructions: (() => {
      const condition = CONFIG.INTERVENTION_CONDITION;
      if (condition === 'static_help') {
        return 'Study the transit map and answer the question about the optimal route. You may enter fake information where needed — it will not affect the outcome of the experiment. Help is available via the question mark icon (?).';
      } else if (condition === 'user_initiated') {
        return 'Study the transit map and answer the question about the optimal route. You may enter fake information where needed — it will not affect the outcome of the experiment. If you need help, click the "I\'m confused" button at the bottom right.';
      } else {
        return 'Study the transit map and answer the question about the optimal route. You may enter fake information where needed — it will not affect the outcome of the experiment.';
      }
    })(),
    stimulus_html: (() => {
      const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
      const helpPopup = isStaticHelp ? generatePerAoiHamburgerMenus('visual-search') : '';
      
      return `
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
          ${isStaticHelp ? generateAoiHamburgerButton('vs-legend', 'visual-search') : ''}
        </div>
        <svg width="100%" height="400" viewBox="0 0 800 400" style="border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;margin-bottom:20px;">
          <g data-aoi="vs-line-1" style="position:relative;"><polyline points="50,100 150,100 250,150 350,150 450,100" stroke="#ef4444" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="50" cy="100" r="5" fill="#ef4444"/><circle cx="150" cy="100" r="5" fill="#ef4444"/><circle cx="250" cy="150" r="5" fill="#ef4444"/><circle cx="350" cy="150" r="5" fill="#ef4444"/><circle cx="450" cy="100" r="5" fill="#ef4444"/><text x="55" y="95" font-size="11" fill="#1f2937">St.A</text><text x="155" y="95" font-size="11" fill="#1f2937">St.B</text><text x="255" y="145" font-size="11" fill="#1f2937">St.C</text><text x="355" y="145" font-size="11" fill="#1f2937">St.D</text><text x="455" y="95" font-size="11" fill="#1f2937">St.E</text>${isStaticHelp ? generateAoiHamburgerButton('vs-line-1', 'visual-search') : ''}</g>
          <g data-aoi="vs-line-2" style="position:relative;"><polyline points="100,300 200,250 300,250 400,300 500,250" stroke="#3b82f6" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="100" cy="300" r="5" fill="#3b82f6"/><circle cx="200" cy="250" r="5" fill="#3b82f6"/><circle cx="300" cy="250" r="5" fill="#3b82f6"/><circle cx="400" cy="300" r="5" fill="#3b82f6"/><circle cx="500" cy="250" r="5" fill="#3b82f6"/><text x="105" y="315" font-size="11" fill="#1f2937">St.F</text><text x="205" y="240" font-size="11" fill="#1f2937">St.G</text><text x="305" y="240" font-size="11" fill="#1f2937">St.H</text><text x="405" y="315" font-size="11" fill="#1f2937">St.I</text><text x="505" y="240" font-size="11" fill="#1f2937">St.J</text>${isStaticHelp ? generateAoiHamburgerButton('vs-line-2', 'visual-search') : ''}</g>
          <g data-aoi="vs-line-3" style="position:relative;"><polyline points="150,200 250,180 350,200 450,200 550,180" stroke="#10b981" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="150" cy="200" r="5" fill="#10b981"/><circle cx="250" cy="180" r="5" fill="#10b981"/><circle cx="350" cy="200" r="5" fill="#10b981"/><circle cx="450" cy="200" r="5" fill="#10b981"/><circle cx="550" cy="180" r="5" fill="#10b981"/><text x="155" y="215" font-size="11" fill="#1f2937">St.K</text><text x="255" y="170" font-size="11" fill="#1f2937">St.L</text><text x="355" y="215" font-size="11" fill="#1f2937">St.M</text><text x="455" y="215" font-size="11" fill="#1f2937">St.N</text><text x="555" y="170" font-size="11" fill="#1f2937">St.O</text>${isStaticHelp ? generateAoiHamburgerButton('vs-line-3', 'visual-search') : ''}</g>
          <g data-aoi="vs-line-4" style="position:relative;"><polyline points="500,100 550,150 600,150 650,100" stroke="#f59e0b" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="500" cy="100" r="5" fill="#f59e0b"/><circle cx="550" cy="150" r="5" fill="#f59e0b"/><circle cx="600" cy="150" r="5" fill="#f59e0b"/><circle cx="650" cy="100" r="5" fill="#f59e0b"/><text x="505" y="95" font-size="11" fill="#1f2937">St.P</text><text x="555" y="145" font-size="11" fill="#1f2937">St.Q</text><text x="605" y="145" font-size="11" fill="#1f2937">St.R</text><text x="655" y="95" font-size="11" fill="#1f2937">St.S</text>${isStaticHelp ? generateAoiHamburgerButton('vs-line-4', 'visual-search') : ''}</g>
          <g data-aoi="vs-line-5" style="position:relative;"><polyline points="600,300 650,280 700,300" stroke="#8b5cf6" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="600" cy="300" r="5" fill="#8b5cf6"/><circle cx="650" cy="280" r="5" fill="#8b5cf6"/><circle cx="700" cy="300" r="5" fill="#8b5cf6"/><text x="605" y="315" font-size="11" fill="#1f2937">St.T</text><text x="655" y="270" font-size="11" fill="#1f2937">St.U</text><text x="705" y="315" font-size="11" fill="#1f2937">St.V</text>${isStaticHelp ? generateAoiHamburgerButton('vs-line-5', 'visual-search') : ''}</g>
          <g data-aoi="vs-line-6" style="position:relative;"><polyline points="350,300 450,330 550,300" stroke="#ec4899" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="350" cy="300" r="5" fill="#ec4899"/><circle cx="450" cy="330" r="5" fill="#ec4899"/><circle cx="550" cy="300" r="5" fill="#ec4899"/><text x="355" y="315" font-size="11" fill="#1f2937">St.W</text><text x="455" y="345" font-size="11" fill="#1f2937">St.X</text><text x="555" y="315" font-size="11" fill="#1f2937">St.Y</text>${isStaticHelp ? generateAoiHamburgerButton('vs-line-6', 'visual-search') : ''}</g>
        </svg>
        ${helpPopup}
      </div>`;
    })(),
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
    title: 'Error Diagnosis Attention Check',
    instructions: 'The task you are about to take part in is very simple. When asked for your favorite ice cream flavour you must select "Chocolate". This is an attention check.',
    attention_check: true,
    no_time_limit: true,
    attention_check_retry_limit: 2,
    attention_check_input_name: 'ed-check',
    correctAnswer: 'chocolate',
    stimulus_html: `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#f8fafc;font-family:system-ui,sans-serif;">
        <div style="margin-bottom:20px;color:#111827;font-size:16px;line-height:1.7;">
          The task you are about to take part in is very simple. When asked for your favorite ice cream flavour you must select <strong>"Chocolate"</strong>. This is an attention check.
        </div>
        <div style="padding:20px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
          <div style="font-weight:700;font-size:16px;color:#111827;margin-bottom:12px;">
            Based on the text you read above, what is the best ice cream flavour you have been asked to enter?
          </div>
          <div style="display:grid;gap:12px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="radio" name="ed-check" value="vanilla" /> <span>Vanilla</span></label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="radio" name="ed-check" value="strawberry" /> <span>Strawberry</span></label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="radio" name="ed-check" value="chocolate" /> <span>Chocolate</span></label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="radio" name="ed-check" value="mint" /> <span>Mint</span></label>
          </div>
        </div>
      </div>`,
    aois: [{ id: 'ed-check' }],
    questions: [],
  },

  // ── 7. Instruction following ──────────────────────────────────────────────
  'instruction-following': {
    id:    'instruction-following',
    type:  'following',
    title: 'Router Configuration',
    instructions: (() => {
      const condition = CONFIG.INTERVENTION_CONDITION;
      if (condition === 'static_help') {
        return 'Configure the router to the following specifications: security type=WPA3, DNS=8.8.8.8, then click Save Changes. You may enter fake information where needed — it will not affect the outcome of the experiment. Help is available via the question mark icon (?).';
      } else if (condition === 'user_initiated') {
        return 'Configure the router to the following specifications: security type=WPA3, DNS=8.8.8.8, then click Save Changes. You may enter fake information where needed — it will not affect the outcome of the experiment. If you need help, click the "I\'m confused" button at the bottom right.';
      } else {
        return 'Configure the router to the following specifications: security type=WPA3, DNS=8.8.8.8, then click Save Changes. You may enter fake information where needed — it will not affect the outcome of the experiment.';
      }
    })(),
    stimulus_html: (() => {
      const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
      const helpPopup = isStaticHelp ? generatePerAoiHamburgerMenus('instruction-following') : '';
      
      return `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#eef2ff;font-family:system-ui,sans-serif;position:relative;">
        <div style="max-width:700px;margin:0 auto;">
          <div style="background:#fff;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1);">
            <div style="display:flex;border-bottom:2px solid #d1d5db;background:#f9fafb;" id="if-tabs">
              <div data-aoi="if-tab-network" style="flex:1;"><button type="button" data-tab="0" style="width:100%;padding:16px;background:#fff;border:none;border-bottom:3px solid #4f46e5;cursor:pointer;font-weight:600;color:#1f2937;">Network</button>${isStaticHelp ? generateAoiHamburgerButton('if-tab-network', 'instruction-following') : ''}</div>
              <div data-aoi="if-tab-security" style="flex:1;"><button type="button" data-tab="1" style="width:100%;padding:16px;background:#f9fafb;border:none;cursor:pointer;font-size:20px;color:#6b7280;">🔒</button>${isStaticHelp ? generateAoiHamburgerButton('if-tab-security', 'instruction-following') : ''}</div>
              <div data-aoi="if-tab-advanced" style="flex:1;"><button type="button" data-tab="2" style="width:100%;padding:16px;background:#f9fafb;border:none;cursor:pointer;font-weight:600;color:#6b7280;">Advanced</button>${isStaticHelp ? generateAoiHamburgerButton('if-tab-advanced', 'instruction-following') : ''}</div>
            </div>
            <div id="if-panel-0" style="padding:24px;display:block;">
              <div style="display:grid;gap:16px;">
                <div><label style="display:block;font-weight:600;margin-bottom:6px;">WiFi SSID</label><input type="text" value="GuestNetwork" disabled style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;box-sizing:border-box;"/></div>
                <div data-aoi="if-security"><label style="display:block;font-weight:600;margin-bottom:6px;">Security Type</label><select id="if-security-select" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"><option>WEP</option><option>WPA2</option><option selected>WPA3</option></select>${isStaticHelp ? generateAoiHamburgerButton('if-security', 'instruction-following') : ''}</div>
              </div>
            </div>
            <div id="if-panel-1" style="padding:24px;display:none;">
              <div style="display:grid;gap:16px;">
                <div data-aoi="if-dns"><label style="display:block;font-weight:600;margin-bottom:6px;">Primary DNS</label><input id="if-dns-input" type="text" placeholder="8.8.8.8" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"/>${isStaticHelp ? generateAoiHamburgerButton('if-dns', 'instruction-following') : ''}</div>
                <div><label style="display:block;font-weight:600;margin-bottom:6px;">Secondary DNS</label><input type="text" value="8.8.4.4" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"/></div>
                <div><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" checked style="width:18px;height:18px;"/> Enable DoH (DNS over HTTPS)</label></div>
              </div>
            </div>
            <div id="if-panel-2" style="padding:24px;display:none;">
              <div><label style="display:block;font-weight:600;margin-bottom:6px;">Channel Width</label><select style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;"><option>20 MHz</option><option selected>40 MHz</option><option>80 MHz</option></select></div>
            </div>
            <div style="padding:24px;background:#f9fafb;border-top:1px solid #d1d5db;display:flex;gap:12px;justify-content:flex-end;">
              <div data-aoi="if-save" style="display:flex;align-items:center;gap:8px;">
                <button id="if-save-btn" type="button"
                  style="padding:10px 24px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;transition:background .2s;"
                >Save Changes</button>
                ${isStaticHelp ? generateAoiHamburgerButton('if-save', 'instruction-following') : ''}
              </div>
              <button type="button" style="padding:10px 24px;background:#f3f4f6;color:#1f2937;border:1px solid #d1d5db;border-radius:6px;font-weight:600;cursor:pointer;">Cancel</button>
            </div>
          </div>
        </div>
        ${helpPopup}
      </div>`;
    })(),
    aois: [
      { id: 'if-tab-network' }, { id: 'if-tab-security' }, { id: 'if-tab-advanced' },
      { id: 'if-security' }, { id: 'if-dns' }, { id: 'if-save' },
    ],
    questions: [
      { id: 'if-q1', prompt: 'What security type did you select in the Network tab?', type: 'text' },
      { id: 'if-q2', prompt: 'What DNS server address did you enter?', type: 'text' },
      { id: 'if-q3', prompt: 'Did you click "Save Changes"?', type: 'checkbox' },
    ],
  },

  // ── 8. Reading inference ──────────────────────────────────────────────────
  'reading-inference': {
    id:    'reading-inference',
    type:  'reading',
    title: 'Pharmacokinetics: Drug Absorption & Metabolism',
    instructions: (() => {
      const condition = CONFIG.INTERVENTION_CONDITION;
      if (condition === 'static_help') {
        return 'Read the passage carefully, then answer all comprehension and inference questions. You may enter fake information where needed — it will not affect the outcome of the experiment. Help is available via the question mark icon (?).';
      } else if (condition === 'user_initiated') {
        return 'Read the passage carefully, then answer all comprehension and inference questions. You may enter fake information where needed — it will not affect the outcome of the experiment. If you need help, click the "I\'m confused" button at the bottom right.';
      } else {
        return 'Read the passage carefully, then answer all comprehension and inference questions. You may enter fake information where needed — it will not affect the outcome of the experiment.';
      }
    })(),
    stimulus_html: (() => {
      const isStaticHelp = CONFIG.INTERVENTION_CONDITION === 'static_help';
      const helpPopup = isStaticHelp ? generatePerAoiHamburgerMenus('reading-inference') : '';
      
      return `
      <div style="padding:24px;border:1px solid #d1d5db;border-radius:16px;background:#f7fee7;font-family:system-ui,sans-serif;max-width:800px;line-height:1.8;position:relative;">
        <div data-aoi="ri-p1" style="margin-bottom:16px;position:relative;"><p style="margin:0;color:#1f2937;"><strong>Drug absorption</strong> occurs when a pharmaceutical compound enters the bloodstream from its site of administration. For oral medications, this process begins in the gastrointestinal tract where the drug dissolves and crosses the intestinal epithelium through passive diffusion, active transport, or carrier-mediated mechanisms. The rate and extent of absorption depend on drug solubility, pH stability, and intestinal surface area. Factors such as food intake, gastric pH, and individual genetic variations significantly influence bioavailability — the fraction of the administered dose that reaches systemic circulation.</p>${isStaticHelp ? generateAoiHamburgerButton('ri-p1', 'reading-inference') : ''}</div>
        
        <div data-aoi="ri-p3" style="margin-bottom:20px;position:relative;"><p style="margin:0;color:#1f2937;"><strong>Individual variation</strong> in drug metabolism is largely determined by genetic polymorphisms in the cytochrome P450 gene family, particularly CYP2D6 and CYP3A4. Subjects are classified as poor, intermediate, normal (extensive), or ultra-rapid metabolisers based on their enzymatic activity. Elderly patients and those with hepatic or renal impairment typically experience reduced drug clearance, requiring dose adjustment to prevent toxicity. Conversely, ultra-rapid metabolisers may need higher doses to achieve therapeutic effect.</p>${isStaticHelp ? generateAoiHamburgerButton('ri-p3', 'reading-inference') : ''}</div>
        <div data-aoi="ri-table" style="margin:20px 0;padding:16px;background:#dcfce7;border-radius:8px;border:1px solid #86efac;overflow-x:auto;position:relative;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#bbf7d0;border-bottom:2px solid #6ee7b7;"><th style="padding:10px;text-align:left;color:#15803d;">Patient Type</th><th style="padding:10px;color:#15803d;">Enzymatic Activity</th><th style="padding:10px;color:#15803d;">Dose Adjustment</th><th style="padding:10px;color:#15803d;">Risk</th></tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid #86efac;"><td style="padding:10px;">Poor Metabolisers</td><td style="padding:10px;">Very Low</td><td style="padding:10px;color:#dc2626;font-weight:600;">Reduce 50–75%</td><td style="padding:10px;">High (Toxicity)</td></tr>
              
              <tr style="border-bottom:1px solid #86efac;"><td style="padding:10px;">Normal (Extensive)</td><td style="padding:10px;">Normal</td><td style="padding:10px;color:#10b981;font-weight:600;">Standard dose</td><td style="padding:10px;">Low</td></tr>
              <tr><td style="padding:10px;">Ultra-rapid Metabolisers</td><td style="padding:10px;">Very High</td><td style="padding:10px;color:#3b82f6;font-weight:600;">Increase 50–100%</td><td style="padding:10px;">Low (Therapeutic Failure)</td></tr>
            </tbody>
          </table>
          ${isStaticHelp ? generateAoiHamburgerButton('ri-table', 'reading-inference') : ''}
        </div>
        ${helpPopup}
      </div>`;
    })(),
    aois: [{ id: 'ri-p1' }, { id: 'ri-p3' }, { id: 'ri-table' }],
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
  let autoAdvanceTimeout = null;
  let autoAdvanceCountdown = null;
  let endOfTaskResolve = null;
  let attentionCheckFailures = {};

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
    if (autoAdvanceTimeout) { clearTimeout(autoAdvanceTimeout); autoAdvanceTimeout = null; }
    if (autoAdvanceCountdown) { clearInterval(autoAdvanceCountdown); autoAdvanceCountdown = null; }
  }

  function _logEvent(type, extra = {}) {
    sessionData.events.push({ type, task_id: currentTask?.id || null, timestamp: Date.now(), ...extra });
  }

  function _logStaticHelpInteraction(helpItemIndex, question) {
    _logEvent('static_help_interaction', {
      task_id: currentTask?.id,
      help_item_index: helpItemIndex,
      question: question,
    });
  }

  // ── Validation ────────────────────────────────────────────────────────────
  /**
   * Returns an array of error message strings (empty = valid).
   * Checks:
   * (a) Non-hidden text/textarea response fields
   * (b) Hidden inputs driven by in-stimulus controls (broken-nav)
   * (c) Radio groups present in the stimulus
   * (d) All visible form inputs for ambiguous-form
   */
    function _validateResponses() {
    const msgs = new Set();

    // (a) Rendered response form inputs (text/textarea)
    const form = document.getElementById('task-response-form');
    if (form) {
      form.querySelectorAll('input[type="text"], textarea').forEach(inp => {
        if (!inp.disabled && !inp.value.trim()) {
          msgs.add('Please answer all questions before submitting.');
        }
      });
    }

    // (b) Hidden inputs in stimulus (e.g. broken-nav)
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
    // (Note: This is redundant now that we disable the button, but kept as a backup)
    if (currentTask?.id === 'ambiguous-form') {
      const inputs = Array.from(document.querySelectorAll('#task-stimulus input[type="text"]:not([disabled]), #task-stimulus select:not([disabled])'));
      const allFilled = inputs.every(inp => inp.value.trim() !== '');
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
      if (!el) {
        acc[q.id] = null;
      } else if (q.type === 'checkbox') {
        acc[q.id] = el.checked;
      } else {
        acc[q.id] = el.value.trim();
      }
      return acc;
    }, {});

    // For ambiguous-form: also capture all af-field values
    if (currentTask.id === 'ambiguous-form') {
      document.querySelectorAll('#task-stimulus input[id^="af-field-"], #task-stimulus select[id^="af-field-"]').forEach(el => {
        fields[el.id] = el.value.trim();
      });
    }

    return { ...radios, ...fields };
  }

  function _getAttentionCheckResponse() {
    if (!currentTask?.attention_check) return null;
    const inputName = currentTask.attention_check_input_name || `${currentTask.id}-check`;
    return document.querySelector(`input[name="${inputName}"]:checked`)?.value || null;
  }

  function _isAttentionCheckCorrect() {
    if (!currentTask?.attention_check || !currentTask?.correctAnswer) return true;
    return _getAttentionCheckResponse() === currentTask.correctAnswer;
  }

  function _handleAttentionCheckFailure() {
    const taskId = currentTask?.id;
    if (!taskId) return false;

    const attempt = (attentionCheckFailures[taskId] || 0) + 1;
    attentionCheckFailures[taskId] = attempt;
    const limit = currentTask.attention_check_retry_limit || 2;
    const errEl = document.getElementById('submit-error');
    const submitBtn = document.getElementById('submit-task-btn');
    const inputName = currentTask.attention_check_input_name || `${taskId}-check`;
    const radios = Array.from(document.querySelectorAll(`input[name="${inputName}"]`));

    _logEvent('attention-check-failed', {
      task_id: taskId,
      attempt,
      response: _getAttentionCheckResponse(),
    });

    if (attempt >= limit) {
      if (errEl) {
        errEl.innerHTML = 'You have failed this attention check twice. Please close the survey and click <strong>Cancel participation</strong> on Prolific to return your submission.';
        errEl.style.display = 'block';
      }
      radios.forEach(r => { r.disabled = true; });
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
      }
      return false;
    }

    const remaining = limit - attempt;
    if (errEl) {
      errEl.textContent = `That answer is not correct. Please try again. You have ${remaining} more ${remaining === 1 ? 'chance' : 'chances'}.`;
      errEl.style.display = 'block';
    }
    return true;
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

    const taskInstructionsBanner = task.instructions
      ? `<div style="margin-bottom:20px;padding:18px 20px;background:#eef2ff;color:#1e3a8a;border-radius:14px;border:1px solid #bfdbfe;line-height:1.7;font-size:15px;">
           <strong style="display:block;margin-bottom:8px;font-size:16px;">Instructions</strong>
           ${task.instructions}
         </div>`
      : '';

    const autoAdvanceEnabled = CONFIG.AUTO_ADVANCE_ENABLED && 
                               CONFIG.AUTO_ADVANCE_TIMEOUTS[task.id] > 0;
    const autoAdvanceTimeout = autoAdvanceEnabled ? CONFIG.AUTO_ADVANCE_TIMEOUTS[task.id] : 0;
    
    const autoAdvanceBanner = autoAdvanceEnabled && autoAdvanceTimeout > 0
      ? `<div id="auto-advance-banner" style="display:none;margin-top:20px;padding:14px 16px;background:#dbeafe;color:#0c4a6e;border-radius:12px;border:1px solid #0284c7;">
           <div style="font-weight:600;margin-bottom:6px;">⏰ Auto-advance in <span id="countdown-timer">${autoAdvanceTimeout}</span>s</div>
           <div style="font-size:14px;line-height:1.5;">This task will automatically submit and move to the next one. You can submit early by clicking the button below.</div>
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
        if (q.type === 'checkbox') {
          return `<div style="margin-bottom:18px; display:flex; align-items:center; gap:10px;">
            <input id="${q.id}" type="checkbox" style="width:20px; height:20px; cursor:pointer;" />
            <label for="${q.id}" style="color:#111827; font-weight:600; cursor:pointer;">${q.prompt}</label>
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

        ${taskInstructionsBanner}

        ${pilotBanner}

        <div id="task-stimulus" style="margin-bottom:28px;">${task.stimulus_html}</div>

        ${generateConfusedButton(task.id)}

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

        ${autoAdvanceBanner}
      </div>`;

    // Scripts inserted via innerHTML do not run, so install these handlers after
    // the task markup (including its popup) is in the document.
    window._openAoiHelp = (aoiId) => {
      const popup = document.getElementById(`static-help-popup-${task.id}`);
      if (!popup) return;
      const template = document.createElement('template');
      template.innerHTML = generateStaticHelpPopup(task.id, aoiId);
      popup.querySelector('.static-help-faq').innerHTML = template.content.querySelector('.static-help-faq').innerHTML;
      popup.style.display = 'flex';
      window._currentAoiId = aoiId;
    };
    window._closeAoiHelp = () => {
      const popup = document.getElementById(`static-help-popup-${task.id}`);
      if (popup) popup.style.display = 'none';
      window._currentAoiId = null;
    };

    // HTML controls cannot live directly in SVG <g> elements. Replace the
    // placeholder with a foreignObject placed beside each line instead.
    document.querySelectorAll('#task-stimulus svg [data-aoi]').forEach(aoi => {
      const aoiId = aoi.dataset.aoi;
      document.querySelectorAll(`[data-aoi-help="${aoiId}"]`).forEach(button => button.remove());
      const box = aoi.getBBox();
      const control = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      control.setAttribute('x', Math.min(box.x + box.width + 12, 760));
      control.setAttribute('y', Math.max(box.y - 14, 4));
      control.setAttribute('width', '30');
      control.setAttribute('height', '30');
      control.innerHTML = `<button xmlns="http://www.w3.org/1999/xhtml" type="button" aria-label="Help for ${aoiId}"
        style="width:28px;height:28px;padding:0;background:#f3f4f6;border:1px solid #d1d5db;border-radius:50%;cursor:pointer;font-size:17px;font-weight:700;color:#374151;"
      >?</button>`;
      control.firstElementChild.onclick = event => {
        event.stopPropagation();
        window._openAoiHelp(aoiId);
        return false;
      };
      aoi.appendChild(control);
    });


    // Expose logging function globally for static help interactions
    window._logStaticHelpItem = (index, question) => {
      _logStaticHelpInteraction(index, question);
    };

    // Expose confused button handler for user_initiated condition
    window._handleConfusedClick = async () => {
      const subjectId = sessionData.participantId || sessionData.PROLIFIC_PID || 'participant-1';
      
      // Use the tree ensemble classifier to predict AOI and SA level from recent gaze data
      console.log('[confused-button] Running classifier prediction...');
      const prediction = await predictFromGaze(2000);
      
      if (!prediction) {
        console.error('[confused-button] Classifier prediction failed, using fallback');
        // Fallback to simple heuristics if classifier fails
        const aoiId = _getMostLookedAtAoi(2000);
        const aoiType = _inferAoiTypeFromTask(currentTask?.id);
        const saLevel = _inferSaLevelFromRecentBehavior();
        
        _triggerConfusionEvent(subjectId, aoiType, aoiId, saLevel, 'user_initiated_button_fallback', 0.5);
        return;
      }
      
      console.log('[confused-button] Classifier prediction:', prediction);
      
      // Use classifier predictions
      const aoiId = prediction.aoiId;
      const aoiType = inferAoiType(aoiId) || _inferAoiTypeFromTask(currentTask?.id);
      const saLevelNumeric = prediction.saLevel;
      const saLevel = SA_LEVEL_FROM_NUMERIC[saLevelNumeric] || saLevelNumeric;
      const confidence = prediction.saConfidence;
      
      // Log the button click with classifier predictions
      sessionData.events = sessionData.events || [];
      sessionData.events.push({
        type: 'confused_button_click',
        task_id: currentTask?.id || null,
        aoi_type: aoiType,
        aoi_id: aoiId,
        sa_level: saLevel,
        sa_level_numeric: saLevelNumeric,
        classifier_confidence: confidence,
        confusion_probability: prediction.confusion.probability,
        classifier_features: prediction.features,
        timestamp: Date.now(),
      });
      
      console.log('[confused-button] Clicked - Task:', currentTask?.id, 'AOI:', aoiId, 'Type:', aoiType, 'SA:', saLevel, 'Confidence:', confidence);
      
      // Trigger the confusion event with classifier predictions
      _triggerConfusionEvent(subjectId, aoiType, aoiId, saLevel, 'user_initiated_button', confidence);
    };
    
    function _triggerConfusionEvent(subjectId, aoiType, aoiId, saLevel, triggeringFeature, confidence) {
      onConfusionFired({
        subjectId,
        taskId: currentTask?.id || null,
        aoiType,
        aoiId,
        saLevel,
        triggeringFeature,
        confidence,
      });
    }

    function _getMostLookedAtAoi(windowMs) {
      const now = Date.now();
      const gazeLog = sessionData.gazeLog || [];
      
      console.log('[aoi-detection] Total gaze events in session:', gazeLog.length);
      
      // Filter gaze events within the time window
      const recentGaze = gazeLog.filter(g => g.t && (now - g.t) <= windowMs);
      
      console.log('[aoi-detection] Gaze events in last', windowMs, 'ms:', recentGaze.length);
      
      if (recentGaze.length === 0) {
        console.log('[aoi-detection] No recent gaze events - check if gaze tracking is active');
        return null;
      }
      
      // Log sample of recent gaze events to debug
      console.log('[aoi-detection] Sample recent gaze events:', recentGaze.slice(0, 5).map(g => ({
        timestamp: g.t,
        aoi_id: g.aoi_id,
        x: g.x,
        y: g.y
      })));
      
      // Count occurrences of each AOI ID
      const aoiCounts = {};
      recentGaze.forEach(g => {
        const aoiId = g.aoi_id || 'null';
        aoiCounts[aoiId] = (aoiCounts[aoiId] || 0) + 1;
      });
      
      console.log('[aoi-detection] AOI counts in window:', aoiCounts);
      
      // Find the AOI with the highest count
      let maxCount = 0;
      let mostLookedAtAoi = null;
      
      for (const [aoiId, count] of Object.entries(aoiCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostLookedAtAoi = aoiId === 'null' ? null : aoiId;
        }
      }
      
      const percentage = (maxCount / recentGaze.length * 100).toFixed(1);
      console.log('[aoi-detection] Window:', windowMs, 'ms, Events:', recentGaze.length, 
                  'Most looked at:', mostLookedAtAoi, `(${percentage}%)`);
      
      return mostLookedAtAoi;
    }

    function _inferAoiTypeFromTask(taskId) {
      // Map tasks to their primary AOI types
      const taskToAoiType = {
        'broken-nav': 'navigation',
        'ambiguous-form': 'form_field',
        'data-table': 'data_table_cell',
        'visual-search': 'diagram_or_figure',
        'reading-inference': 'text_content',
        'math-problem': 'text_content',
        'instruction-following': 'icon_button',
        'error-diagnosis': 'text_content',
      };
      return taskToAoiType[taskId] || 'unknown';
    }

    function _inferAoiType(aoiId) {
      const id = String(aoiId || '').toLowerCase();
      if (!id) return 'unknown';
      if (id.includes('field') || id.includes('input') || id.includes('form')) return 'form_field';
      if (id.includes('nav') || id.includes('menu') || id.includes('button') || id.includes('next')) return 'navigation';
      if (id.includes('table') || id.includes('cell') || id.includes('row')) return 'data_table_cell';
      if (id.includes('text') || id.includes('paragraph') || id.includes('content')) return 'text_content';
      if (id.includes('image') || id.includes('figure') || id.includes('diagram')) return 'diagram_or_figure';
      return 'unknown';
    }

    function _inferSaLevelFromRecentBehavior() {
      // Simple heuristic: if user clicked the button, they're likely at SA level 2 or 3
      // In a real implementation, this would use the live classifier's feature computation
      const recentGaze = sessionData.gazeLog?.slice(-20) || [];
      const aoiIds = recentGaze.map(g => g.aoi_id).filter(Boolean);
      const uniqueAois = new Set(aoiIds);
      
      // If they've visited many different AOIs recently, likely higher confusion
      if (uniqueAois.size > 5) return 3;
      if (uniqueAois.size > 3) return 2;
      return 1;
    }

    // Real-time validation for ambiguous-form: enable/disable Submit button
    if (task.id === 'ambiguous-form') {
      const btn = document.getElementById('submit-task-btn');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';

      const checkFilled = () => {
        const inputs = Array.from(document.querySelectorAll('#task-stimulus input[type="text"]:not([disabled]), #task-stimulus select:not([disabled])'));
        const allFilled = inputs.every(inp => inp.value.trim() !== '');
        btn.disabled = !allFilled;
        btn.style.opacity = allFilled ? '1' : '0.5';
        btn.style.cursor = allFilled ? 'pointer' : 'not-allowed';
      };

      document.querySelectorAll('#task-stimulus input, #task-stimulus select').forEach(el => {
        el.addEventListener('input', checkFilled);
        el.addEventListener('change', checkFilled);
      });
      // Initial check (in case of browser autofill)
      checkFilled();
    }


    // Disable submit button by default for ambiguous-form and listen to changes
    if (task.id === 'ambiguous-form') {
      const submitBtn = document.getElementById('submit-task-btn');
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.cursor = 'not-allowed';

      const validateAmbiguousForm = () => {
        const inputs = Array.from(document.querySelectorAll('#task-stimulus input[type="text"]:not([disabled]), #task-stimulus select:not([disabled])'));
        const allFilled = inputs.every(inp => inp.value.trim() !== '');
        
        if (allFilled) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.style.cursor = 'pointer';
        } else {
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.5';
          submitBtn.style.cursor = 'not-allowed';
        }
      };

      document.querySelectorAll('#task-stimulus input, #task-stimulus select').forEach(el => {
        el.addEventListener('input', validateAmbiguousForm);
        el.addEventListener('change', validateAmbiguousForm);
      });
      
      // Run once on load
      validateAmbiguousForm();
    }

    
    // --- Ambiguous Form: Dynamic Submit Button Logic ---
    if (task.id === 'ambiguous-form') {
      const submitBtn = document.getElementById('submit-task-btn');
      const inputs = Array.from(document.querySelectorAll('#task-stimulus input, #task-stimulus select'));
      
      const checkCompletion = () => {
        const allFilled = inputs.every(i => i.value.trim() !== '');
        submitBtn.disabled = !allFilled;
        submitBtn.style.opacity = allFilled ? '1' : '0.5';
        submitBtn.style.cursor = allFilled ? 'pointer' : 'not-allowed';
      };

      inputs.forEach(inp => {
        inp.addEventListener('input', checkCompletion);
        inp.addEventListener('change', checkCompletion);
      });
      
      // Initial check
      checkCompletion();
    }

    if (task.id === 'instruction-following') {
      const taskStimulus = document.getElementById('task-stimulus');
      if (taskStimulus) {
        const tabButtons = Array.from(taskStimulus.querySelectorAll('#if-tabs button[data-tab]'));
        const panels = [
          taskStimulus.querySelector('#if-panel-0'),
          taskStimulus.querySelector('#if-panel-1'),
          taskStimulus.querySelector('#if-panel-2'),
        ];

        const updateTabState = (activeIndex) => {
          panels.forEach((panel, index) => {
            if (panel) panel.style.display = index === activeIndex ? 'block' : 'none';
          });
          tabButtons.forEach((button, index) => {
            const isActive = index === activeIndex;
            button.style.background = isActive ? '#fff' : '#f9fafb';
            button.style.borderBottom = isActive ? '3px solid #4f46e5' : 'none';
            button.style.color = isActive ? '#1f2937' : '#6b7280';
          });

          if (activeIndex === 1) {
            const dnsInput = taskStimulus.querySelector('#if-dns-input');
            dnsInput?.focus();
          }
        };

        tabButtons.forEach((button, index) => {
          button.addEventListener('click', () => updateTabState(index));
        });

        updateTabState(0);

        const saveBtn = taskStimulus.querySelector('#if-save-btn');
        saveBtn?.addEventListener('click', () => {
          saveBtn.textContent = '✓ Saved';
          saveBtn.style.background = '#059669';
          setTimeout(() => {
            saveBtn.textContent = 'Save Changes';
            saveBtn.style.background = '#4f46e5';
          }, 1600);
        });
      }
    }

    document.getElementById('submit-task-btn').onclick = (e) => {
      e.preventDefault();
      const errors = _validateResponses();
      const errEl  = document.getElementById('submit-error');
      if (errors.length > 0) {
        if (errEl) { errEl.textContent = errors[0]; errEl.style.display = 'block'; }
        errEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      if (currentTask?.attention_check && !_isAttentionCheckCorrect()) {
        const keepTrying = _handleAttentionCheckFailure();
        if (keepTrying) {
          errEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }

      if (currentTask?.attention_check) {
        _logEvent('attention-check-passed', {
          task_id: currentTask.id,
          response: _getAttentionCheckResponse(),
        });
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
    sessionData.currentTaskId = currentTask.id;

    gazeManager.setActiveTask(currentTask.id);
    if (!currentTask.no_time_limit) {
      gazeManager.startOverrunTimer(
        currentTask.id,
        CONFIG.TASK_EXPECTED_DURATIONS[currentTask.id],
        CONFIG.TIME_OVERRUN_FACTOR
      );
    }

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

    // ── Auto-advance countdown ────────────────────────────────────────────────
    if (CONFIG.AUTO_ADVANCE_ENABLED && CONFIG.AUTO_ADVANCE_TIMEOUTS[currentTask.id] > 0) {
      const timeoutSecs = CONFIG.AUTO_ADVANCE_TIMEOUTS[currentTask.id];
      let remainingSecs = timeoutSecs;

      const updateCountdown = () => {
        const countdownEl = document.getElementById('countdown-timer');
        const banner = document.getElementById('auto-advance-banner');
        if (remainingSecs <= 10) {
          if (banner) banner.style.display = 'block';
        }
        if (countdownEl) {
          countdownEl.textContent = remainingSecs;
        }
        remainingSecs--;
      };

      // Start countdown display; keep banner hidden until the last 10 seconds
      updateCountdown();
      autoAdvanceCountdown = setInterval(updateCountdown, 1000);

      // Set up auto-submit
      autoAdvanceTimeout = setTimeout(() => {
        clearInterval(autoAdvanceCountdown);
        autoAdvanceCountdown = null;
        _submitResponse(currentTask.id, { responses: _getResponses() }, { autoSubmitted: true, autoAdvanced: true });
      }, timeoutSecs * 1000);

      _logEvent('auto-advance-start', { timeout_secs: timeoutSecs });
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
      auto_advanced:        options.autoAdvanced === true,
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
      showScreen('screen-task-complete');
      return;
    }
    currentTask = tasks[currentTaskIndex];
    sessionData.currentTaskId = currentTask.id;
    _logEvent('task-load', { task_id: currentTask.id });
    _renderInstructionScreen(currentTask);
    showScreen('screen-task-instruction');
  }

  return { loadNextTask, submitResponse: _submitResponse };
}
