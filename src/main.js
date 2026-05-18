import './style.css';

// Register Service Worker FIRST to intercept web/ requests
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    console.log('✓ Service Worker registered for request interception');
  }).catch(err => {
    console.warn('Service Worker registration failed:', err);
  });
}

import { renderAppShell } from './UI/appShell';
import { setStatus } from './UI/status';
import { initConsentScreen } from './UI/screens/consent';
import { renderLoadingScreen } from './UI/screens/loading';
import { renderEnvCheckScreen } from './UI/screens/env-check';
import { renderCalibrationScreen } from './UI/screens/calibration';
import { renderTaskInstructionScreen } from './UI/screens/task-instruction';
import { renderTaskScreen } from './UI/screens/task';
import { renderProbeScreen } from './UI/screens/probe';
import { renderNasaTlxScreen } from './UI/screens/nasatlx';
import { renderDebriefScreen } from './UI/screens/debrief';
import { initExperienceProbeOverlay } from './UI/overlays';
import { showScreen } from './experiment/router';
import { initRouter } from './experiment/router-init';
import { initTaskRunner } from './experiment/taskRunner';
import { CONFIG } from './experiment/config';
import { sessionData } from './experiment/session';

import { IVTFixationDetector } from './tracker/fixationDetector';
import { CalibrationSystem } from './tracker/calibration';
import { attachGazePipeline } from './tracker/gazePipeline';
import { initializeTracker } from './tracker/trackerInitialization';
import { GazeManager } from './tracker/gazeManager';
import { startInputTracking } from './tracker/inputTracker';

import { isMobileDevice } from './utils/deviceCheck';
import { initExperiment } from './experiment/init';

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE
// Expose sessionData on window so legacy inline scripts can reach it if needed,
// but always import from session.js — this is the single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
window.sessionData = sessionData;
window.experimentStarted = false;

// ─────────────────────────────────────────────────────────────────────────────
// BOOT: APP SHELL + ROUTER
// ─────────────────────────────────────────────────────────────────────────────
renderAppShell();
initExperienceProbeOverlay();
initRouter();

window.addEventListener('DOMContentLoaded', () => {
  // Pre-render all screen placeholders so the DOM containers exist
  renderLoadingScreen();
  renderEnvCheckScreen();
  renderCalibrationScreen();
  renderTaskInstructionScreen();
  renderTaskScreen();
  renderProbeScreen();
  renderNasaTlxScreen();
  renderDebriefScreen();

  // RESEARCHER MODE: skip consent + calibration, jump straight to tasks
  if (CONFIG.RESEARCHER_MODE) {
    console.log('🔬 RESEARCHER MODE ENABLED');
    window.startWebEyeTrackResearcherMode();
    return;
  }

  initConsentScreen();
  showScreen('screen-consent');
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIMENT START  (called from consent screen after all boxes checked)
// ─────────────────────────────────────────────────────────────────────────────
window.startWebEyeTrack = async function startWebEyeTrack() {
  if (window.experimentStarted) return;
  window.experimentStarted = true;

  // Start recording mouse + click behaviour immediately
  startInputTracking();

  try {
    setStatus('Loading experiment...');

    if (isMobileDevice()) {
      setStatus('Mobile devices are not supported for this study.');
      return;
    }

    const videoElement = document.getElementById('webcam-video');
    if (!videoElement) {
      console.error('Missing webcam-video element');
      setStatus('UI error: missing webcam element. Check appShell.');
      return;
    }

    const fixationDetector = new IVTFixationDetector();
    const gazeManager      = new GazeManager();
    const taskRunner       = initTaskRunner(gazeManager);

    window.gazeManager = gazeManager;
    window.taskRunner  = taskRunner;

    let calibrationSystem;

    setStatus('Requesting camera permissions...');

    const tracker = await initializeTracker(videoElement.id);

    calibrationSystem = new CalibrationSystem(tracker);
    window._calibrationSystem = calibrationSystem;

    attachGazePipeline({ tracker, calibrationSystem, fixationDetector, gazeManager });

    setStatus('Initializing eye tracker...');

    const webEyeTrackReady = new Promise((resolve, reject) => {
      const onMessage = (event) => {
        if (event.data?.type === 'ready') {
          tracker.worker.removeEventListener('message', onMessage);
          resolve();
        }
      };
      tracker.worker.addEventListener('message', onMessage);
      tracker.worker.addEventListener('error', reject);
      tracker.worker.addEventListener('messageerror', reject);
    });

    const timeout = setTimeout(() => {
      setStatus('Initialization timeout. Check console.');
    }, 60000);

    await webEyeTrackReady;
    clearTimeout(timeout);

    initExperiment();

    setStatus('Ready. Click Start Calibration.');

    // Pass recalibration clicks to the tracker worker (skip interactive elements)
    document.addEventListener('click', (event) => {
      const tag = event.target.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
      if (!calibrationSystem.isCalibrating) {
        const normX = (event.clientX / window.innerWidth) - 0.5;
        const normY = (event.clientY / window.innerHeight) - 0.5;
        tracker.worker.postMessage({ type: 'click', payload: { x: normX, y: normY } });
      }
    });

    tracker.worker.onerror        = (err) => setStatus(`Worker error: ${err.message || err}`);
    tracker.worker.onmessageerror = ()    => setStatus('Worker message error occurred');

    sessionData.gazeInitialized = true;

  } catch (error) {
    console.error('WebEyeTrack initialization failed:', error);
    sessionData.gazeInitializationError = error.message;

    if (CONFIG.ALLOW_DEGRADED_GAZE) {
      console.warn('⚠️ Graceful degradation: continuing without gaze tracking');
      setStatus('Note: Eye tracking unavailable. Continuing with behavioural data collection.');
      sessionData.gazeInitialized = false;
      initExperiment();
      setStatus('Ready. Click Start Calibration (eye tracking unavailable).');
    } else {
      setStatus(`Critical error: ${error.message}`);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCHER MODE: skip consent/calibration, load first task immediately
// ─────────────────────────────────────────────────────────────────────────────
window.startWebEyeTrackResearcherMode = async function startWebEyeTrackResearcherMode() {
  if (window.experimentStarted) return;
  window.experimentStarted = true;

  startInputTracking();

  try {
    const videoElement = document.getElementById('webcam-video');
    if (!videoElement) {
      console.error('Missing webcam-video element');
      return;
    }

    const fixationDetector = new IVTFixationDetector();
    const gazeManager      = new GazeManager();
    const taskRunner       = initTaskRunner(gazeManager);

    window.gazeManager = gazeManager;
    window.taskRunner  = taskRunner;

    let tracker;
    let calibrationSystem;

    try {
      tracker           = await initializeTracker(videoElement.id);
      calibrationSystem = new CalibrationSystem(tracker);
      window._calibrationSystem = calibrationSystem;

      attachGazePipeline({ tracker, calibrationSystem, fixationDetector, gazeManager });

      const webEyeTrackReady = new Promise((resolve, reject) => {
        const onMessage = (event) => {
          if (event.data?.type === 'ready') {
            tracker.worker.removeEventListener('message', onMessage);
            resolve();
          }
        };
        tracker.worker.addEventListener('message', onMessage);
        tracker.worker.addEventListener('error', reject);
      });

      await Promise.race([
        webEyeTrackReady,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tracker timeout')), 30000)),
      ]);

      sessionData.gazeInitialized = true;
      console.log('🔬 Gaze tracker initialized in researcher mode');
    } catch (gazeError) {
      console.warn('🔬 Gaze init failed in researcher mode, continuing without:', gazeError);
      sessionData.gazeInitialized = false;
      sessionData.gazeInitializationError = gazeError.message;
    }

    initExperiment();
    window.taskRunner?.loadNextTask();

    _showResearcherOverlay(gazeManager);

  } catch (error) {
    console.error('Researcher mode init error:', error);
  }
};

function _showResearcherOverlay(gazeManager) {
  const overlay = document.createElement('div');
  overlay.id = 'researcher-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; right: 0; width: 300px; height: 100vh;
    background: rgba(0,0,0,0.95); color: #fff; padding: 16px;
    font-family: monospace; font-size: 12px; z-index: 10000;
    overflow-y: auto; border-left: 2px solid #4f46e5;
  `;

  overlay.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="margin:0 0 4px; color:#4f46e5;">🔬 RESEARCHER MODE</h3>
      <p style="margin:0; color:#9ca3af; font-size:11px;">Live monitoring panel</p>
    </div>

    <div style="margin-bottom:10px; padding:8px; background:rgba(79,70,229,0.1); border-radius:4px; border-left:2px solid #4f46e5;">
      <div style="color:#a78bfa; font-weight:bold; margin-bottom:4px;">Current AOI</div>
      <div id="rov-aoi" style="color:#e0e7ff;">—</div>
    </div>

    <div style="margin-bottom:10px; padding:8px; background:rgba(34,197,94,0.1); border-radius:4px; border-left:2px solid #22c55e;">
      <div style="color:#86efac; font-weight:bold; margin-bottom:4px;">Last Fixation</div>
      <div id="rov-fixation" style="color:#dcfce7;">0 ms</div>
    </div>

    <div style="margin-bottom:10px; padding:8px; background:rgba(59,130,246,0.1); border-radius:4px; border-left:2px solid #3b82f6;">
      <div style="color:#93c5fd; font-weight:bold; margin-bottom:4px;">Gaze Manager</div>
      <div id="rov-status" style="color:#dbeafe; font-size:11px;">Initializing...</div>
    </div>

    <div style="padding:8px; background:rgba(100,116,139,0.2); border-radius:4px; font-size:11px;">
      <div style="color:#cbd5e1;">Eye tracking: <span id="rov-gaze-init" style="color:#94a3b8;">—</span></div>
      <div style="color:#cbd5e1; margin-top:4px;">Mouse events: <span id="rov-mouse" style="color:#94a3b8;">0</span></div>
      <div style="color:#cbd5e1; margin-top:4px;">Click events: <span id="rov-clicks" style="color:#94a3b8;">0</span></div>
    </div>
  `;

  document.body.appendChild(overlay);

  setInterval(() => {
    const aoi    = document.getElementById('rov-aoi');
    const fix    = document.getElementById('rov-fixation');
    const status = document.getElementById('rov-status');
    const gazeIn = document.getElementById('rov-gaze-init');
    const mouse  = document.getElementById('rov-mouse');
    const clicks = document.getElementById('rov-clicks');

    if (aoi    && gazeManager) aoi.textContent    = gazeManager.currentAOI || '—';
    if (fix    && gazeManager) fix.textContent    = `${(gazeManager.lastFixationDuration || 0).toFixed(0)} ms`;
    if (status && gazeManager) {
      status.textContent  = gazeManager.isTracking ? '✓ TRACKING' : '○ IDLE';
      status.style.color  = gazeManager.isTracking ? '#86efac' : '#94a3b8';
    }
    if (gazeIn) {
      gazeIn.textContent = sessionData.gazeInitialized ? '✓ YES' : '✗ NO';
      gazeIn.style.color = sessionData.gazeInitialized ? '#86efac' : '#f87171';
    }
    if (mouse)  mouse.textContent  = sessionData.mouseEvents.length;
    if (clicks) clicks.textContent = sessionData.clickEvents.length;
  }, 200);
}
