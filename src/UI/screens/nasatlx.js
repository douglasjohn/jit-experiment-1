import { sessionData } from '../../experiment/session';
import { showScreen } from '../../experiment/router';
import { renderDebriefScreen } from './debrief';

export function renderNasaTlxScreen() {
  const el = document.getElementById('screen-nasatlx');
  if (!el) return;

  const dimensions = [
    {
      id: 'mental',
      label: 'Mental Demand',
      low: 'Low',
      high: 'High',
      description: 'How much mental and perceptual activity was required (e.g. thinking, deciding, calculating, remembering, looking, searching, etc)? Was the task easy or demanding, simple or complex, exacting or forgiving?'
    },
    {
      id: 'physical',
      label: 'Physical Demand',
      low: 'Low',
      high: 'High',
      description: 'How much physical activity was required? Was the task easy or demanding, slack or strenuous, restful or laborious?'
    },
    {
      id: 'temporal',
      label: 'Temporal Demand',
      low: 'Low',
      high: 'High',
      description: 'How much time pressure did you feel due to the pace or rate at which the tasks or task elements occurred? Was the pace slow and leisurely or rapid and frantic?'
    },
    {
      id: 'performance',
      label: 'Performance',
      low: 'Good',
      high: 'Poor',
      description: 'How successful were you in accomplishing what you were asked to do? Was your performance perfect, adequate, or poor?'
    },
    {
      id: 'effort',
      label: 'Effort',
      low: 'Low',
      high: 'High',
      description: 'How hard did you have to work to accomplish your level of performance?'
    },
    {
      id: 'frustration',
      label: 'Frustration',
      low: 'Low',
      high: 'High',
      description: 'How insecure, discouraged, irritated, stressed, and annoyed were you?'
    },
  ];

  const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);
  const defaultValue = 50;

  const scaleRows = dimensions.map((dim, dimIndex) => {
    const cells = values.map((value) => {
      const topStyle = value === 100 ? 'background:#AAAAAA;' : 'background:#FFFFFF;';
      const bottomStyle = value === 100 ? 'background:#AAAAAA;' : 'background:#FFFFFF;';
      return {
        value,
        topStyle,
        bottomStyle,
      };
    });

    return `
      <div style="margin-bottom:32px; padding:18px; background:#f9fafb; border-radius:12px; border:1px solid #e5e7eb;">
        <div style="font-size:16px; font-weight:700; color:#111827; margin-bottom:14px;">${dim.label}</div>
        <table class="ratingScale" id="scale-${dim.id}" style="width:100%; border-collapse:collapse;">
          <tbody>
            <tr>
              <td colspan="20" class="heading" style="padding:10px 0; font-weight:700; text-align:center; border-bottom:1px solid #d1d5db; color:#1f2937;">${dim.label}</td>
            </tr>
            <tr>
              ${cells.map((cell) => `
                <td
                  id="t_${dimIndex}_${cell.value}"
                  class="top${cell.value % 10 === 5 ? '1' : '2'}"
                  data-scale="true"
                  data-dim-index="${dimIndex}"
                  data-value="${cell.value}"
                  onmouseup="scaleClick(${dimIndex}, ${cell.value});"
                  bgcolor="#FFFFFF"
                  style="width:5%; height:18px; cursor:pointer; border:1px solid #d1d5db; ${cell.topStyle}"
                ></td>
              `).join('')}
            </tr>
            <tr>
              ${cells.map((cell) => `
                <td
                  id="b_${dimIndex}_${cell.value}"
                  class="bottom"
                  data-scale="true"
                  data-dim-index="${dimIndex}"
                  data-value="${cell.value}"
                  onmouseup="scaleClick(${dimIndex}, ${cell.value});"
                  bgcolor="#FFFFFF"
                  style="width:5%; height:18px; cursor:pointer; border:1px solid #d1d5db; ${cell.bottomStyle}"
                ></td>
              `).join('')}
            </tr>
            <tr>
              <td colspan="10" class="left" style="padding-top:8px; font-size:13px; color:#4b5563; text-align:left;">${dim.low}</td>
              <td colspan="10" class="right" style="padding-top:8px; font-size:13px; color:#4b5563; text-align:right;">${dim.high}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:14px; font-size:14px; color:#4b5563; line-height:1.6;">${dim.description}</div>
        <input type="hidden" id="${dim.id}" value="${defaultValue}">
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <style>
      .ratingScale td.selected { background:#c7d2fe !important; }
    </style>
    <div style="max-width:760px; margin:0 auto; padding:32px 24px;">
      <h1 style="margin:0 0 8px; font-size:28px; color:#111827;">Workload Assessment</h1>
      <p style="margin:0 0 28px; color:#6b7280; font-size:15px; line-height:1.6;">
        Thinking about the study overall, rate your experience on each dimension by clicking the scale cell that best matches your answer.
      </p>

      <div id="nasatlx-form" style="display:grid; gap:0;">
        ${scaleRows}

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

  window.scaleClick = _scaleClick;
  dimensions.forEach((_, dimIndex) => _scaleClick(dimIndex, defaultValue));
  document.getElementById('nasatlx-submit').onclick = _handleSubmit;
}

function _scaleClick(dimIndex, value) {
  const dimId = ['mental', 'physical', 'temporal', 'performance', 'effort', 'frustration'][dimIndex];
  if (!dimId) return;

  const hiddenInput = document.getElementById(dimId);
  if (hiddenInput) hiddenInput.value = value;

  const wrapper = document.getElementById(`scale-${dimId}`);
  if (!wrapper) return;

  wrapper.querySelectorAll('td[data-scale]').forEach((cell) => {
    cell.classList.remove('selected');
    cell.style.backgroundColor = cell.getAttribute('bgcolor') || '#FFFFFF';
  });

  const topCell = document.getElementById(`t_${dimIndex}_${value}`);
  const bottomCell = document.getElementById(`b_${dimIndex}_${value}`);
  [topCell, bottomCell].forEach((cell) => {
    if (cell) {
      cell.classList.add('selected');
      cell.style.backgroundColor = '#c7d2fe';
    }
  });
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
