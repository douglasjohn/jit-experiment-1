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

      <div id="calibration-instructions">
        <h1>Calibration</h1>
        <p>
          Sit roughly an arm’s length from your screen. Keep your head as still as possible and follow the dot with your eyes only.
        </p>
      </div>

      <div id="calibration-status">
        <p id="status-text">Initializing...</p>

        <div id="debug-info" style="font-size: 12px; margin-top: 10px; color: #666;">
          <div>Gaze: <span id="gaze-coords">N/A</span></div>
          <div>State: <span id="gaze-state">N/A</span></div>
          <div>Fixations: <span id="fixation-count">0</span></div>
        </div>

        <button data-cal="calibrate-btn" style="margin-top: 12px;">Start Calibration</button>

        <div data-cal="quality-display" style="display: none; margin-top: 24px; text-align: left; max-width: 500px; background: #f8f9fa; padding: 20px; border-radius: 12px; border: 1px solid #ddd;">
          <h3 style="margin: 0 0 12px; color: #1b1b1f;">Calibration Results</h3>
          <p data-cal="quality-text" style="margin: 0 0 8px; font-size: 14px;"></p>
          <div data-cal="quality-errors" style="color: #b00; font-size: 13px; margin-top: 8px;"></div>

          <div data-cal="quality-gate-warning" style="display: none; margin-top: 12px; padding: 12px; background: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">
            <strong style="color: #856404;">⚠ Accuracy below target</strong>
            <p style="margin: 4px 0 0; font-size: 13px; color: #856404;">Please recalibrate to achieve &lt; 25% error</p>
          </div>
        </div>
      </div>

      <button data-cal="continue-btn"
        style="margin-top: 32px; display: none; padding: 12px 24px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600;">
        Continue to Task
      </button>

    </div>
  `;

  const header         = el.querySelector('#calibration-header');
  const calibrateBtn   = el.querySelector('[data-cal="calibrate-btn"]');
  const continueBtn    = el.querySelector('[data-cal="continue-btn"]');
  const qualityDisplay = el.querySelector('[data-cal="quality-display"]');
  const qualityText    = el.querySelector('[data-cal="quality-text"]');
  const qualityErrors  = el.querySelector('[data-cal="quality-errors"]');
  const gateWarning    = el.querySelector('[data-cal="quality-gate-warning"]');

  let latestQuality = null;

  function showQuality(quality) {
    if (!quality) return;

    latestQuality = quality;

    // Show header and quality results
    header.style.display = 'block';
    qualityDisplay.style.display = 'block';

    const meanErrorPct = isNaN(quality.meanError) ? null : (quality.meanError * 100).toFixed(2);
    const maxErrorPct = isNaN(quality.maxError) ? null : (quality.maxError * 100).toFixed(2);
    
    // Get calibration mode and determine if passed MSE gate
    const calibrationSystem = window._calibrationSystem;
    const mseThreshold = calibrationSystem?.MSE_THRESHOLD || Infinity;
    const passedGate = quality.meanError !== undefined && quality.meanError < mseThreshold;

    qualityText.innerHTML = `
      <strong>Mean error:</strong> ${meanErrorPct ? meanErrorPct + '%' : 'N/A'} of screen<br>
      <strong>Max error:</strong> ${maxErrorPct ? maxErrorPct + '%' : 'N/A'} of screen<br>
      <strong>Status:</strong> <span style="color: ${passedGate ? '#059669' : '#dc2626'}; font-weight: bold;">${passedGate ? '✓ PASSED' : '✗ NEEDS IMPROVEMENT'}</span>
    `;

    qualityErrors.innerHTML = '';
    if (quality.errors && quality.errors.length) {
      qualityErrors.innerHTML = quality.errors.map(e => `<div>• ${e}</div>`).join('');
    }

    // Show gate warning only if MSE gating is enabled and failed
    const gatingEnabled = mseThreshold < Infinity;
    gateWarning.style.display = (gatingEnabled && !passedGate) ? 'block' : 'none';

    // Only enable continue if passed gate (or if gating is disabled)
    continueBtn.style.display = passedGate ? 'inline-block' : 'none';
    continueBtn.disabled = !passedGate;

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
    continueBtn.style.display = 'none';
    calibrateBtn.disabled = true;
    calibrateBtn.textContent = 'Calibrating...';
    // Hide header and instructions during calibration
    header.style.display = 'none';

    calibrationSystem.onQualityMeasured = (quality) => {
      showQuality(quality);
    };

    calibrationSystem.onCalibrationComplete = (result) => {
      console.log('Calibration complete');

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
    };

    calibrationSystem.startCalibration();
  };

  continueBtn.onclick = () => {
    if (window.taskRunner?.loadNextTask) {
      window.taskRunner.loadNextTask();
      return;
    }
    goToNextScreen('screen-calibration');
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
