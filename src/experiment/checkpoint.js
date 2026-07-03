/**
 * checkpoint.js
 *
 * Lightweight, frequent session snapshots sent to the server independently
 * of the heavy gazeLog chunk stream and the final debrief POST.
 *
 * WHY THIS EXISTS:
 *   Right now the only things that reach the server before debrief are
 *   gazeLog chunks. Everything else (calibration attempts, task responses,
 *   events, mouse/click counts) only reaches the server in the single final
 *   POST in debrief.js. If the participant closes the tab, loses network,
 *   or the browser crashes at ANY point before reaching debrief, all of
 *   that is gone — and there's zero record that participant ever existed.
 *
 *   This module periodically (and on key events) POSTs a small JSON
 *   snapshot to `${CONFIG.DATA_ENDPOINT}/checkpoint`. The server should
 *   upsert this into a per-session "live" record, independent of the final
 *   compiled session file, so every participant who ever opened the study
 *   link is visible — finished or not.
 */

import { sessionData } from './session';
import { CONFIG } from './config';

const CHECKPOINT_INTERVAL_MS = CONFIG.CHECKPOINT_INTERVAL_MS || 20000;

let _intervalId    = null;
let _currentPhase  = 'init';

/** Call whenever the participant moves into a new broad phase of the study. */
export function setSessionPhase(phase) {
  _currentPhase = phase;
  sendCheckpoint(`phase:${phase}`);
}

function _buildCheckpointPayload(reason) {
  return {
    participantId:  sessionData.participantId || null,
    participantIDs: {
      prolific_pid: sessionData.PROLIFIC_PID || null,
      study_id:     sessionData.STUDY_ID     || null,
      session_id:   sessionData.SESSION_ID   || null,
    },
    reason,
    phase:                    _currentPhase,
    startTime:                sessionData.startTime || null,
    lastHeartbeatAt:          Date.now(),
    gazeInitialized:          !!sessionData.gazeInitialized,
    environmentCheck:         sessionData.environmentCheck || null,
    calibrationAttempts:      sessionData.calibrationAttempts || [],
    calibrationAttemptCount: (sessionData.calibrationAttempts || []).length,
    taskResponses:            sessionData.taskResponses || [],
    eventCount:               (sessionData.events || []).length,
    mouseEventCount:          (sessionData.mouseEvents || []).length,
    clickEventCount:          (sessionData.clickEvents || []).length,
    gazeSampleCount:          (sessionData.gazeLog || []).length,
  };
}

/**
 * Send a checkpoint immediately. keepalive lets the request survive even if
 * the page starts navigating away right after this fires. Always
 * fire-and-forget — a failed checkpoint should never interrupt the
 * participant's experience.
 */
export function sendCheckpoint(reason = 'periodic') {
  if (!CONFIG.DATA_ENDPOINT) return;
  if (!sessionData.SESSION_ID && !sessionData.PROLIFIC_PID) return; // nothing to key on yet

  const payload  = _buildCheckpointPayload(reason);
  const endpoint = `${CONFIG.DATA_ENDPOINT.replace(/\/+$/, '')}/checkpoint`;

  fetch(endpoint, {
    method:    'POST',
    headers:   { 'Content-Type': 'application/json' },
    body:      JSON.stringify(payload),
    keepalive: true,
  }).catch(err => {
    console.warn('Checkpoint send failed (non-fatal):', err);
  });
}

/**
 * Best-effort final flush at the moment the tab is hidden/closed. sendBeacon
 * is purpose-built for this exact moment — far more reliable than a normal
 * fetch during active page unload. Keep payloads small: sendBeacon has a
 * strict size cap (~64KB), which is why this never includes gazeLog or events.
 */
function _sendBeaconCheckpoint(reason) {
  if (!CONFIG.DATA_ENDPOINT || typeof navigator.sendBeacon !== 'function') return;
  if (!sessionData.SESSION_ID && !sessionData.PROLIFIC_PID) return;

  const payload  = _buildCheckpointPayload(reason);
  const endpoint = `${CONFIG.DATA_ENDPOINT.replace(/\/+$/, '')}/checkpoint`;
  const blob     = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  navigator.sendBeacon(endpoint, blob);
}

/**
 * Start the periodic checkpoint loop and attach unload/visibility listeners.
 * Call once, as early as possible — right after Prolific params are
 * captured — so even a participant who never gets past the camera
 * permission prompt registers with the server.
 */
export function initCheckpointSync() {
  if (_intervalId) return; // already running

  sendCheckpoint('session-start');
  _intervalId = setInterval(() => sendCheckpoint('periodic'), CHECKPOINT_INTERVAL_MS);

  window.addEventListener('pagehide', () => _sendBeaconCheckpoint('pagehide'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _sendBeaconCheckpoint('visibility-hidden');
    }
  });
}

export function stopCheckpointSync() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}