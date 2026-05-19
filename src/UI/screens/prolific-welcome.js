import { showScreen } from '../../experiment/router';
import { sessionData } from '../../experiment/session';

export function renderProlificWelcomeScreen() {
  const screen = document.getElementById('screen-prolific-welcome');
  if (!screen) {
    console.error('Missing #screen-prolific-welcome');
    return;
  }

  const prolificPid = sessionData.PROLIFIC_PID || 'Not provided';
  const studyId = sessionData.STUDY_ID || 'Not provided';
  const sessionId = sessionData.SESSION_ID || 'Not provided';

  screen.innerHTML = `
    <div style="max-width:860px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:2rem;margin-bottom:18px;color:#111827;text-align:center;">
        Welcome to the study
      </h1>
      <div style="margin-bottom:20px;padding:20px;border-radius:16px;background:#eff6ff;border:1px solid #dbeafe;color:#1e3a8a;line-height:1.8;">
        <p style="margin:0 0 12px;font-size:1rem;">
          Thank you for participating. Your Prolific identifiers have been logged for processing upon completion of the study.
        </p>
      </div>
      <div style="display:grid;gap:14px;margin-bottom:30px;">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;">
          <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px;">Prolific PID</div>
          <div style="font-size:16px;color:#334155;">${prolificPid}</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;">
          <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px;">Study ID</div>
          <div style="font-size:16px;color:#334155;">${studyId}</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;">
          <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px;">Session ID</div>
          <div style="font-size:16px;color:#334155;">${sessionId}</div>
        </div>
      </div>
      <div style="text-align:center;">
        <button
          id="prolific-welcome-continue"
          style="padding:14px 28px;border:none;border-radius:12px;background:#4f46e5;color:#fff;font-size:16px;font-weight:600;cursor:pointer;"
        >
          Continue to Consent →
        </button>
      </div>
    </div>
  `;

  const btn = document.getElementById('prolific-welcome-continue');
  btn?.addEventListener('click', () => {
    showScreen('screen-consent');
  });
}
