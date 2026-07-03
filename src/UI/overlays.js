import { sessionData } from '../experiment/session';

const PROBE_OVERLAY_ID = 'experience-probe-overlay';
const INTERVENTION_OVERLAY_ID = 'jit-intervention-overlay';
let probeState = {
  visible: false,
  responseStartAt: 0,
  selectedClarity: null,
  resolveComplete: null
};

let interventionState = { timerId: null };

function getProbeOverlayRoot() {
  let root = document.getElementById(PROBE_OVERLAY_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = PROBE_OVERLAY_ID;
    document.body.appendChild(root);
  }
  return root;
}

function getInterventionOverlayRoot() {
  let root = document.getElementById(INTERVENTION_OVERLAY_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = INTERVENTION_OVERLAY_ID;
    root.style.cssText = 'position:fixed; inset:0; z-index:1600; pointer-events:none;';
    document.body.appendChild(root);
  }
  return root;
}

function clearInterventionOverlay() {
  const root = getInterventionOverlayRoot();
  if (interventionState.timerId) {
    window.clearTimeout(interventionState.timerId);
    interventionState.timerId = null;
  }
  root.innerHTML = '';
  root.style.display = 'none';
}

function hideInterventionOverlay() {
  clearInterventionOverlay();
}

export function initExperienceProbeOverlay() {
  const root = getProbeOverlayRoot();
  root.style.display = 'none';
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.zIndex = '1200';
  root.style.pointerEvents = 'none';
  root.style.background = 'transparent';
  root.innerHTML = '';
}

export function hideExperienceProbeOverlay() {
  const root = getProbeOverlayRoot();
  if (!probeState.visible) return;

  root.style.display = 'none';
  root.style.pointerEvents = 'none';
  root.innerHTML = '';

  probeState.visible = false;
  probeState.responseStartAt = 0;
  probeState.selectedClarity = null;

  window.gazeManager?.resumeLogging();
}

function renderProbeContent({ taskId, triggerTime, triggerType }) {
  return `
    <div id="experience-probe-overlay-backdrop" style="position:absolute; inset:0; background:rgba(0, 0, 0, 0.55); backdrop-filter: blur(1px); display:flex; align-items:center; justify-content:center; padding: 24px;">
      <div id="experience-probe-card" style="width:min(640px,100%); background:#fff; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.25); padding:28px; text-align:left; color:#1b1b1f; font-family:system-ui, sans-serif;">

        <div id="experience-probe-questions" style="margin-top:4px;">
          <h2 style="margin-top:0; margin-bottom:16px; font-size:22px;">
            How well did you understand what you were just doing?
          </h2>
          <div id="probe-rating-wrapper" style="margin-bottom:24px;">
            <div id="probe-rating" style="display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:24px;">
              ${[1, 2, 3, 4, 5].map((value) => `
                <button type="button" data-probe-rating="${value}"
                  style="border:1px solid #d1d5db; border-radius:12px; padding:16px 0;
                  font-size:16px; background:#f9fafb; cursor:pointer; color:#111;">
                  ${value}
                </button>
              `).join('')}
            </div>
            <div style="
                display:flex;
                justify-content:space-between;
                margin-top:8px;
                font-size:13px;
                color:#6b7280;
              ">
              <span>1 – Don't understand</span>
              <span>5 – Understand completely</span>
            </div>
          </div>

          <div id="probe-sa" style="display:none; margin-top:18px;">
            <h3 style="margin:0 0 14px; font-size:18px;">I was confused because:</h3>

            <div style="display:flex; flex-direction:column; gap:12px;">
              <button type="button" data-probe-sa="1"
                style="border:1px solid #d1d5db; border-radius:12px; padding:14px 18px;
                text-align:left; background:#f8fafc; cursor:pointer;">
                I didn’t see the relevant information
              </button>

              <button type="button" data-probe-sa="2"
                style="border:1px solid #d1d5db; border-radius:12px; padding:14px 18px;
                text-align:left; background:#f8fafc; cursor:pointer;">
                I didn't understand what I was reading or seeing
              </button>

              <button type="button" data-probe-sa="3"
                style="border:1px solid #d1d5db; border-radius:12px; padding:14px 18px;
                text-align:left; background:#f8fafc; cursor:pointer;">
                I didn't know what to do next
              </button>
            </div>

            <div style="margin-top:12px; font-size:13px; color:#6b7280;">
              (Select the option that best describes your confusion)
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

function completeProbe({ taskId, clarityRating, saLevel, triggerTime }) {
  const responseTimeMs = probeState.responseStartAt
    ? Date.now() - probeState.responseStartAt
    : 0;

  sessionData.probeResponses = sessionData.probeResponses || [];
  sessionData.probeResponses.push({
    task_id: taskId || null,
    trigger_time: triggerTime || Date.now(),
    clarity_rating: clarityRating,
    sa_level: saLevel ?? null,
    response_time_ms: responseTimeMs
  });

  hideExperienceProbeOverlay();

  if (typeof probeState.resolveComplete === 'function') {
    probeState.resolveComplete();
    probeState.resolveComplete = null;
  }
}

function showProbeQuestions() {
  const root = getProbeOverlayRoot();

  const ratingButtons = Array.from(root.querySelectorAll('[data-probe-rating]'));
  const saContainer = root.querySelector('#probe-sa');

  probeState.responseStartAt = Date.now();

  ratingButtons.forEach((button) => {
    button.onclick = () => {
      const ratingValue = Number(button.dataset.probeRating);
      probeState.selectedClarity = ratingValue;

      ratingButtons.forEach((btn) => {
        btn.style.borderColor = btn === button ? '#8b5cf6' : '#d1d5db';
        btn.style.background = btn === button ? '#eef2ff' : '#f9fafb';
      });

      if (ratingValue <= 3) {
        saContainer.style.display = 'block';
      } else {
        completeProbe({
          taskId: root.dataset.taskId,
          clarityRating: ratingValue,
          saLevel: null,
          triggerTime: Number(root.dataset.triggerTime)
        });
      }
    };
  });

  const saButtons = Array.from(root.querySelectorAll('[data-probe-sa]'));
  saButtons.forEach((button) => {
    button.onclick = () => {
      const saValue = Number(button.dataset.probeSa);

      completeProbe({
        taskId: root.dataset.taskId,
        clarityRating: probeState.selectedClarity,
        saLevel: saValue,
        triggerTime: Number(root.dataset.triggerTime)
      });
    };
  });
}

export function showExperienceProbeOverlay({
  taskId = null,
  triggerType = 'manual',
  triggerTime = Date.now()
} = {}) {

  if (probeState.visible) return Promise.resolve();

  const root = getProbeOverlayRoot();
  root.dataset.taskId = taskId || '';
  root.dataset.triggerTime = String(triggerTime);

  probeState.visible = true;

  root.style.display = 'block';
  root.style.pointerEvents = 'auto';
  root.innerHTML = renderProbeContent({ taskId, triggerTime, triggerType });

  window.gazeManager?.startRawWindow(5000);
  window.gazeManager?.pauseLogging();

  showProbeQuestions();

  probeState.resolveComplete = null;

  return new Promise((resolve) => {
    probeState.resolveComplete = resolve;
  });
}

export function moveGazeDot(x, y, visible = false) { 
  const gazeDot = document.getElementById('gaze-dot');
  gazeDot.style.transform = `translate(${x}px, ${y}px)`;
  gazeDot.style.display = visible ? 'block' : 'none';
}

export function showFixationIndicator(x, y) {
  // intentionally disabled (kept for future use)
}