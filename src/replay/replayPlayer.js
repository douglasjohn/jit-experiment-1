/**
 * replayPlayer.js
 *
 * Full session replay engine.  Works in two modes:
 *
 *   1. Live (in-app) — `TASK_DEFINITIONS` is imported and stimulus HTML is
 *      read directly from the task definitions.
 *
 *   2. Offline / backend — stimulus HTML is read from `payload.taskStimuli`,
 *      which is embedded in the session JSON by debrief.js.  This lets a
 *      researcher replay any session from just the downloaded JSON file
 *      using the standalone `public/replay.html` page.
 *
 * Gaze timestamp note
 * -------------------
 * gazeLog.t is Date.now() (epoch ms) as of the gazeManager.js fix, aligned
 * with mouseEvents.t / scrollEvents.t / events[].timestamp.
 *
 * Scroll replay
 * -------------
 * Mouse coords are viewport-relative (clientX/Y) and are therefore already
 * correct regardless of scroll.  scrollEvents let us pan the stimulus content
 * to match what the participant was actually looking at.
 *
 * The viewport container uses `transform: scale(1)` so all position:fixed
 * descendants (modal popups etc.) are anchored to it, not the document.
 * The content wrapper uses a plain `top` offset (not a CSS transform) so
 * fixed children stay pinned to the viewport while content scrolls beneath.
 */

import { TASK_DEFINITIONS } from '../experiment/taskRunner';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export function launchReplay(payload) {
  if (document.getElementById('replay-overlay')) return;

  const taskBoundaries = _extractTaskBoundaries(payload.events || []);
  if (!taskBoundaries.length) {
    alert('No task data found in this session — replay is unavailable.');
    return;
  }

  // Prefer embedded taskStimuli (works offline); fall back to live import
  const stimuliSource = payload.taskStimuli ?? null;

  const overlay = _buildOverlay();
  document.body.appendChild(overlay);

  // ── State ─────────────────────────────────────────────────────────────────

  let currentTaskId  = taskBoundaries[0].task_id;
  let playbackMs     = 0;
  let taskDurationMs = 1;
  let isPlaying      = false;
  let speedFactor    = 1;
  let rafId          = null;
  let lastRafTime    = null;

  let tMouse  = [];
  let tScroll = [];
  let tGaze   = [];
  let tClicks = [];
  let taskT0  = 0;

  // ── DOM references ────────────────────────────────────────────────────────

  const stimulusEl  = overlay.querySelector('#rp-stimulus');
  const wrapperEl   = overlay.querySelector('#rp-content-wrapper');
  const cursorEl    = overlay.querySelector('#rp-cursor');
  const gazeEl      = overlay.querySelector('#rp-gaze');
  const viewportEl  = overlay.querySelector('#rp-viewport');
  const scrubberEl  = overlay.querySelector('#rp-scrubber');
  const timeEl      = overlay.querySelector('#rp-time');
  const playBtn     = overlay.querySelector('#rp-play');
  const taskSelect  = overlay.querySelector('#rp-task-select');
  const speedBtns   = overlay.querySelectorAll('.rp-speed-btn');
  const closeBtn    = overlay.querySelector('#rp-close');
  const gazeCountEl = overlay.querySelector('#rp-gaze-count');

  // ── Populate task selector ────────────────────────────────────────────────

  taskBoundaries.forEach((b, i) => {
    const def = _getDef(b.task_id, stimuliSource);
    const opt = document.createElement('option');
    opt.value = b.task_id;
    opt.textContent = def ? `${i + 1}. ${def.title}` : b.task_id;
    taskSelect.appendChild(opt);
  });
  taskSelect.value = currentTaskId;

  // Show a warning if gaze data looks absent
  const totalGaze = (payload.gazeLog || []).length;
  if (gazeCountEl) {
    gazeCountEl.textContent = totalGaze > 0
      ? `${totalGaze.toLocaleString()} gaze samples`
      : 'No gaze data';
    gazeCountEl.style.color = totalGaze > 0 ? '#16a34a' : '#dc2626';
  }

  // ── Select first task ─────────────────────────────────────────────────────

  _selectTask(currentTaskId);

  // ── Event listeners ───────────────────────────────────────────────────────

  taskSelect.addEventListener('change', () => {
    _pause();
    _selectTask(taskSelect.value);
  });

  playBtn.addEventListener('click', () => isPlaying ? _pause() : _play());

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedFactor = parseFloat(btn.dataset.speed);
      speedBtns.forEach(b => b.classList.toggle('rp-active', b === btn));
    });
  });

  scrubberEl.addEventListener('input', () => {
    _pause();
    playbackMs = (scrubberEl.value / 1000) * taskDurationMs;
    _renderFrame(playbackMs);
  });

  closeBtn.addEventListener('click', () => { _pause(); overlay.remove(); });

  overlay.addEventListener('keydown', e => {
    if (e.key === ' ')      { e.preventDefault(); isPlaying ? _pause() : _play(); }
    if (e.key === 'Escape') { _pause(); overlay.remove(); }
    if (e.key === 'ArrowRight') { _pause(); playbackMs = Math.min(playbackMs + 5000, taskDurationMs); _renderFrame(playbackMs); }
    if (e.key === 'ArrowLeft')  { _pause(); playbackMs = Math.max(playbackMs - 5000, 0);              _renderFrame(playbackMs); }
  });
  overlay.setAttribute('tabindex', '0');
  overlay.focus();

  // ─────────────────────────────────────────────────────────────────────────
  // Core functions
  // ─────────────────────────────────────────────────────────────────────────

  function _selectTask(taskId) {
    currentTaskId = taskId;
    taskSelect.value = taskId;
    _pause();

    const boundary = taskBoundaries.find(b => b.task_id === taskId);
    if (!boundary) return;

    taskT0 = boundary.start;
    const taskEnd  = boundary.end ?? (boundary.start + 600_000);
    taskDurationMs = Math.max(taskEnd - taskT0, 1);

    tMouse  = _inWindow(payload.mouseEvents  || [], taskT0, taskEnd);
    tScroll = _inWindow(payload.scrollEvents || [], taskT0, taskEnd);
    tGaze   = _inWindow(payload.gazeLog      || [], taskT0, taskEnd);
    tClicks = _inWindow(payload.clickEvents  || [], taskT0, taskEnd);

    const def = _getDef(taskId, stimuliSource);
    stimulusEl.innerHTML = def
      ? _wrapStimulus(def)
      : `<div style="padding:40px;color:#6b7280;font-size:15px;">No stimulus HTML found for task <code>${taskId}</code>.</div>`;

    // Update gaze sample count for this task
    const taskGazeEl = overlay.querySelector('#rp-task-gaze');
    if (taskGazeEl) taskGazeEl.textContent = `${tGaze.length} gaze samples`;

    playbackMs  = 0;
    lastRafTime = null;
    scrubberEl.value = 0;
    _resetOverlays();
    _renderFrame(0);
  }

  function _play() {
    if (isPlaying) return;
    if (playbackMs >= taskDurationMs) playbackMs = 0;
    isPlaying   = true;
    lastRafTime = null;
    playBtn.textContent = '⏸';
    rafId = requestAnimationFrame(_tick);
  }

  function _pause() {
    if (!isPlaying) return;
    isPlaying = false;
    playBtn.textContent = '▶';
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function _tick(nowPerf) {
    if (!isPlaying) return;
    if (lastRafTime !== null) playbackMs += (nowPerf - lastRafTime) * speedFactor;
    lastRafTime = nowPerf;

    if (playbackMs >= taskDurationMs) {
      playbackMs = taskDurationMs;
      _pause();
    }
    _renderFrame(playbackMs);
    if (isPlaying) rafId = requestAnimationFrame(_tick);
  }

  function _renderFrame(ms) {
    const absT = taskT0 + ms;
    const vw   = viewportEl.clientWidth;
    const vh   = viewportEl.clientHeight;

    // ── Mouse cursor ──────────────────────────────────────────────────────
    const mouse = _lastBefore(tMouse, absT);
    if (mouse) {
      cursorEl.style.left    = `${mouse.x_norm * vw}px`;
      cursorEl.style.top     = `${mouse.y_norm * vh}px`;
      cursorEl.style.display = 'block';
    }

    // ── Gaze dot ──────────────────────────────────────────────────────────
    // gazeLog x/y are normalised to −0.5…0.5
    const gaze = _lastBefore(tGaze, absT);
    if (gaze && typeof gaze.x === 'number' && typeof gaze.y === 'number') {
      gazeEl.style.left    = `${(gaze.x + 0.5) * vw}px`;
      gazeEl.style.top     = `${(gaze.y + 0.5) * vh}px`;
      gazeEl.style.display = 'block';
    } else {
      gazeEl.style.display = 'none';
    }

    // ── Scroll (window-level) ─────────────────────────────────────────────
    const winScroll = _lastBefore(
      tScroll.filter(s => s.target_id === '__window__'), absT
    );
    wrapperEl.style.top = `${-(winScroll?.scrollY ?? 0)}px`;

    // Inner-container scrolls
    const latestInner = {};
    tScroll
      .filter(s => s.target_id !== '__window__' && s.t <= absT)
      .forEach(s => { latestInner[s.target_id] = s; });
    Object.values(latestInner).forEach(s => {
      if (!s.target_id) return;
      try {
        const el = stimulusEl.querySelector(`#${CSS.escape(s.target_id)}`);
        if (el) { el.scrollTop = s.scrollY ?? 0; el.scrollLeft = s.scrollX ?? 0; }
      } catch (_) {}
    });

    // ── Click ripple ──────────────────────────────────────────────────────
    const recentClick = tClicks.find(c => Math.abs(c.t - absT) < 80);
    if (recentClick) _showClickRipple(recentClick, vw, vh);

    // ── Scrubber + time ───────────────────────────────────────────────────
    const fraction = Math.min(ms / taskDurationMs, 1);
    scrubberEl.value = Math.round(fraction * 1000);
    timeEl.textContent = `${_fmtMs(ms)} / ${_fmtMs(taskDurationMs)}`;
  }

  function _resetOverlays() {
    cursorEl.style.display = 'none';
    gazeEl.style.display   = 'none';
    wrapperEl.style.top    = '0px';
  }

  function _showClickRipple(evt, vw, vh) {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position:absolute;
      left:${evt.x_norm * vw}px; top:${evt.y_norm * vh}px;
      width:20px; height:20px; margin:-10px 0 0 -10px;
      border-radius:50%;
      background:rgba(239,68,68,0.6);
      pointer-events:none;
      animation:rp-ripple 0.45s ease-out forwards;
      z-index:30;
    `;
    viewportEl.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _getDef(taskId, stimuliSource) {
  // Prefer the embedded payload map (works from JSON alone on the backend)
  if (stimuliSource && stimuliSource[taskId]) return stimuliSource[taskId];
  // Fall back to the live import (works in-app)
  if (TASK_DEFINITIONS && TASK_DEFINITIONS[taskId]) return TASK_DEFINITIONS[taskId];
  return null;
}

function _extractTaskBoundaries(events) {
  const begins = events.filter(e => e.type === 'task-begin');
  return begins.map((e, i) => {
    const nextBegin = begins[i + 1];
    const submit    = events.find(ev =>
      ev.type === 'task-submit' && ev.task_id === e.task_id && ev.timestamp >= e.timestamp
    );
    return {
      task_id: e.task_id,
      start:   e.timestamp,
      end:     submit?.timestamp ?? nextBegin?.timestamp ?? null,
    };
  });
}

function _inWindow(arr, t0, t1) {
  return arr.filter(e => e.t >= t0 && e.t <= t1);
}

function _lastBefore(arr, absT) {
  if (!arr.length) return null;
  let lo = 0, hi = arr.length - 1, result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= absT) { result = arr[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

function _fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function _wrapStimulus(def) {
  const banner = def.instructions
    ? `<div style="margin-bottom:20px;padding:18px 20px;background:#eef2ff;
         color:#1e3a8a;border-radius:14px;border:1px solid #bfdbfe;
         line-height:1.7;font-size:15px;">
         <strong style="display:block;margin-bottom:8px;font-size:16px;">Instructions</strong>
         ${def.instructions}
       </div>`
    : '';
  return `
    <div style="max-width:900px;margin:0 auto;text-align:left;padding:28px;background:#fff;">
      ${banner}
      <div id="task-stimulus" style="margin-bottom:28px;">${def.stimulus_html}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM builder  (light theme)
// ─────────────────────────────────────────────────────────────────────────────

function _buildOverlay() {
  const el = document.createElement('div');
  el.id = 'replay-overlay';
  el.innerHTML = `
    <style>
      #replay-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: #f8fafc;
        display: flex; flex-direction: column;
        font-family: system-ui, -apple-system, sans-serif;
        color: #111827;
        color-scheme: light;   /* force light regardless of OS preference */
      }

      /* ── Header ────────────────────────────────────────────────────────── */
      #rp-header {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 14px;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        flex-shrink: 0; flex-wrap: wrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      #rp-header h2 {
        margin: 0; font-size: 14px; font-weight: 700;
        color: #1e293b; white-space: nowrap; flex-shrink: 0;
      }
      #rp-task-select {
        padding: 5px 10px; border-radius: 7px;
        background: #f1f5f9; border: 1px solid #cbd5e1;
        color: #1e293b; font-size: 13px; cursor: pointer;
        flex: 1; min-width: 180px; max-width: 320px;
      }
      .rp-speed-btn {
        padding: 4px 10px; border-radius: 6px;
        background: #f1f5f9; border: 1px solid #cbd5e1;
        color: #475569; font-size: 12px; cursor: pointer;
        transition: all 0.12s;
      }
      .rp-speed-btn.rp-active, .rp-speed-btn:hover {
        background: #4f46e5; border-color: #4f46e5; color: #fff;
      }
      #rp-close {
        margin-left: auto; padding: 5px 14px; border-radius: 7px;
        background: #fee2e2; border: 1px solid #fca5a5;
        color: #dc2626; font-size: 13px; font-weight: 600;
        cursor: pointer; transition: background 0.12s; flex-shrink: 0;
      }
      #rp-close:hover { background: #fecaca; }

      /* ── Legend / meta bar ─────────────────────────────────────────────── */
      #rp-meta {
        display: flex; gap: 16px; align-items: center;
        padding: 4px 14px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        font-size: 12px; color: #64748b;
        flex-shrink: 0; flex-wrap: wrap;
      }
      .rp-legend-item { display: flex; align-items: center; gap: 5px; }
      .rp-dot {
        width: 10px; height: 10px; border-radius: 50%;
        flex-shrink: 0;
      }

      /* ── Viewport area ─────────────────────────────────────────────────── */
      #rp-viewport-wrap {
        flex: 1; overflow: hidden;
        display: flex; align-items: flex-start; justify-content: center;
        background: #e2e8f0;
      }

      /*
       * transform:scale(1) makes this the containing block for position:fixed
       * descendants, so modal popups inside the stimulus stay inside the frame.
       */
      #rp-viewport {
        position: relative;
        width: 100%; height: 100%;
        background: #fff;
        overflow: hidden;
        transform: scale(1);
      }

      /*
       * Content wrapper uses top (not transform) so position:fixed children
       * remain anchored to #rp-viewport, not to this element.
       */
      #rp-content-wrapper {
        position: absolute;
        top: 0; left: 0; width: 100%;
      }

      /* ── Cursor overlay ────────────────────────────────────────────────── */
      #rp-cursor {
        position: absolute;
        width: 16px; height: 16px;
        background: rgba(245, 158, 11, 0.95);  /* amber — mouse cursor */
        border: 2px solid #fff;
        border-radius: 50%;
        pointer-events: none; z-index: 20;
        transform: translate(-50%, -50%);
        display: none;
        box-shadow: 0 0 0 3px rgba(245,158,11,0.25), 0 2px 4px rgba(0,0,0,0.2);
      }

      /* ── Gaze dot ──────────────────────────────────────────────────────── */
      #rp-gaze {
        position: absolute;
        width: 30px; height: 30px;
        background: rgba(236, 72, 153, 0.55);   /* magenta — matches live gaze dot */
        border: 2px solid rgba(236,72,153,0.9);
        border-radius: 50%;
        pointer-events: none; z-index: 19;
        transform: translate(-50%, -50%);
        display: none;
        box-shadow: 0 0 0 4px rgba(236,72,153,0.15);
      }

      /* ── Footer controls ───────────────────────────────────────────────── */
      #rp-footer {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 14px;
        background: #fff;
        border-top: 1px solid #e2e8f0;
        flex-shrink: 0;
        box-shadow: 0 -1px 3px rgba(0,0,0,0.04);
      }
      #rp-play {
        width: 34px; height: 34px; border-radius: 50%;
        background: #4f46e5; border: none; color: #fff;
        font-size: 14px; cursor: pointer; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.12s;
      }
      #rp-play:hover { background: #4338ca; }
      #rp-scrubber {
        flex: 1; cursor: pointer;
        accent-color: #4f46e5;
      }
      #rp-time {
        font-size: 12px; color: #64748b;
        font-variant-numeric: tabular-nums;
        white-space: nowrap; flex-shrink: 0;
      }
      #rp-kb-hint {
        font-size: 11px; color: #94a3b8; flex-shrink: 0; white-space: nowrap;
      }

      @keyframes rp-ripple {
        0%   { transform: scale(0.5); opacity: 0.8; }
        100% { transform: scale(3);   opacity: 0; }
      }
    </style>

    <!-- Header -->
    <div id="rp-header">
      <h2>🎬 Session Replay</h2>
      <select id="rp-task-select"><option value="">Select task…</option></select>
      <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;">
        <span style="font-size:12px;color:#94a3b8;">Speed:</span>
        <button class="rp-speed-btn" data-speed="0.5">0.5×</button>
        <button class="rp-speed-btn rp-active" data-speed="1">1×</button>
        <button class="rp-speed-btn" data-speed="2">2×</button>
        <button class="rp-speed-btn" data-speed="4">4×</button>
      </div>
      <button id="rp-close">✕ Close</button>
    </div>

    <!-- Meta / legend bar -->
    <div id="rp-meta">
      <div class="rp-legend-item">
        <div class="rp-dot" style="background:rgba(245,158,11,0.95);"></div>
        <span>Mouse cursor</span>
      </div>
      <div class="rp-legend-item">
        <div class="rp-dot" style="background:rgba(236,72,153,0.7);"></div>
        <span>Eye gaze</span>
      </div>
      <div class="rp-legend-item">
        <div class="rp-dot" style="background:rgba(239,68,68,0.6);border-radius:2px;"></div>
        <span>Click</span>
      </div>
      <span id="rp-gaze-count" style="margin-left:auto;font-weight:500;"></span>
      <span id="rp-task-gaze" style="color:#94a3b8;"></span>
    </div>

    <!-- Viewport -->
    <div id="rp-viewport-wrap">
      <div id="rp-viewport">
        <div id="rp-content-wrapper">
          <div id="rp-stimulus"></div>
        </div>
        <div id="rp-cursor"></div>
        <div id="rp-gaze"></div>
      </div>
    </div>

    <!-- Footer controls -->
    <div id="rp-footer">
      <button id="rp-play">▶</button>
      <input id="rp-scrubber" type="range" min="0" max="1000" value="0" step="1" />
      <span id="rp-time">0:00 / 0:00</span>
      <span id="rp-kb-hint">Space play/pause · ← → ±5 s · Esc close</span>
    </div>
  `;
  return el;
}