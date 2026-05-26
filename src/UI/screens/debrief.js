import { sessionData } from '../../experiment/session';
import { CONFIG } from '../../experiment/config';
import { TASK_DEFINITIONS } from '../../experiment/taskRunner';
import { launchReplay } from '../../replay/replayPlayer';

const RESEARCHER_EMAIL = 'jd2117@cam.ac.uk';

export function renderDebriefScreen() {
  const el = document.getElementById('screen-debrief');
  if (!el) return;

  sessionData.endTime = performance.now();

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
      <div style="text-align:center;">
        <div style="
          width:56px;height:56px;
          border:4px solid #e5e7eb;border-top:4px solid #4f46e5;
          border-radius:50%;animation:debrief-spin 1s linear infinite;
          margin:0 auto 20px;
        "></div>
        <p style="color:#6b7280;font-size:16px;">Submitting your responses…</p>
      </div>
      <style>
        @keyframes debrief-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      </style>
    </div>`;

  _submitSessionData();
}

// ── Payload assembly ──────────────────────────────────────────────────────────

function _assemblePayload() {
  if (window._calibrationSystem && !sessionData.calibrationQuality) {
    sessionData.calibrationQuality = {
      biasX:               window._calibrationSystem.biasX  || 0,
      biasY:               window._calibrationSystem.biasY  || 0,
      qualityMeasurements: window._calibrationSystem.qualityMeasurements || [],
    };
  }

  return {
    // ── Identifiers ──────────────────────────────────────────────────────────
    participantId:  sessionData.participantId,
    participantIDs: {
      prolific_pid: sessionData.PROLIFIC_PID,
      study_id:     sessionData.STUDY_ID,
      session_id:   sessionData.SESSION_ID,
    },

    // ── Timing ───────────────────────────────────────────────────────────────
    timestamps: {
      startTime:       sessionData.startTime,
      consentTime:     sessionData.consentTimestamp,
      endTime:         sessionData.endTime,
      durationSeconds: (sessionData.endTime - sessionData.startTime) / 1000,
    },

    // ── Environment & calibration ────────────────────────────────────────────
    environmentCheck:   sessionData.environmentCheck,
    calibrationQuality: sessionData.calibrationQuality,
    gazeInitialized:    sessionData.gazeInitialized,

    // ── Gaze data ─────────────────────────────────────────────────────────────
    // gazeLog is the primary continuous stream (~30 fps during tasks).
    // fixationLog contains detected fixation events.
    // rawGazeWindows contains short bursts captured around probe events.
    gazeLog:            sessionData.gazeLog,
    fixationLog:        sessionData.fixationLog,
    rawGazeWindows:     sessionData.rawGazeWindows,
    gazeManagerStatus:  sessionData.gazeManagerStatus,

    // ── Behavioural data ──────────────────────────────────────────────────────
    mouseEvents:        sessionData.mouseEvents,
    clickEvents:        sessionData.clickEvents,
    scrollEvents:       sessionData.scrollEvents,   // ← new: required for scroll-aware replay

    // ── Task responses & probes ───────────────────────────────────────────────
    taskResponses:      sessionData.taskResponses,
    probeResponses:     sessionData.probeResponses,
    demographics:       sessionData.demographics,

    // ── Workload ──────────────────────────────────────────────────────────────
    nasaTLX:            sessionData.nasaTLX,

    // ── Full event log ────────────────────────────────────────────────────────
    events:             sessionData.events,

    // ── Task stimuli (embedded for backend/offline replay without the app) ────
    // Maps task_id → { stimulus_html, instructions, title }.
    // The replay player uses this when running from a downloaded JSON rather
    // than from the live app bundle (where TASK_DEFINITIONS is importable).
    taskStimuli: Object.fromEntries(
      CONFIG.TASK_ORDER
        .filter(id => TASK_DEFINITIONS[id])
        .map(id => {
          const def = TASK_DEFINITIONS[id];
          return [id, {
            title:         def.title,
            instructions:  def.instructions ?? null,
            stimulus_html: def.stimulus_html,
          }];
        })
    ),
  };
}

// ── Submission ────────────────────────────────────────────────────────────────

async function _submitSessionData() {
  // Ensure any background gaze uploads complete before final submission
  try {
    if (window.gazeManager && typeof window.gazeManager.flushAndStopGazeUpload === 'function') {
      await window.gazeManager.flushAndStopGazeUpload();
    }
  } catch (err) {
    console.warn('Final gaze upload failed (continuing):', err);
  }

  if (!CONFIG.DATA_ENDPOINT) {
    _showDownloadFallback();
    return;
  }

  try {
    const payload  = _assemblePayload();
    const response = await fetch(CONFIG.DATA_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    _showDebriefSuccess(payload);
  } catch (error) {
    console.error('Data submission failed:', error);
    _showDownloadFallback();
  }
}

// ── Success screen ────────────────────────────────────────────────────────────

function _showDebriefSuccess(payload) {
  const el = document.getElementById('screen-debrief');
  if (!el) return;

  el.innerHTML = `
    <div style="max-width:700px;margin:0 auto;padding:48px 24px;text-align:center;">
      <h1 style="margin:0 0 16px;font-size:32px;color:#111827;">Thank You for Participating</h1>
      <div style="margin:28px 0;padding:24px;background:#f0fdf4;border-radius:12px;border:1px solid #86efac;text-align:left;">
        <p style="margin:0;color:#1f2937;line-height:1.7;">
          Your participation is greatly appreciated. The data you provided will contribute to our
          understanding of how people navigate and process information under different conditions.
          Your responses have been securely recorded.
        </p>
      </div>
      <div id="completion-btn-wrap" style="min-height:60px;display:flex;align-items:center;justify-content:center;">
        <p style="color:#9ca3af;font-size:14px;">Preparing completion link…</p>
      </div>
      <div style="margin-top:24px;">
        <button id="debrief-replay-btn" style="
          padding:10px 22px;border:1px solid #6366f1;border-radius:8px;
          background:transparent;color:#4f46e5;font-size:14px;font-weight:600;
          cursor:pointer;transition:all 0.15s;"
          onmouseover="this.style.background='#eef2ff'" onmouseout="this.style.background='transparent'">
          🎬 Replay Session
        </button>
      </div>
    </div>`;

  // Wire replay button (payload captured in closure)
  document.getElementById('debrief-replay-btn')
    .addEventListener('click', () => launchReplay(payload));

  setTimeout(() => {
    const wrap = document.getElementById('completion-btn-wrap');
    if (!wrap) return;
    if (CONFIG.PROLIFIC_COMPLETION_URL) {
      wrap.innerHTML = `
        <a href="${CONFIG.PROLIFIC_COMPLETION_URL}"
          style="display:inline-block;padding:14px 32px;background:#059669;color:#fff;
                 border-radius:8px;font-weight:600;font-size:16px;text-decoration:none;"
          onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
          Complete Study →
        </a>`;
    } else {
      wrap.innerHTML = `<p style="color:#6b7280;font-size:14px;">Study complete. You may now close this tab.</p>`;
    }
  }, 3000);
}

// ── Download fallback ─────────────────────────────────────────────────────────

function _showDownloadFallback() {
  const el = document.getElementById('screen-debrief');
  if (!el) return;

  const payload  = _assemblePayload();
  const pid      = sessionData.participantId || 'unknown';
  const filename = `session-${pid}-${Date.now()}.json`;
  const dataUrl  = 'data:application/json;charset=utf-8,' +
                   encodeURIComponent(JSON.stringify(payload, null, 2));

  el.innerHTML = `
    <div style="max-width:700px;margin:0 auto;padding:48px 24px;">
      <h1 style="margin:0 0 16px;font-size:32px;color:#111827;">Thank You for Participating</h1>

      <div style="margin:20px 0;padding:20px;background:#fef2f2;border-radius:12px;border:1px solid #fecaca;">
        <p style="margin:0 0 6px;color:#991b1b;font-weight:600;">Data Submission Issue</p>
        <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">
          Automatic submission was unavailable. Your responses are preserved — please
          download the file below and email it to us.
        </p>
      </div>

      <div style="margin:20px 0;padding:24px;background:#f0fdf4;border-radius:12px;border:1px solid #86efac;">
        <p style="margin:0;color:#1f2937;line-height:1.7;">
          Your participation is greatly appreciated. The data you provided will contribute
          to our understanding of how people navigate and process information.
        </p>
      </div>

      <div style="margin:20px 0;padding:20px;background:#fef3c7;border-radius:8px;border:1px solid #fcd34d;">
        <p style="margin:0 0 10px;color:#92400e;font-weight:600;">📥 Step 1 — Download your data</p>
        <a href="${dataUrl}" download="${filename}"
          style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#fff;
                 border-radius:6px;font-weight:600;text-decoration:none;"
          onmouseover="this.style.background='#d97706'" onmouseout="this.style.background='#f59e0b'">
          Download Data (JSON)
        </a>
      </div>

      <div style="margin:20px 0;padding:20px;background:#dbeafe;border-radius:8px;border:1px solid #93c5fd;">
        <p style="margin:0 0 8px;color:#1e40af;font-weight:600;">📧 Step 2 — Email the file</p>
        <p style="margin:0;color:#1e3a8a;font-size:14px;line-height:1.6;">
          Email <strong>${filename}</strong> to
          <a href="mailto:${RESEARCHER_EMAIL}" style="color:#1d4ed8;">${RESEARCHER_EMAIL}</a>
          with subject line: <strong>"Study Data – ${pid}"</strong>
        </p>
      </div>

      <div style="margin-top:28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        ${CONFIG.PROLIFIC_COMPLETION_URL
          ? `<a href="${CONFIG.PROLIFIC_COMPLETION_URL}"
               style="display:inline-block;padding:14px 32px;background:#059669;color:#fff;
                      border-radius:8px;font-weight:600;font-size:16px;text-decoration:none;"
               onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
               Complete Study →
             </a>`
          : `<p style="color:#6b7280;font-size:14px;">Study complete. You may now close this tab.</p>`
        }
        <button id="debrief-replay-btn" style="
          padding:10px 22px;border:1px solid #6366f1;border-radius:8px;
          background:transparent;color:#4f46e5;font-size:14px;font-weight:600;
          cursor:pointer;transition:all 0.15s;"
          onmouseover="this.style.background='#eef2ff'" onmouseout="this.style.background='transparent'">
          🎬 Replay Session
        </button>
      </div>
    </div>`;

  // Wire replay button (payload already assembled above)
  document.getElementById('debrief-replay-btn')
    .addEventListener('click', () => launchReplay(payload));
}