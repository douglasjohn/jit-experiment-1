import { showScreen } from '../../experiment/router';

export function renderCameraRecordingNoticeScreen() {
  const screen = document.getElementById('screen-camera-recording-notice');
  if (!screen) {
    console.error('Missing #screen-camera-recording-notice');
    return;
  }

  screen.innerHTML = `
    <div style="max-width:860px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:2rem;margin-bottom:18px;color:#111827;text-align:center;">
        Camera & Data Recording Notice
      </h1>

      <div style="margin-bottom:24px;padding:24px;border-radius:18px;background:#f8fafc;border:1px solid #c7d2fe;color:#0f172a;line-height:1.8;">
        <p style="margin:0 0 14px;font-size:1rem;">
          This experiment requires access to your camera for eye-tracking purposes; however, <strong>NO video footage or facial images will be recorded, stored, or shared.</strong>
        </p>
        <p style="margin:0 0 14px;font-size:1rem;">
          Your eye gaze data and mouse interaction data will be recorded during the study.
        </p>
        <p style="margin:0;font-size:1rem;">
          For best results, please use a desktop or laptop device, sit directly in front of your screen at a comfortable distance, and switch to full-screen mode.
        </p>
      </div>

      <div style="padding:22px 24px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;color:#92400e;line-height:1.75;margin-bottom:28px;">
        <p style="margin:0;font-size:1rem;">
          If you do not agree to camera access and data recording, you will not be able to participate in this experiment.
        </p>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;align-items:center;">
        <button
          id="camera-notice-continue"
          style="width:100%;max-width:320px;padding:14px 28px;border:none;border-radius:12px;background:#4f46e5;color:#fff;font-size:16px;font-weight:600;cursor:pointer;"
        >
          I Agree, Continue to Consent →
        </button>
        <button
          id="camera-notice-disagree"
          style="width:100%;max-width:320px;padding:14px 28px;border:1px solid #cbd5e1;border-radius:12px;background:#ffffff;color:#334155;font-size:16px;cursor:pointer;"
        >
          I Do Not Agree
        </button>
      </div>

      <p id="camera-notice-disagree-help" style="display:none;margin-top:18px;font-size:13px;color:#64748b;text-align:center;">
        If you do not agree, please close this browser tab. You will not be able to participate without camera access and data recording.
      </p>
    </div>
  `;

  const continueBtn = document.getElementById('camera-notice-continue');
  const disagreeBtn = document.getElementById('camera-notice-disagree');
  const disagreeHelp = document.getElementById('camera-notice-disagree-help');

  continueBtn?.addEventListener('click', () => {
    showScreen('screen-consent');
  });

  disagreeBtn?.addEventListener('click', () => {
    disagreeHelp.style.display = 'block';
    continueBtn.disabled = true;
    disagreeBtn.disabled = true;
    disagreeBtn.style.cursor = 'not-allowed';
    disagreeBtn.style.opacity = '0.65';
  });
}