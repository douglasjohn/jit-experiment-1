import { sessionData } from '../../experiment/session';
import { showScreen } from '../../experiment/router';
import { renderDebriefScreen } from './debrief';

export function renderNasaTlxScreen() {
  const el = document.getElementById('screen-nasatlx');
  if (!el) return;

  const dimensions = [
    { id: 'mental',      label: 'Mental Demand',    low: 'Low',  high: 'High' },
    { id: 'physical',    label: 'Physical Demand',   low: 'Low',  high: 'High' },
    { id: 'temporal',    label: 'Temporal Demand',   low: 'Low',  high: 'High' },
    { id: 'performance', label: 'Performance',       low: 'Good', high: 'Poor' },
    { id: 'effort',      label: 'Effort',            low: 'Low',  high: 'High' },
    { id: 'frustration', label: 'Frustration',       low: 'Low',  high: 'High' },
  ];

  const sliderRows = dimensions.map(dim => {
    // Physical demand is pre-set to a low value for computer-based tasks
    // const isPhysical     = dim.id === 'physical';
    // const defaultValue   = isPhysical ? '5' : '50';
    // const disabledAttr   = isPhysical ? 'disabled' : '';
    // const disabledStyle  = isPhysical ? 'opacity:0.6;' : '';
    // const noteHTML       = isPhysical
    //   ? `<div style="margin-top:6px; font-size:13px; color:#6b7280; font-style:italic;">
    //        Pre-set to a low value — this is a computer-based study with minimal physical demand.
    //      </div>`
    //   : '';
    const defaultValue   = '50';
    const disabledAttr   = '';
    const disabledStyle  = '';
    const noteHTML       = '';

    return `
      <div style="margin-bottom:20px; padding:16px; background:#f9fafb; border-radius:8px; border:1px solid #e5e7eb;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <label for="${dim.id}" style="font-weight:600; color:#1f2937;">${dim.label}</label>
          <span id="${dim.id}-value" style="font-weight:700; color:#4f46e5; font-size:16px; min-width:32px; text-align:right;">${defaultValue}</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span style="font-size:12px; color:#6b7280; min-width:36px;">${dim.low}</span>
          <input
            type="range"
            id="${dim.id}"
            min="0" max="100" step="5"
            value="${defaultValue}"
            ${disabledAttr}
            style="flex:1; cursor:pointer; accent-color:#4f46e5; ${disabledStyle}"
            oninput="document.getElementById('${dim.id}-value').textContent = this.value"
          />
          <span style="font-size:12px; color:#6b7280; min-width:36px; text-align:right;">${dim.high}</span>
        </div>
        ${noteHTML}
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:32px 24px;">
      <h1 style="margin:0 0 8px; font-size:28px; color:#111827;">Workload Assessment</h1>
      <p style="margin:0 0 28px; color:#6b7280; font-size:15px; line-height:1.6;">
        Thinking about the study overall, rate your experience on each dimension.
        Drag each slider from 0 (left anchor) to 100 (right anchor).
      </p>

      <div id="nasatlx-form" style="display:grid; gap:0;">
        ${sliderRows}

        <button
          id="nasatlx-submit"
          type="button"
          style="
            margin-top:24px; padding:14px 32px;
            background:#059669; color:#fff;
            border:none; border-radius:8px;
            font-weight:600; font-size:16px;
            cursor:pointer; align-self:flex-start;
            transition:background 0.2s;
          "
          onmouseover="this.style.background='#047857'"
          onmouseout="this.style.background='#059669'"
        >
          Submit &amp; Continue
        </button>
      </div>
    </div>
  `;

  document.getElementById('nasatlx-submit').onclick = _handleSubmit;
}

function _handleSubmit() {
  const dimensions = ['mental', 'physical', 'temporal', 'performance', 'effort', 'frustration'];
  const responses  = {};

  dimensions.forEach(dim => {
    const input = document.getElementById(dim);
    if (input) responses[dim] = parseInt(input.value, 10);
  });

  sessionData.nasaTLX = {
    timestamp: Date.now(),
    responses,
  };

  sessionData.events.push({
    type:         'nasatlx-submit',
    timestamp:    Date.now(),
    nasatlx_data: responses,
  });

  showScreen('screen-debrief');
  renderDebriefScreen();
}
