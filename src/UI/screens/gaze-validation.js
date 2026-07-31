// gaze-validation.js
//
// Optional 9-point sequential gaze validation screen, shown once right
// after calibration (before the first task). Purely for WebEyeTrack vs.
// GazePoint comparison — this app only records WebEyeTrack's own gaze
// stream (sessionData.gazeLog, already populated by the normal gaze
// pipeline); GazePoint's stream is captured externally and aligned
// afterward using the timestamped marker events this screen logs.
//
// Toggle via CONFIG.GAZE_VALIDATION_ENABLED.

import { CONFIG } from '../../experiment/config';
import { sessionData } from '../../experiment/session';

const SECONDS_PER_POINT = 5;

// 3x3 grid, left-to-right, top-to-bottom — same convention as calibration.
const POINTS = [
  { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 }, { x: 0.5, y: 0.9 }, { x: 0.9, y: 0.9 },
];

const GAZE_VALIDATION_TASK_ID = 'gaze-validation';

function logMarker(type, extra = {}) {
  sessionData.events = sessionData.events || [];
  const entry = { type, timestamp: Date.now(), ...extra };
  sessionData.events.push(entry);
  sessionData.gazeValidationEvents = sessionData.gazeValidationEvents || [];
  sessionData.gazeValidationEvents.push(entry);
}

export function renderGazeValidationScreen() {
  const el = document.getElementById('screen-gaze-validation');
  if (!el) return;

  // Always populate the HTML structure
  el.innerHTML = `
    <div style="position:relative;width:100%;height:100%;background:#111827;overflow:hidden;display:flex;justify-content:center;align-items:center;">
      <div id="gv-square-stage" style="position:relative;width:100%;height:100%;">
        <div id="gv-dot" style="
          position:absolute;width:24px;height:24px;border-radius:50%;
          background:#ef4444;box-shadow:0 0 0 8px rgba(239,68,68,.25);
          transform:translate(-50%,-50%);transition:left .3s,top .3s;
          left:50%;top:50%;">
        </div>
      </div>

      <div id="gv-status" style="
        position:absolute;top:24px;left:50%;transform:translateX(-50%);
        color:#e5e7eb;font-family:system-ui,sans-serif;font-size:15px;">
        Gaze comparison — point 1 of ${POINTS.length}
      </div>
      <button id="gv-continue-btn" style="
        display:none;position:absolute;bottom:32px;left:50%;transform:translateX(-50%);
        padding:14px 28px;border:none;border-radius:12px;background:#4f46e5;color:#fff;
        cursor:pointer;font-size:16px;font-weight:600;">
        Continue →
      </button>
    </div>`;

  // Prevent running on initial app boot: only activate if showScreen('screen-gaze-validation') has been called
  const isVisible = el.style.display !== 'none' || el.classList.contains('active');
  if (!isVisible) {
    return;
  }

  // Activate fullscreen fixed overlay when navigated to
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  Object.assign(el.style, {
    display: 'block',
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    margin: '0',
    padding: '0',
    zIndex: '9999'
  });

  const dot        = el.querySelector('#gv-dot');
  const status      = el.querySelector('#gv-status');
  const continueBtn = el.querySelector('#gv-continue-btn');

  window.gazeManager?.setActiveTask?.(GAZE_VALIDATION_TASK_ID);

  logMarker('calibration-end-gaze-validation-start', { task_id: GAZE_VALIDATION_TASK_ID });

  let i = 0;

  function showPoint(idx) {
    const p = POINTS[idx];
    dot.style.left = `${p.x * 100}%`;
    dot.style.top  = `${p.y * 100}%`;
    status.textContent = `Gaze comparison — point ${idx + 1} of ${POINTS.length}`;

    logMarker('gaze-validation-point-start', {
      task_id: GAZE_VALIDATION_TASK_ID,
      point_index: idx,
      x_norm: p.x,
      y_norm: p.y,
    });

    setTimeout(() => {
      logMarker('gaze-validation-point-end', {
        task_id: GAZE_VALIDATION_TASK_ID,
        point_index: idx,
      });
      i += 1;
      if (i < POINTS.length) {
        showPoint(i);
      } else {
        dot.style.display = 'none';
        status.textContent = 'Done — click Continue to proceed';
        continueBtn.style.display = 'inline-block';
        logMarker('gaze-validation-end', { task_id: GAZE_VALIDATION_TASK_ID });
      }
    }, SECONDS_PER_POINT * 1000);
  }

  showPoint(0);

  continueBtn.onclick = () => {
    // Hide overlay and restore body scroll before moving to next task
    el.style.display = 'none';
    el.classList.remove('active');
    document.body.style.overflow = '';

    if (window.taskRunner?.loadNextTask) {
      window.taskRunner.loadNextTask();
    }
  };
}

export function shouldShowGazeValidation() {
  return !!CONFIG.GAZE_VALIDATION_ENABLED;
}