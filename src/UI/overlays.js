import { sessionData } from '../experiment/session';

const PROBE_OVERLAY_ID = 'experience-probe-overlay';
let probeState = {
  visible: false,
  countdownId: null,
  showQuestionsTimeoutId: null,
  responseStartAt: 0,
  selectedClarity: null,
  resolveComplete: null
};

function getProbeOverlayRoot() {
  let root = document.getElementById(PROBE_OVERLAY_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = PROBE_OVERLAY_ID;
    document.body.appendChild(root);
  }
  return root;
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
  if (!probeState.visible) {
    return;
  }

  if (probeState.countdownId) {
    clearInterval(probeState.countdownId);
    probeState.countdownId = null;
  }

  if (probeState.showQuestionsTimeoutId) {
    clearTimeout(probeState.showQuestionsTimeoutId);
    probeState.showQuestionsTimeoutId = null;
  }

  root.style.display = 'none';
  root.style.pointerEvents = 'none';
  root.innerHTML = '';
  probeState.visible = false;
  probeState.responseStartAt = 0;
  probeState.selectedClarity = null;

  window.gazeManager?.resumeLogging();
}

function renderProbeContent({ taskId, triggerTime, triggerType }) {
  const description = triggerType === 'overrun'
    ? 'You\'ve been on this task for a while — quick check-in.'
    : 'About the task you just completed.';

  return `
    <div id="experience-probe-overlay-backdrop" style="position:absolute; inset:0; background:rgba(0, 0, 0, 0.55); backdrop-filter: blur(1px); display:flex; align-items:center; justify-content:center; padding: 24px;">
      <div id="experience-probe-card" style="width:min(640px,100%); background:#fff; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.25); padding:28px; text-align:left; color:#1b1b1f; font-family:system-ui, sans-serif;">
        <div id="experience-probe-prep" style="display:block;">
          <h2 style="margin-top:0; margin-bottom:12px; font-size:24px;">Loading...</h2>
          <div style="font-size:18px; font-weight:600; color:#0f172a;">Please keep your eyes on the screen.</div>
          <div id="probe-prep-timer" style="margin-top:18px; font-size:16px; color:#6b7280;"></div>
        </div>

        <div id="experience-probe-questions" style="display:none; margin-top:4px;">
          <h2 style="margin-top:0; margin-bottom:16px; font-size:22px;">How well did you understand what you were just doing?</h2>
          <div id="probe-rating" style="display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:24px;">
            ${[1, 2, 3, 4, 5].map((value) => `
              <button type="button" data-probe-rating="${value}" style="border:1px solid #d1d5db; border-radius:12px; padding:16px 0; font-size:16px; background:#f9fafb; cursor:pointer; color:#111; transition:transform .15s ease, border-color .15s ease;">${value}</button>
            `).join('')}
          </div>

          <div id="probe-sa" style="display:none; margin-top:18px;">
            <h3 style="margin:0 0 14px; font-size:18px;">I was confused because:</h3>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <button type="button" data-probe-sa="1" style="border:1px solid #d1d5db; border-radius:12px; padding:14px 18px; text-align:left; background:#f8fafc; cursor:pointer;">I didn’t see the relevant information</button>
              <button type="button" data-probe-sa="2" style="border:1px solid #d1d5db; border-radius:12px; padding:14px 18px; text-align:left; background:#f8fafc; cursor:pointer;">I didn't understand what I was reading or seeing</button>
              <button type="button" data-probe-sa="3" style="border:1px solid #d1d5db; border-radius:12px; padding:14px 18px; text-align:left; background:#f8fafc; cursor:pointer;">I didn't know what to do next</button>
            </div>
            <div style="margin-top:12px; font-size:13px; color:#6b7280;">(Select the option that best describes your confusion)</div>
            <!-- Other perceptual probes if we don't like this one: I couldn’t find what I needed, The important information didn’t stand out, I wasn’t sure where to look, The interface was visually confusing-->
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
    sa_level: saLevel !== undefined ? saLevel : null,
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
  const prepSection = root.querySelector('#experience-probe-prep');
  const questionSection = root.querySelector('#experience-probe-questions');

  if (!prepSection || !questionSection) {
    return;
  }

  prepSection.style.display = 'none';
  questionSection.style.display = 'block';
  probeState.responseStartAt = Date.now();

  const ratingButtons = Array.from(root.querySelectorAll('[data-probe-rating]'));
  const saContainer = root.querySelector('#probe-sa');

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

export function showExperienceProbeOverlay({ taskId = null, triggerType = 'manual', triggerTime = Date.now() } = {}) {
  if (probeState.visible) {
    return Promise.resolve();
  }

  const root = getProbeOverlayRoot();
  root.dataset.taskId = taskId || '';
  root.dataset.triggerTime = String(triggerTime);

  probeState.visible = true;
  root.style.display = 'block';
  root.style.pointerEvents = 'auto';
  root.innerHTML = renderProbeContent({ taskId, triggerTime, triggerType });

  window.gazeManager?.startRawWindow(5000);
  window.gazeManager?.pauseLogging();

  let secondsLeft = 5;
  const timerText = root.querySelector('#probe-prep-timer');
  if (timerText) {
    timerText.textContent = `Next task in ${secondsLeft} seconds`;
  }

  probeState.resolveComplete = null;
  const completionPromise = new Promise((resolve) => {
    probeState.resolveComplete = resolve;
  });

  probeState.countdownId = window.setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      if (probeState.countdownId) {
        clearInterval(probeState.countdownId);
        probeState.countdownId = null;
      }
      showProbeQuestions();
      return;
    }
    if (timerText) {
      timerText.textContent = `Next task in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}`;
    }
  }, 1000);

  probeState.showQuestionsTimeoutId = window.setTimeout(() => {
    if (probeState.countdownId) {
      clearInterval(probeState.countdownId);
      probeState.countdownId = null;
    }
    showProbeQuestions();
  }, 5000);

  return completionPromise;
}

export function moveGazeDot(x, y, visible = true) {
  const gazeDot = document.getElementById('gaze-dot');

  gazeDot.style.transform = `translate(${x}px, ${y}px)`;
  gazeDot.style.display = visible ? 'block' : 'none';
}

export function showFixationIndicator(x, y) {
  const fixationIndicator = document.getElementById('fixation-indicator');

  fixationIndicator.style.transform = `translate(${x - 10}px, ${y - 10}px)`;

  fixationIndicator.style.display = 'block';

  setTimeout(() => {
    fixationIndicator.style.display = 'none';
  }, 500);
}
