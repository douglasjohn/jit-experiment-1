import { showScreen } from '../../experiment/router';
import { screens } from '../../experiment/screens';
import { renderEnvCheckScreen } from './env-check';
import { renderTaskInstructionScreen } from './task-instruction';
import { renderTaskScreen } from './task';
import { renderProbeScreen } from './probe';
import { renderNasaTlxScreen } from './nasatlx';
import { renderDebriefScreen } from './debrief';

export function renderCalibrationScreen() {
  const el = document.getElementById('screen-calibration');
  if (!el) return;

  el.innerHTML = `
    <div class="hero" style="max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; text-align: center;">
      <h1>Calibration</h1>
      <p>Follow the red dot with your eyes</p>
      <div id="status">
        <p id="status-text">Initializing...</p>
        <div id="debug-info" style="font-size: 12px; margin-top: 10px; color: #666;">
          <div>Gaze: <span id="gaze-coords">N/A</span></div>
          <div>State: <span id="gaze-state">N/A</span></div>
          <div>Fixations: <span id="fixation-count">0</span></div>
        </div>
        <button data-cal="calibrate-btn" style="margin-top: 12px;">Start Calibration</button>
        <div data-cal="quality-display" style="display: none; margin-top: 16px; text-align: left; max-width: 400px;">
          <h3>Calibration Quality</h3>
          <p data-cal="quality-text"></p>
          <div data-cal="quality-errors" style="color: #b00; font-size: 13px;"></div>
        </div>
      </div>
      <button data-cal="continue-btn" style="margin-top: 32px; display: none; padding: 12px 24px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600;">Continue to Task</button>
    </div>
  `;

  const calibrateBtn   = el.querySelector('[data-cal="calibrate-btn"]');
  const continueBtn    = el.querySelector('[data-cal="continue-btn"]');
  const qualityDisplay = el.querySelector('[data-cal="quality-display"]');
  const qualityText    = el.querySelector('[data-cal="quality-text"]');
  const qualityErrors  = el.querySelector('[data-cal="quality-errors"]');

  let latestQuality = null;

  function showQuality(quality) {
    if (!quality) return;

    latestQuality = quality;
    qualityDisplay.style.display = 'block';

    qualityText.innerHTML = `
      <strong>Status:</strong> ${quality.overallQuality.toUpperCase()}<br>
      <strong>Mean error:</strong> ${isNaN(quality.meanError) ? 'N/A' : (quality.meanError * 100).toFixed(2) + '%'} of screen<br>
      <strong>Max error:</strong> ${isNaN(quality.maxError) ? 'N/A' : (quality.maxError * 100).toFixed(2) + '%'} of screen
    `;

    qualityErrors.innerHTML = '';
    if (quality.errors && quality.errors.length) {
      qualityErrors.innerHTML = quality.errors.map(e => `<div>${e}</div>`).join('');
    }

    calibrateBtn.textContent = 'Recalibrate';
    calibrateBtn.disabled = false;
    calibrateBtn.style.display = 'inline-block';
  }

  calibrateBtn.onclick = () => {
    const calibrationSystem = window._calibrationSystem;
    if (!calibrationSystem) {
      console.warn('CalibrationSystem not ready yet — please wait');
      return;
    }

    latestQuality = null;
    qualityDisplay.style.display = 'none';
    qualityErrors.innerHTML = '';
    continueBtn.style.display = 'none';
    calibrateBtn.disabled = true;
    calibrateBtn.textContent = 'Calibrating...';

    calibrationSystem.onQualityMeasured = (quality) => {
      showQuality(quality);
    };

    calibrationSystem.onCalibrationComplete = (result) => {
      console.log('Calibration complete — showing continue button');

      window.gazeManager?.init();

      if (!latestQuality) {
        if (Array.isArray(result)) {
          showQuality({
            overallQuality: 'done',
            meanError: NaN,
            maxError: NaN,
            biasX: 0,
            biasY: 0,
            measurements: result
          });
        } else {
          showQuality(result);
        }
      }

      calibrateBtn.disabled = false;
      calibrateBtn.textContent = 'Recalibrate';
      calibrateBtn.style.display = 'inline-block';

      continueBtn.style.display = 'inline-block';
      continueBtn.disabled = false;
      continueBtn.onclick = () => {
        if (window.taskRunner?.loadNextTask) {
          window.taskRunner.loadNextTask();
          return;
        }
        goToNextScreen('screen-calibration');
      };
    };

    calibrationSystem.startCalibration();
  };
}

export function addContinueButton(screenId) {
  const el = document.getElementById(screenId);
  if (!el) return;
  let btn = el.querySelector('[data-continue-btn]');
  if (!btn) {
    btn = document.createElement('button');
    btn.setAttribute('data-continue-btn', '');
    btn.textContent = 'Continue';
    btn.style.marginTop = '32px';
    el.appendChild(btn);
  }
  btn.onclick = () => goToNextScreen(screenId);
}

function goToNextScreen(currentId) {
  const idx = screens.indexOf(currentId);
  if (idx !== -1 && idx < screens.length - 1) {
    const nextId = screens[idx + 1];
    showScreen(nextId);
    switch (nextId) {
      case 'screen-env-check': renderEnvCheckScreen(); break;
      case 'screen-calibration': renderCalibrationScreen(); break;
      case 'screen-task-instruction':
        if (window.taskRunner?.loadNextTask) {
          window.taskRunner.loadNextTask();
        } else {
          renderTaskInstructionScreen();
        }
        break;
      case 'screen-task': renderTaskScreen(); break;
      case 'screen-probe': renderProbeScreen(); break;
      case 'screen-nasatlx': renderNasaTlxScreen(); break;
      case 'screen-debrief': renderDebriefScreen(); break;
    }
  }
}
