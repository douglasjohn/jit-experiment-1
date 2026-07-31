import './style.css';

import { renderAppShell } from './UI/appShell';
import { setStatus } from './UI/status';
import { initConsentScreen } from './UI/screens/consent';
import { renderProlificWelcomeScreen } from './UI/screens/prolific-welcome';
import { renderCameraRecordingNoticeScreen } from './UI/screens/camera-recording-notice';
import { renderDemographicsScreen } from './UI/screens/demographics';
import { renderLoadingScreen } from './UI/screens/loading';
import { renderEnvCheckScreen } from './UI/screens/env-check';
import { renderCalibrationScreen } from './UI/screens/calibration';
import { renderGazeValidationScreen } from './UI/screens/gaze-validation';
import { renderTaskInstructionScreen } from './UI/screens/task-instruction';
import { renderTaskScreen } from './UI/screens/task';
import { renderProbeScreen } from './UI/screens/probe';
import { renderTaskCompleteScreen } from './UI/screens/task-complete';
import { renderNasaTlxScreen } from './UI/screens/nasatlx';
import { renderDebriefScreen } from './UI/screens/debrief';
import { initExperienceProbeOverlay } from './UI/overlays';
import { showScreen } from './experiment/router';
import { initRouter } from './experiment/router-init';
import { initTaskRunner } from './experiment/taskRunner';
import { CONFIG } from './experiment/config';
import { captureProlificParams, sessionData } from './experiment/session';
import { initCheckpointSync } from './experiment/checkpoint';

import { IVTFixationDetector } from './tracker/fixationDetector';
import { CalibrationSystem } from './tracker/calibration';
import { attachGazePipeline } from './tracker/gazePipeline';
import { initializeTracker } from './tracker/trackerInitialization';
import { GazeManager } from './tracker/gazeManager';
import { startInputTracking } from './tracker/inputTracker';

import { isMobileDevice } from './utils/deviceCheck';
import { initExperiment } from './experiment/init';
import { createLiveConfusionClassifier } from './intervention/liveClassifier';
import { onConfusionFired, onConfusionReFired } from './intervention/classifier';
import { preloadModelWeights } from './intervention/treeEnsembleClassifier';

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
  // ─────────────────────────────────────────────────────────────────────────────
  // NEW: Toggle Researcher Mode on the fly with Ctrl + Shift + R
  // ─────────────────────────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      const isEnabled = localStorage.getItem('researcherMode') === 'true';
      localStorage.setItem('researcherMode', !isEnabled);
      alert(`Researcher Mode ${!isEnabled ? 'ENABLED' : 'DISABLED'}. Reloading...`);
      window.location.reload();
    }
  });
  // Pre-render all screen placeholders so the DOM containers exist
  renderLoadingScreen();
  captureProlificParams();
  initCheckpointSync();
  renderProlificWelcomeScreen();
  renderCameraRecordingNoticeScreen();
  renderDemographicsScreen();
  renderEnvCheckScreen();
  renderCalibrationScreen();
  renderGazeValidationScreen();
  renderTaskInstructionScreen();
  renderTaskScreen();
  renderProbeScreen();
  renderTaskCompleteScreen();
  renderNasaTlxScreen();
  renderDebriefScreen({ placeholder: true });

  // DEV / TESTING SHORTCUT: load a specific screen directly with ?screen=nasatlx
  if (CONFIG.SKIP_TO_SCREEN) {
    const screenId = CONFIG.SKIP_TO_SCREEN.startsWith('screen-')
      ? CONFIG.SKIP_TO_SCREEN
      : `screen-${CONFIG.SKIP_TO_SCREEN}`;

    console.log(`🚀 Skipping directly to ${screenId}`);
    showScreen(screenId);
    return;
  }

  // RESEARCHER MODE: skip consent + calibration, jump straight to tasks
  // UPDATED: Check localStorage as well as CONFIG
  if (CONFIG.RESEARCHER_MODE || localStorage.getItem('researcherMode') === 'true') {
    console.log('🔬 RESEARCHER MODE ENABLED');
    window.startWebEyeTrackResearcherMode();
    return;
  }

  initConsentScreen();
  showScreen('screen-prolific-welcome');
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
    gazeManager.setFixationDetector(fixationDetector);
    window.gazeManager = gazeManager;
    window.taskRunner  = taskRunner;

    attachInterventionClassifier(gazeManager);

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
    gazeManager.setFixationDetector(fixationDetector);
    window.gazeManager = gazeManager;
    window.taskRunner  = taskRunner;

    attachInterventionClassifier(gazeManager);

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
    // 1. Initialize experiment state and show Calibration screen
    initExperiment();

    // 2. Show the Researcher Overlay immediately so you can monitor calibration
    _showResearcherOverlay(gazeManager);

    if (typeof window.__jitActivateLiveClassifier === 'function') {
      window.__jitActivateLiveClassifier();
    }

  } catch (error) {
    console.error('Researcher mode init error:', error);
  }
};

function attachInterventionClassifier(gazeManager) {
  const isResearcher = CONFIG.RESEARCHER_MODE || localStorage.getItem('researcherMode') === 'true';

  // Don't preload if condition ignores AI interventions (unless in Researcher Mode)
  if (!isResearcher && (CONFIG.INTERVENTION_CONDITION === 'no_help' || CONFIG.INTERVENTION_CONDITION === 'static_help')) return;

  const liveClassifier = createLiveConfusionClassifier({
    onFire: (payload) => onConfusionFired(payload),
    getSubjectId: () => sessionData.participantId || sessionData.PROLIFIC_PID || 'participant-1',
  });

  window.__jitLiveClassifier = liveClassifier;

  window.__jitFireConfusion = (payload) => onConfusionFired({
    subjectId: sessionData.participantId || sessionData.PROLIFIC_PID || 'participant-1',
    aoiType: payload?.aoiType || payload?.aoi_id || 'unknown',
    saLevel: payload?.saLevel || 2,
    triggeringFeature: payload?.triggeringFeature || 'manual_trigger',
    confidence: payload?.confidence ?? 0.9,
    ...payload,
  });

  // Deferred on purpose: fetching the ~6.9MB weights file and subscribing
  // to the gaze stream both happen only once _activateLiveClassifier is
  // called (from taskRunner.js, right before the FIRST task begins) --
  // i.e. strictly after consent, calibration, and env-check, so it never
  // competes with WebEyeTrack's own model load on the calibration path.
  window.__jitActivateLiveClassifier = () => _activateLiveClassifier(gazeManager, liveClassifier);
}

function _activateLiveClassifier(gazeManager, liveClassifier) {
  if (window.__jitDestroyLiveClassifier) return; // already active, no-op
  const isResearcher = CONFIG.RESEARCHER_MODE || localStorage.getItem('researcherMode') === 'true';
  if (!isResearcher && CONFIG.INTERVENTION_CONDITION !== 'system_initiated' &&
      CONFIG.INTERVENTION_CONDITION !== 'user_initiated') return;

  // Kick off the fetch now (off the calibration critical path) so it's
  // warm well before the acclimation window needs a live prediction.
  preloadModelWeights();

  const unsubscribe = gazeManager.onGazeSample((payload) => {
    if (!payload?.task_id) return;
    liveClassifier(payload);
  });
  window.__jitDestroyLiveClassifier = unsubscribe;
}

function _showResearcherOverlay(gazeManager) {
  const overlay = document.createElement('div');
  overlay.id = 'researcher-overlay';
  overlay.style.cssText = `
    position: fixed; top: 12px; right: 12px; width: 240px; max-height: 85vh;
    background: rgba(248, 250, 252, 0.85); backdrop-filter: blur(8px);
    color: #0f172a; padding: 12px; border-radius: 12px;
    font-family: monospace; font-size: 11px; z-index: 10000;
    overflow-y: auto; border: 1px solid rgba(203, 213, 225, 0.8);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  `;

  overlay.innerHTML = `
    <div style="margin-bottom:10px;">
      <h3 style="margin:0 0 2px; color:#4338ca; font-size:13px;">🔬 RESEARCHER MODE</h3>
      <p style="margin:0; color:#64748b; font-size:10px;">Live monitoring panel</p>
    </div>

    <!-- NEW: Live Classifier UI -->
    <div style="margin-bottom:8px; padding:8px; background:rgba(254,226,226,0.6); border-radius:6px; border-left:3px solid #ef4444;">
      <div style="color:#991b1b; font-weight:bold; margin-bottom:2px;">Live Classifier</div>
      <div style="color:#1e293b; font-size:11px;">Conf Prob: <strong id="rov-conf-prob" style="font-size:13px; color:#16a34a;">0.0000</strong></div>
      <div style="color:#1e293b; font-size:11px; margin-top:2px;">SA Pred: <strong id="rov-sa-level" style="color:#2563eb;">—</strong></div>
      <div style="color:#475569; font-size:10px; margin-top:2px;">SA Probs: <span id="rov-sa-probs">Loading...</span></div>
    </div>

    <div style="margin-bottom:8px; padding:8px; background:rgba(238,242,255,0.6); border-radius:6px; border-left:3px solid #6366f1;">
      <div style="color:#3730a3; font-weight:bold; margin-bottom:2px;">Current AOI</div>
      <div id="rov-aoi" style="color:#1e293b;">—</div>
    </div>

    <div style="margin-bottom:8px; padding:8px; background:rgba(220,252,231,0.6); border-radius:6px; border-left:3px solid #22c55e;">
      <div style="color:#166534; font-weight:bold; margin-bottom:2px;">Last Fixation</div>
      <div id="rov-fixation" style="color:#1e293b;">0 ms</div>
    </div>

    <div style="margin-bottom:8px; padding:8px; background:rgba(219,234,254,0.6); border-radius:6px; border-left:3px solid #3b82f6;">
      <div style="color:#1e40af; font-weight:bold; margin-bottom:2px;">Gaze Manager</div>
      <div id="rov-status" style="color:#1e293b; font-size:11px;">Initializing...</div>
    </div>

    <div style="padding:8px; background:rgba(241,245,249,0.8); border-radius:6px; font-size:10px;">
      <div style="color:#334155;">Eye tracking: <span id="rov-gaze-init" style="color:#64748b;">—</span></div>
      <div style="color:#334155; margin-top:2px;">Mouse events: <span id="rov-mouse" style="color:#64748b;">0</span></div>
      <div style="color:#334155; margin-top:2px;">Click events: <span id="rov-clicks" style="color:#64748b;">0</span></div>
    </div>
  `;

  document.body.appendChild(overlay);

  // NEW: Attach the global updater for the live classifier
  window.__updateResearcherHUD = (confusionProb, saLevel, saProbs) => {
    const confEl = document.getElementById('rov-conf-prob');
    if (confEl) {
      const prob = Number(confusionProb || 0);
      confEl.innerText = prob.toFixed(4);
      confEl.style.color = prob >= 0.3804 ? '#dc2626' : '#16a34a';
      document.getElementById('rov-sa-level').innerText = saLevel !== undefined ? saLevel : '—';
      
      const probsEl = document.getElementById('rov-sa-probs');
      if (probsEl) {
        if (!saProbs) {
          probsEl.innerText = 'Loading...';
        } else if (Array.isArray(saProbs) && saProbs.length > 0) {
          probsEl.innerText = saProbs.map((p, idx) => `L${idx + 1}: ${(Number(p) * 100).toFixed(0)}%`).join(' | ');
        } else if (typeof saProbs === 'object' && Object.keys(saProbs).length > 0) {
          probsEl.innerText = Object.entries(saProbs)
            .map(([k, v]) => `${k}: ${(Number(v) * 100).toFixed(0)}%`)
            .join(' | ');
        } else {
          probsEl.innerText = 'None';
          }
      }
    }
  };

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
