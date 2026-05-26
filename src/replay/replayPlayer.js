/**
 * replayPlayer.js
 *
 * Full session replay engine.  Reads the assembled payload (same object
 * written to the server or downloaded as JSON) and plays it back inside
 * a sandboxed fullscreen overlay.
 *
 * What is replayed:
 *   • Mouse cursor position       — mouseEvents [{t, x_norm, y_norm}]
 *   • Click ripple                — clickEvents  [{t, x_norm, y_norm}]
 *   • Eye-gaze dot                — gazeLog      [{t, x, y}]  (normalised −0.5…0.5)
 *   • Scroll state                — scrollEvents [{t, scrollY, target_id}]
 *
 * Scroll notes
 * ------------
 * Mouse events use clientX/Y (viewport-relative), so they are always correct
 * regardless of scroll position.  Scroll events let us pan the stimulus
 * content so the researcher can see *which part of the page* was visible at
 * each moment — matching what the participant actually saw.
 *
 * Fixed-position elements (modal popups etc.) inside the stimulus are kept
 * correct via a CSS transform trick: the viewport container has
 * `transform: scale(1)` which makes it the containing block for all
 * `position:fixed` descendants.  The content is then scrolled by adjusting
 * `top` on an inner wrapper (not a transform) so fixed children stay pinned
 * to the viewport container, not the scrolling content.
 *
 * Usage
 * -----
 *   import { launchReplay } from './replay/replayPlayer';
 *   launchReplay(payload);   // payload = _assemblePayload() from debrief.js
 */

import { TASK_DEFINITIONS } from '../experiment/taskRunner';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export function launchReplay(payload) {
  // Prevent duplicate overlays
  if (document.getElementById('replay-overlay')) return;

  const taskBoundaries = _extractTaskBoundaries(payload.events || []);
  if (!taskBoundaries.length) {
    alert('No task data found in this session — replay is unavailable.');
    return;
  }

  const overlay = _buildOverlay();
  document.body.appendChild(overlay);

  // ── State ─────────────────────────────────────────────────────────────────

  let currentTaskId  = taskBoundaries[0].task_id;
  let playbackMs     = 0;      // ms elapsed within the current task
  let taskDurationMs = 1;
  let isPlaying      = false;
  let speedFactor    = 1;
  let rafId          = null;
  let lastRafTime    = null;   // performance.now() of previous RAF tick

  // Per-task sorted event arrays (set by _selectTask)
  let tMouse   = [];
  let tScroll  = [];
  let tGaze    = [];
  let tClicks  = [];
  let taskT0   = 0;            // absolute Date.now() ms of task start

  // ── DOM references ────────────────────────────────────────────────────────

  const stimulusEl   = overlay.querySelector('#rp-stimulus');
  const wrapperEl    = overlay.querySelector('#rp-content-wrapper');
  const cursorEl     = overlay.querySelector('#rp-cursor');
  const gazeEl       = overlay.querySelector('#rp-gaze');
  const viewportEl   = overlay.querySelector('#rp-viewport');
  const scrubberEl   = overlay.querySelector('#rp-scrubber');
  const timeEl       = overlay.querySelector('#rp-time');
  const playBtn      = overlay.querySelector('#rp-play');
  const taskSelect   = overlay.querySelector('#rp-task-select');
  const speedBtns    = overlay.querySelectorAll('.rp-speed-btn');
  const closeBtn     = overlay.querySelector('#rp-close');

  // ── Populate task selector ────────────────────────────────────────────────

  taskBoundaries.forEach((b, i) => {
    const def = TASK_DEFINITIONS[b.task_id];
    const label = def ? `${i + 1}. ${def.title}` : b.task_id;
    const opt = document.createElement('option');
    opt.value = b.task_id;
    opt.textContent = label;
    taskSelect.appendChild(opt);
  });
  taskSelect.value = currentTaskId;

  // ── Select first task ─────────────────────────────────────────────────────

  _selectTask(currentTaskId);

  // ── Event listeners ───────────────────────────────────────────────────────

  taskSelect.addEventListener('change', () => {
    _pause();
    _selectTask(taskSelect.value);
  });

  playBtn.addEventListener('click', () => {
    if (isPlaying) _pause(); else _play();
  });

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

  closeBtn.addEventListener('click', () => {
    _pause();
    overlay.remove();
  });

  // Keyboard shortcuts
  overlay.addEventListener('keydown', e => {
    if (e.key === ' ')  { e.preventDefault(); if (isPlaying) _pause(); else _play(); }
    if (e.key === 'Escape') { _pause(); overlay.remove(); }
  });
  overlay.setAttribute('tabindex', '0');
  overlay.focus();

  // ─────────────────────────────────────────────────────────────────────────
  // Core functions
  // ─────────────────────────────────────────────────────────────────────────

  function _selectTask(taskId) {
    currentTaskId = taskId;
    taskSelect.value = taskId;

    const boundary = taskBoundaries.find(b => b.task_id === taskId);
    if (!boundary) return;

    taskT0         = boundary.start;
    const taskEnd  = boundary.end ?? (boundary.start + 600_000); // 10 min fallback
    taskDurationMs = Math.max(taskEnd - taskT0, 1);

    // Filter events to this task time window
    tMouse  = _inWindow(payload.mouseEvents  || [], taskT0, taskEnd);
    tScroll = _inWindow(payload.scrollEvents || [], taskT0, taskEnd);
    tGaze   = _inWindow(payload.gazeLog      || [], taskT0, taskEnd);
    tClicks = _inWindow(payload.clickEvents  || [], taskT0, taskEnd);

    // Render the task stimulus
    const def = TASK_DEFINITIONS[taskId];
    stimulusEl.innerHTML = def ? _wrapStimulus(def) : `<p style="color:#94a3b8;padding:32px;">No stimulus found for task <code>${taskId}</code></p>`;

    // Reset playback position
    playbackMs    = 0;
    lastRafTime   = null;
    scrubberEl.max = 1000;
    scrubberEl.value = 0;

    _resetOverlays();
    _renderFrame(0);
  }

  function _play() {
    if (isPlaying) return;
    // If at end, restart
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

    if (lastRafTime !== null) {
      const wallDelta = nowPerf - lastRafTime;   // real ms since last frame
      playbackMs += wallDelta * speedFactor;
    }
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

    // ── Mouse cursor ──────────────────────────────────────────────────────
    const mouse = _lastBefore(tMouse, absT);
    if (mouse) {
      const vw = viewportEl.clientWidth;
      const vh = viewportEl.clientHeight;
      cursorEl.style.left    = `${mouse.x_norm * vw}px`;
      cursorEl.style.top     = `${mouse.y_norm * vh}px`;
      cursorEl.style.display = 'block';
    }

    // ── Gaze dot ──────────────────────────────────────────────────────────
    const gaze = _lastBefore(tGaze, absT);
    if (gaze && typeof gaze.x === 'number') {
      const vw = viewportEl.clientWidth;
      const vh = viewportEl.clientHeight;
      // gazeLog stores normalised coords in −0.5…0.5 space
      gazeEl.style.left    = `${(gaze.x + 0.5) * vw}px`;
      gazeEl.style.top     = `${(gaze.y + 0.5) * vh}px`;
      gazeEl.style.display = 'block';
    }

    // ── Scroll ────────────────────────────────────────────────────────────
    // Scroll the content wrapper for window-level scrolls.
    // Inner container scrolls (target_id !== '__window__') are applied
    // to their matching element inside the rendered stimulus.
    const winScroll = _lastBefore(
      tScroll.filter(s => s.target_id === '__window__'), absT
    );
    const scrollY = winScroll?.scrollY ?? 0;
    // We move the wrapper *up* by scrollY so the content simulates scrolling
    wrapperEl.style.top = `${-scrollY}px`;

    // Apply any recorded inner-container scroll positions
    const innerScrollNow = tScroll
      .filter(s => s.target_id !== '__window__' && s.t <= absT)
      .reduce((map, s) => { map[s.target_id] = s; return map; }, {});
    Object.values(innerScrollNow).forEach(s => {
      const el = stimulusEl.querySelector(`#${CSS.escape(s.target_id)}`);
      if (el) {
        if (s.scrollY !== undefined) el.scrollTop  = s.scrollY;
        if (s.scrollX !== undefined) el.scrollLeft = s.scrollX;
      }
    });

    // ── Click ripple ──────────────────────────────────────────────────────
    // Show a brief ripple for clicks that just became "current"
    const clickNow = tClicks.find(c =>
      Math.abs(c.t - absT) < 80  // within one ~50ms sample
    );
    if (clickNow) _showClickRipple(clickNow);

    // ── UI controls ───────────────────────────────────────────────────────
    const fraction = Math.min(ms / taskDurationMs, 1);
    scrubberEl.value = Math.round(fraction * 1000);
    timeEl.textContent = `${_fmtMs(ms)} / ${_fmtMs(taskDurationMs)}`;
  }

  function _resetOverlays() {
    cursorEl.style.display = 'none';
    gazeEl.style.display   = 'none';
    wrapperEl.style.top    = '0px';
  }

  function _showClickRipple(evt) {
    const vw = viewportEl.clientWidth;
    const vh = viewportEl.clientHeight;
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position:absolute;
      left:${evt.x_norm * vw}px;
      top:${evt.y_norm * vh}px;
      width:20px; height:20px;
      margin:-10px 0 0 -10px;
      border-radius:50%;
      background:rgba(251,191,36,0.7);
      pointer-events:none;
      animation:rp-ripple 0.4s ease-out forwards;
      z-index:10;
    `;
    viewportEl.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract {task_id, start, end} boundaries from the events log.
 * Uses 'task-begin' as start and 'task-submit' (or next task-begin) as end.
 */
function _extractTaskBoundaries(events) {
  const begins = events.filter(e => e.type === 'task-begin');
  return begins.map((e, i) => {
    const nextBegin = begins[i + 1];
    const submit    = events.find(ev =>
      ev.type === 'task-submit' &&
      ev.task_id === e.task_id &&
      ev.timestamp >= e.timestamp
    );
    const end = submit?.timestamp ?? nextBegin?.timestamp ?? null;
    return {
      task_id: e.task_id,
      start:   e.timestamp,
      end,
    };
  });
}

/** Return events with t in [t0, t1] */
function _inWindow(arr, t0, t1) {
  return arr.filter(e => e.t >= t0 && e.t <= t1);
}

/** Binary-search for the last event where e.t <= absT */
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

/** ms → "m:ss.t" */
function _fmtMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m  = Math.floor(totalSec / 60);
  const s  = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Wrap the raw stimulus HTML the same way taskRunner does, so layout
 * matches what the participant actually saw (instructions banner + padding).
 */
function _wrapStimulus(def) {
  const instrBanner = def.instructions
    ? `<div style="margin-bottom:20px;padding:18px 20px;background:#eef2ff;
         color:#1e3a8a;border-radius:14px;border:1px solid #bfdbfe;
         line-height:1.7;font-size:15px;">
         <strong style="display:block;margin-bottom:8px;font-size:16px;">Instructions</strong>
         ${def.instructions}
       </div>`
    : '';
  return `
    <div style="max-width:900px;margin:0 auto;text-align:left;padding:28px;">
      ${instrBanner}
      <div id="task-stimulus" style="margin-bottom:28px;">${def.stimulus_html}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM builder
// ─────────────────────────────────────────────────────────────────────────────

function _buildOverlay() {
  const el = document.createElement('div');
  el.id = 'replay-overlay';
  el.innerHTML = `
    <style>
      /* ── Replay overlay scoped styles ─────────────────────────────────── */
      #replay-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: #0f172a;
        display: flex; flex-direction: column;
        font-family: system-ui, -apple-system, sans-serif;
        color: #f1f5f9;
      }

      /* Header bar */
      #rp-header {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 16px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      #rp-header h2 {
        margin: 0; font-size: 15px; font-weight: 700;
        color: #e2e8f0; white-space: nowrap;
        flex-shrink: 0;
      }
      #rp-task-select {
        padding: 6px 10px; border-radius: 8px;
        background: #334155; border: 1px solid #475569;
        color: #f1f5f9; font-size: 13px; cursor: pointer;
        flex: 1; min-width: 180px; max-width: 300px;
      }
      .rp-speed-btn {
        padding: 4px 10px; border-radius: 6px;
        background: #334155; border: 1px solid #475569;
        color: #94a3b8; font-size: 12px; cursor: pointer;
        transition: all 0.15s;
      }
      .rp-speed-btn.rp-active, .rp-speed-btn:hover {
        background: #4f46e5; border-color: #4f46e5; color: #fff;
      }
      #rp-close {
        margin-left: auto; padding: 6px 14px; border-radius: 8px;
        background: #ef4444; border: none;
        color: #fff; font-size: 13px; font-weight: 600;
        cursor: pointer; transition: background 0.15s; flex-shrink: 0;
      }
      #rp-close:hover { background: #dc2626; }

      /* Legend */
      #rp-legend {
        display: flex; gap: 16px; align-items: center;
        padding: 0 16px;
        font-size: 12px; color: #94a3b8;
        flex-shrink: 0;
      }
      .rp-legend-dot {
        display: inline-block; width: 10px; height: 10px;
        border-radius: 50%; margin-right: 5px; vertical-align: middle;
      }

      /* Viewport area */
      #rp-viewport-wrap {
        flex: 1; overflow: hidden;
        display: flex; align-items: flex-start; justify-content: center;
        background: #1e293b;
        padding: 0;
      }

      /*
       * The viewport is the visible "screen".
       * transform:scale(1) makes it the containing block for position:fixed
       * descendants (modal popups etc.) so they stay within the viewport.
       */
      #rp-viewport {
        position: relative;
        width: 100%; height: 100%;
        background: #fff;
        overflow: hidden;
        transform: scale(1);
      }

      /*
       * The content wrapper is NOT transformed — only its top moves.
       * This means position:fixed children of the stimulus are anchored
       * to #rp-viewport (correct), while non-fixed content scrolls with the wrapper.
       */
      #rp-content-wrapper {
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        /* height intentionally unconstrained — stimulus may be taller than viewport */
      }

      /* Cursor overlay element */
      #rp-cursor {
        position: absolute;
        width: 18px; height: 18px;
        background: rgba(251, 191, 36, 0.9);
        border: 2px solid #fff;
        border-radius: 50%;
        pointer-events: none;
        z-index: 20;
        transform: translate(-50%, -50%);
        display: none;
        box-shadow: 0 0 0 3px rgba(251,191,36,0.3);
        transition: left 0.04s linear, top 0.04s linear;
      }

      /* Gaze dot overlay */
      #rp-gaze {
        position: absolute;
        width: 28px; height: 28px;
        background: rgba(168, 85, 247, 0.6);
        border: 2px solid rgba(255,255,255,0.5);
        border-radius: 50%;
        pointer-events: none;
        z-index: 19;
        transform: translate(-50%, -50%);
        display: none;
        transition: left 0.04s linear, top 0.04s linear;
      }

      /* Footer controls */
      #rp-footer {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 16px;
        background: #1e293b;
        border-top: 1px solid #334155;
        flex-shrink: 0;
      }
      #rp-play {
        width: 36px; height: 36px; border-radius: 50%;
        background: #4f46e5; border: none; color: #fff;
        font-size: 16px; cursor: pointer; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      #rp-play:hover { background: #4338ca; }
      #rp-scrubber {
        flex: 1; cursor: pointer;
        accent-color: #4f46e5;
        height: 4px;
      }
      #rp-time {
        font-size: 12px; color: #94a3b8;
        font-variant-numeric: tabular-nums;
        white-space: nowrap; flex-shrink: 0;
      }

      /* Click ripple animation */
      @keyframes rp-ripple {
        0%   { transform: scale(0.5); opacity: 1; }
        100% { transform: scale(2.5); opacity: 0; }
      }
    </style>

    <!-- Header -->
    <div id="rp-header">
      <h2>🎬 Session Replay</h2>
      <select id="rp-task-select"><option value="">Select task…</option></select>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        <span style="font-size:12px;color:#64748b;">Speed:</span>
        <button class="rp-speed-btn" data-speed="0.5">0.5×</button>
        <button class="rp-speed-btn rp-active" data-speed="1">1×</button>
        <button class="rp-speed-btn" data-speed="2">2×</button>
        <button class="rp-speed-btn" data-speed="4">4×</button>
      </div>
      <div id="rp-legend">
        <span><span class="rp-legend-dot" style="background:rgba(251,191,36,0.9);"></span>Mouse</span>
        <span><span class="rp-legend-dot" style="background:rgba(168,85,247,0.6);"></span>Gaze</span>
        <span><span class="rp-legend-dot" style="background:rgba(251,191,36,0.7);border-radius:2px;"></span>Click</span>
      </div>
      <button id="rp-close">✕ Close</button>
    </div>

    <!-- Viewport -->
    <div id="rp-viewport-wrap">
      <div id="rp-viewport">
        <div id="rp-content-wrapper">
          <div id="rp-stimulus"></div>
        </div>
        <!-- Cursor and gaze are OUTSIDE rp-content-wrapper so they stay
             viewport-relative (not affected by the scroll translation) -->
        <div id="rp-cursor"></div>
        <div id="rp-gaze"></div>
      </div>
    </div>

    <!-- Footer controls -->
    <div id="rp-footer">
      <button id="rp-play">▶</button>
      <input id="rp-scrubber" type="range" min="0" max="1000" value="0" step="1" />
      <span id="rp-time">0:00 / 0:00</span>
    </div>
  `;
  return el;
}