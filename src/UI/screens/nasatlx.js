import { sessionData } from '../../experiment/session';
import { showScreen } from '../../experiment/router';

const DIMENSIONS = [
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
    description: 'How much physical activity was required (e.g. pushing, pulling, turning, controlling, activating, etc)? Was the task easy or demanding, slow or brisk, slack or strenuous, restful or laborious?'
  },
  {
    id: 'temporal',
    label: 'Temporal Demand',
    low: 'Low',
    high: 'High',
    description: 'How much time pressure did you feel due to the rate of pace at which the tasks or task elements occurred? Was the pace slow and leisurely or rapid and frantic?'
  },
  {
    id: 'performance',
    label: 'Performance',
    low: 'Good',
    high: 'Poor',
    description: 'How successful were you in accomplishing the goals of the task? Was your performance perfect, adequate, or poor?'
  },
  {
    id: 'effort',
    label: 'Effort',
    low: 'Low',
    high: 'High',
    description: 'How hard did you have to work mentally and physically to accomplish your level of performance?'
  },
  {
    id: 'frustration',
    label: 'Frustration',
    low: 'Low',
    high: 'High',
    description: 'How insecure, discouraged, irritated, stressed, and annoyed were you during the task?'
  },
];

const SCALE_VALUES = Array.from({ length: 20 }, (_, index) => (index + 1) * 5);
let selectedRatings = {};

export function renderNasaTlxScreen() {
  const el = document.getElementById('screen-nasatlx');
  if (!el) return;

  selectedRatings = {};

  const scalesHtml = DIMENSIONS.map((dim, dimIndex) => {
    const topCells = SCALE_VALUES.map((value) => `
      <td
        id="t_${dimIndex}_${value}"
        class="top${value % 10 === 5 ? '1' : '2'}"
        data-dim-index="${dimIndex}"
        data-value="${value}"
        onmouseup="scaleClick(${dimIndex}, ${value});"
        style="width:5%; height:18px; cursor:pointer; border:1px solid #d1d5db; background:#FFFFFF;"
      ></td>
    `).join('');

    const bottomCells = SCALE_VALUES.map((value) => `
      <td
        id="b_${dimIndex}_${value}"
        class="bottom"
        data-dim-index="${dimIndex}"
        data-value="${value}"
        onmouseup="scaleClick(${dimIndex}, ${value});"
        style="width:5%; height:18px; cursor:pointer; border:1px solid #d1d5db; background:#FFFFFF;"
      ></td>
    `).join('');

    return `
      <div style="margin-bottom:32px; padding:20px; background:#f9fafb; border-radius:14px; border:1px solid #e5e7eb;">
        <div style="margin-bottom:16px; font-size:18px; font-weight:700; color:#111827;">${dim.label}</div>
        <div class="ratingScale" id="scale-${dim.id}" style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <tbody>
              <tr>
                <td colspan="20" style="padding:10px 0; text-align:center; font-weight:700; color:#111827; border-bottom:1px solid #d1d5db;">${dim.label}</td>
              </tr>
              <tr>
                ${topCells}
              </tr>
              <tr>
                ${bottomCells}
              </tr>
              <tr>
                <td colspan="10" style="padding-top:8px; font-size:13px; color:#4b5563; text-align:left;">${dim.low}</td>
                <td colspan="10" style="padding-top:8px; font-size:13px; color:#4b5563; text-align:right;">${dim.high}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px; font-size:14px; color:#4b5563; line-height:1.7;">${dim.description}</div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <style>
      .ratingScale td.selected { background:#c7d2fe !important; }
    </style>
    <div style="max-width:840px; margin:0 auto; padding:32px 24px;">
      <h1 style="margin:0 0 12px; font-size:32px; color:#111827;">Workload Assessment</h1>
      <p style="margin:0 0 28px; color:#4b5563; font-size:16px; line-height:1.7;">
        You have completed the tasks. Please rate your experience on each of the following scales before finishing the study.
      </p>
      <div id="nasatlx-form" style="display:grid; gap:0;">
        ${scalesHtml}
        <button
          id="nasatlx-submit"
          type="button"
          style="margin-top:16px; padding:14px 32px; background:#059669; color:#fff; border:none; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition:background 0.2s;"
          onmouseover="this.style.background='#047857'"
          onmouseout="this.style.background='#059669'"
        >
          Submit &amp; Continue
        </button>
      </div>
    </div>
  `;

  window.scaleClick = _scaleClick;
  DIMENSIONS.forEach((_, dimIndex) => _scaleClick(dimIndex, 50));
  document.getElementById('nasatlx-submit').onclick = _handleSubmit;
}

function _scaleClick(dimIndex, value) {
  const dimId = DIMENSIONS[dimIndex]?.id;
  if (!dimId) return;

  selectedRatings[dimId] = value;

  const wrapper = document.getElementById(`scale-${dimId}`);
  if (!wrapper) return;

  wrapper.querySelectorAll('td[data-dim-index="' + dimIndex + '"]').forEach((cell) => {
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
  const missingDimensions = DIMENSIONS.filter((dim) => selectedRatings[dim.id] == null);
  if (missingDimensions.length > 0) {
    alert('Please select a rating for every dimension before continuing.');
    return;
  }

  sessionData.nasaTLX = {
    timestamp: Date.now(),
    responses: { ...selectedRatings },
  };

  sessionData.events.push({
    type: 'nasatlx-submit',
    timestamp: Date.now(),
    responses: { ...selectedRatings },
  });

  showScreen('screen-debrief');
}
