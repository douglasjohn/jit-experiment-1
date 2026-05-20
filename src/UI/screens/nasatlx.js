import { sessionData } from '../../experiment/session';
import { showScreen } from '../../experiment/router';

const scale = [
  'Mental Demand',
  'Physical Demand',
  'Temporal Demand',
  'Performance',
  'Effort',
  'Frustration',
];

const left = ['Low', 'Low', 'Low', 'Good', 'Low', 'Low'];
const right = ['High', 'High', 'High', 'Poor', 'High', 'High'];
const definitions = [
  'How much mental and perceptual activity was required (e.g. thinking, deciding, calculating, remembering, looking, searching, etc)? Was the task easy or demanding, simple or complex, exacting or forgiving?',
  'How much physical activity was required (e.g. pushing, pulling, turning, controlling, activating, etc)? Was the task easy or demanding, slow or brisk, slack or strenuous, restful or laborious?',
  'How much time pressure did you feel due to the rate of pace at which the tasks or task elements occurred? Was the pace slow and leisurely or rapid and frantic?',
  'How successful do you think you were in accomplishing the goals of the task set by the experimenter (or yourself)? How satisfied were you with your performance in accomplishing these goals?',
  'How hard did you have to work (mentally and physically) to accomplish your level of performance?',
  'How insecure, discouraged, irritated, stressed and annoyed versus secure, gratified, content, relaxed and complacent did you feel during the task?',
];

const SCALE_VALUES = Array.from({ length: 20 }, (_, index) => (index + 1) * 5);
let ratings = [];

export function renderNasaTlxScreen() {
  const el = document.getElementById('screen-nasatlx');
  if (!el) return;

  ratings = Array(scale.length).fill(null);

  const scaleHtml = scale.map((_, index) => getScaleHTML(index)).join('');

  el.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css?family=Muli');
      #screen-nasatlx { font-family: 'Muli', Arial, sans-serif; color: black; }
      #screen-nasatlx .panel { position: relative; left: auto; top: auto; transform: none; margin: 30px auto; padding: 10px; color: black; font: 13px 'Muli'; border: 2px solid black; width: 500px; text-align: center; background: #fff; }
      #screen-nasatlx h1 { color: black; font: 30px 'Muli'; padding: 0; margin: 0 0 12px; text-align: center; }
      #screen-nasatlx p { font: 13px 'Muli'; padding: 5px; text-align: center; margin: 0; }
      #screen-nasatlx .formInstructions { margin: 10px; font-style: italic; }
      #screen-nasatlx .ratingScale { display: -webkit-inline-box; margin: 10px 0; }
      #screen-nasatlx table.scale { margin: 0; padding: 0; border-collapse: collapse; }
      #screen-nasatlx td.bottom, #screen-nasatlx td.top1, #screen-nasatlx td.top2 { width: 0.6cm; height: 0.4cm; margin: 0; padding: 0; }
      #screen-nasatlx td.bottom { border-bottom: 1px solid black; border-left: 1px solid black; border-right: 1px solid black; }
      #screen-nasatlx td.top1 { border-top: 1px solid black; border-left: 1px solid black; }
      #screen-nasatlx td.top2 { border-top: 1px solid black; border-right: 1px solid black; }
      #screen-nasatlx td.heading { font: bold 14px 'Muli'; text-align: center; padding: 4px 0; }
      #screen-nasatlx td.left, #screen-nasatlx td.right { font: 14px 'Muli'; padding-top: 8px; }
      #screen-nasatlx td.right { text-align: right; }
      #screen-nasatlx td.def { width: 300px; padding: 10px; font: 12px 'Muli'; text-align: left; }
      #screen-nasatlx button { cursor: pointer; font: 14px 'Muli'; padding: 10px 20px; border: 1px solid black; background: white; }
      #screen-nasatlx button:hover { background: #f3f4f6; }
      #screen-nasatlx .selected { background: #AAAAAA !important; }
      #screen-nasatlx .label-row { margin: 18px 0 12px; font-weight: 700; }
      #screen-nasatlx .description { font-size: 12px; margin: 8px 0 0; line-height: 1.4; }
    </style>

    <div class="panel wide">
      <h1>NASA Task Load Index</h1>
      <p class="formInstructions">Click on each scale at the point that best indicates your experience of the task.</p>
      ${scaleHtml}
      <button id="nasatlx-submit">Submit & Continue</button>
    </div>
  `;

  window.scaleClick = _scaleClick;
  document.getElementById('nasatlx-submit').onclick = _handleSubmit;
}

function getScaleHTML(index) {
  const topCells = SCALE_VALUES.map((value) => `
    <td
      id="t_${index}_${value}"
      class="top${value % 10 === 5 ? '1' : '2'}"
      onmouseup="scaleClick(${index}, ${value});"
      bgcolor="#FFFFFF"
      style="cursor:pointer;"
    ></td>
  `).join('');

  const bottomCells = SCALE_VALUES.map((value) => `
    <td
      id="b_${index}_${value}"
      class="bottom"
      onmouseup="scaleClick(${index}, ${value});"
      bgcolor="#FFFFFF"
      style="cursor:pointer;"
    ></td>
  `).join('');

  return `
    <div style="margin-bottom: 24px; text-align:left;">
      <div class="label-row">${scale[index]}</div>
      <div class="ratingScale" id="scale${index}">
        <table class="scale"><tbody>
          <tr>${topCells}</tr>
          <tr>${bottomCells}</tr>
          <tr>
            <td colspan="10" class="left">${left[index]}</td>
            <td colspan="10" class="right">${right[index]}</td>
          </tr>
        </tbody></table>
      </div>
      <div class="def">${definitions[index]}</div>
    </div>
  `;
}

function _scaleClick(index, val) {
  ratings[index] = val;

  for (let i = 5; i <= 100; i += 5) {
    const topId = `t_${index}_${i}`;
    const bottomId = `b_${index}_${i}`;
    const topCell = document.getElementById(topId);
    const bottomCell = document.getElementById(bottomId);
    if (topCell) {
      topCell.classList.remove('selected');
      topCell.bgColor = '#FFFFFF';
    }
    if (bottomCell) {
      bottomCell.classList.remove('selected');
      bottomCell.bgColor = '#FFFFFF';
    }
  }

  const selectedTop = document.getElementById(`t_${index}_${val}`);
  const selectedBottom = document.getElementById(`b_${index}_${val}`);
  if (selectedTop) {
    selectedTop.classList.add('selected');
    selectedTop.bgColor = '#AAAAAA';
  }
  if (selectedBottom) {
    selectedBottom.classList.add('selected');
    selectedBottom.bgColor = '#AAAAAA';
  }
}

function _handleSubmit() {
  const missing = ratings.map((value, index) => (value == null ? index : null)).filter((item) => item !== null);
  if (missing.length > 0) {
    alert('Please select a value for every NASA-TLX scale before continuing.');
    return;
  }

  sessionData.nasaTLX = {
    timestamp: Date.now(),
    responses: {
      mental: ratings[0],
      physical: ratings[1],
      temporal: ratings[2],
      performance: ratings[3],
      effort: ratings[4],
      frustration: ratings[5],
    },
  };

  sessionData.events.push({
    type: 'nasatlx-submit',
    timestamp: Date.now(),
    responses: { ...sessionData.nasaTLX.responses },
  });

  showScreen('screen-debrief');
}
