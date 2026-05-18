/**
 * inputTracker.js — records mouse movements and clicks into sessionData.
 *
 * Mouse movements are throttled to one sample per 50 ms to keep the log
 * manageable. Coordinates are stored both as raw pixels and normalised
 * (0–1) relative to the viewport, so data from different screen sizes
 * can be compared.
 *
 * Start tracking by calling startInputTracking() after experiment init.
 * The tracker attaches document-level listeners and stays active for the
 * entire session (including between tasks), but each event is tagged with
 * the current task_id so you can filter later.
 */

import { sessionData } from '../experiment/session';

const MOUSE_THROTTLE_MS = 50;   // sample rate cap

let _active = false;
let _lastMouseAt = 0;

// ── Public API ───────────────────────────────────────────────────────────────

export function startInputTracking() {
  if (_active) return;
  _active = true;

  document.addEventListener('mousemove', _onMouseMove, { passive: true });
  document.addEventListener('click',     _onClick,     { passive: true });

  sessionData.events.push({
    type:      'input-tracking-start',
    timestamp: Date.now(),
  });
}

export function stopInputTracking() {
  if (!_active) return;
  _active = false;

  document.removeEventListener('mousemove', _onMouseMove);
  document.removeEventListener('click',     _onClick);
}

// ── Private handlers ─────────────────────────────────────────────────────────

function _onMouseMove(e) {
  const now = performance.now();
  if (now - _lastMouseAt < MOUSE_THROTTLE_MS) return;
  _lastMouseAt = now;

  sessionData.mouseEvents.push({
    t:      Date.now(),
    x:      e.clientX,
    y:      e.clientY,
    x_norm: +(e.clientX / window.innerWidth).toFixed(4),
    y_norm: +(e.clientY / window.innerHeight).toFixed(4),
    task_id: _currentTaskId(),
  });
}

function _onClick(e) {
  sessionData.clickEvents.push({
    t:         Date.now(),
    x:         e.clientX,
    y:         e.clientY,
    x_norm:    +(e.clientX / window.innerWidth).toFixed(4),
    y_norm:    +(e.clientY / window.innerHeight).toFixed(4),
    target:    e.target?.tagName   || null,
    target_id: e.target?.id        || null,
    task_id:   _currentTaskId(),
  });
}

function _currentTaskId() {
  return window.gazeManager?.getCurrentTaskId() ?? null;
}
