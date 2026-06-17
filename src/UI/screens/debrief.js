import { sessionData } from '../../experiment/session';
import { CONFIG } from '../../experiment/config';
import { TASK_DEFINITIONS } from '../../experiment/taskRunner';
import { launchReplay } from '../../replay/replayPlayer';

const RESEARCHER_EMAIL = 'jd2117@cam.ac.uk';

export function renderDebriefScreen({ placeholder = false } = {}) {
  const el = document.getElementById('screen-debrief');
  if (!el) return;

  if (placeholder) {
    el.innerHTML = '<div></div>'; // placeholder render only; do not submit session data yet
    return;
  }

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

/**
 * Assembles the full in-memory payload for local use (download fallback,
 * replay, etc.). Always includes gazeLog and taskStimuli.
 */
function _assembleFullPayload() {
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
    gazeLog:            sessionData.gazeLog,
    fixationLog:        sessionData.fixationLog,
    rawGazeWindows:     sessionData.rawGazeWindows,
    gazeManagerStatus:  sessionData.gazeManagerStatus,

    // ── Behavioural data ──────────────────────────────────────────────────────
    mouseEvents:        sessionData.mouseEvents,
    clickEvents:        sessionData.clickEvents,
    scrollEvents:       sessionData.scrollEvents,

    // ── Task responses & probes ───────────────────────────────────────────────
    taskResponses:      sessionData.taskResponses,
    probeResponses:     sessionData.probeResponses,
    demographics:       sessionData.demographics,

    // ── Workload ──────────────────────────────────────────────────────────────
    nasaTLX:            sessionData.nasaTLX,

    // ── Replay-friendly stimulus payload ─────────────────────────────────────
    taskStimuli:        _getTaskStimuli(),

    // ── Full event log ────────────────────────────────────────────────────────
    events:             sessionData.events,
  };
}

/**
 * Assembles the slim payload sent to the server via POST.
 *
 * WHY gazeLog IS EXCLUDED:
 *   When GAZE_STREAMING_ENABLED is true (which it must be for long sessions),
 *   gazeLog has already been uploaded in 30-second chunks via /save-jit/gaze-chunk.
 *   The server merges those chunks back into the final session file automatically
 *   (see mergeChunkGaze in server.js). Sending gazeLog again here would:
 *     1. Double the data on disk.
 *     2. Push the POST body over nginx's client_max_body_size (typically 1 MB
 *        for university proxies), causing a 413 that drops the entire session.
 *
 * WHY taskStimuli IS EXCLUDED:
 *   Each task's stimulus_html can be several KB of markup × 8 tasks ≈ 50–200 KB.
 *   It is only needed for the replay player, not for analysis. The server
 *   re-serves it from the compiled session file fetched in _fetchCompiledSession().
 *
 * The slim POST body is typically under 300 KB regardless of session length.
 */
function _assembleSlimPayload() {
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

    // ── Gaze metadata (not the log itself — that's in chunks on the server) ──
    // gazeLog is intentionally omitted. The server merges it from chunks.
    gazeLog_sample_count: (sessionData.gazeLog || []).length,
    gazeLog_streamed:     CONFIG.GAZE_STREAMING_ENABLED,
    fixationLog:          sessionData.fixationLog,
    rawGazeWindows:       sessionData.rawGazeWindows,
    gazeManagerStatus:    sessionData.gazeManagerStatus,

    // ── Behavioural data ──────────────────────────────────────────────────────
    mouseEvents:        sessionData.mouseEvents,
    clickEvents:        sessionData.clickEvents,
    scrollEvents:       sessionData.scrollEvents,

    // ── Task responses & probes ───────────────────────────────────────────────
    taskResponses:      sessionData.taskResponses,
    probeResponses:     sessionData.probeResponses,
    demographics:       sessionData.demographics,

    // ── Workload ──────────────────────────────────────────────────────────────
    nasaTLX:            sessionData.nasaTLX,

    // ── taskStimuli intentionally omitted (large HTML; only needed for replay)
    // The server merges it when _fetchCompiledSession() runs after a successful POST.

    // ── Full event log ────────────────────────────────────────────────────────
    events:             sessionData.events,
  };
}

async function _fetchCompiledSession() {
  const params = new URLSearchParams({
    session_id:    sessionData.SESSION_ID    || '',
    study_id:      sessionData.STUDY_ID      || '',
    prolific_pid:  sessionData.PROLIFIC_PID  || '',
    participantId: sessionData.participantId || '',
  });

  const response = await fetch(`${CONFIG.DATA_ENDPOINT}/session?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Compiled session fetch failed: ${response.status}`);
  }

  return response.json();
}

function _getTaskStimuli() {
  const taskIds = new Set(
    sessionData.events
      .filter((evt) => evt.task_id)
      .map((evt) => evt.task_id)
  );

  return Array.from(taskIds).reduce((result, taskId) => {
    const def = TASK_DEFINITIONS[taskId];
    if (!def) return result;
    result[taskId] = {
      title:         def.title,
      instructions:  def.instructions || null,
      stimulus_html: def.stimulus_html || null,
    };
    return result;
  }, {});
}

// ── Submission ────────────────────────────────────────────────────────────────

async function _submitSessionData() {
  // Flush any remaining gaze samples to the server before the final POST.
  // This uploads the tail end of gazeLog that hasn't been chunked yet,
  // so the server has 100% of the gaze data before we POST the slim payload.
  try {
    if (window.gazeManager && typeof window.gazeManager.flushAndStopGazeUpload === 'function') {
      await window.gazeManager.flushAndStopGazeUpload();
    }
  } catch (err) {
    console.warn('Final gaze flush failed (continuing anyway):', err);
  }

  if (!CONFIG.DATA_ENDPOINT) {
    _showDownloadFallback();
    return;
  }

  try {
    // POST the slim payload — gazeLog is already on the server as chunks.
    // This keeps the POST body under ~300 KB regardless of session length,
    // avoiding the nginx 413 that kills long sessions.
    const slimPayload = _assembleSlimPayload();
    const response = await fetch(CONFIG.DATA_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(slimPayload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    // After the server merges chunks into the session file, fetch the compiled
    // payload (which includes merged gazeLog) for the replay player.
    let compiledPayload = null;
    try {
      compiledPayload = await _fetchCompiledSession();
      console.log('Loaded compiled replay payload from server (includes merged gaze chunks).');
    } catch (fetchError) {
      console.warn('Could not load compiled replay payload — falling back to in-memory payload:', fetchError);
    }

    // For replay, prefer the compiled (server-merged) payload; fall back to
    // the full in-memory payload if the fetch failed.
    const replayPayload = compiledPayload || _assembleFullPayload();
    _showDebriefSuccess(replayPayload);

  } catch (error) {
    console.error('Data submission failed:', error);
    // Fall back to local download — participant keeps everything including gazeLog.
    _showDownloadFallback();
  }
}

// ── Success screen ────────────────────────────────────────────────────────────

function _showDebriefSuccess(replayPayload) {
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

  document.getElementById('debrief-replay-btn')
    .addEventListener('click', () => launchReplay(replayPayload));

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

  // Use the FULL payload for the download — includes gazeLog and taskStimuli
  // since the server is unreachable and we need everything locally.
  const payload  = _assembleFullPayload();
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

  document.getElementById('debrief-replay-btn')
    .addEventListener('click', () => launchReplay(payload));
}