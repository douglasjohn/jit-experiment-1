import { showScreen } from '../../experiment/router';
import { sessionData } from '../../experiment/session';
import participantInfoSheet from '../../assets/Participant_Info_Sheet_Diss.png';

export function initConsentScreen() {
  const screen = document.getElementById('screen-consent');
  if (!screen) {
    console.error('Missing #screen-consent');
    return;
  }

  // ── Participant ID generation ─────────────────────────────────────────────
  // Uses localStorage to auto-increment across sessions on the same machine.
  // This local ID supplements Prolific IDs in environments where URL params
  // aren't available (e.g. direct lab access).
  if (!localStorage.getItem('user_counter')) {
    localStorage.setItem('user_counter', '1');
  }

  const counter    = Number(localStorage.getItem('user_counter'));
  const newUserID  = `user${String(counter).padStart(3, '0')}`;

  localStorage.setItem('user_counter', String(counter + 1));

  sessionData.participantId = newUserID;
  console.log('🟢 New Experiment Session:', newUserID);

  // ── UI ───────────────────────────────────────────────────────────────────
  screen.innerHTML = `
    <div style="max-width:900px; margin:0 auto; padding:32px 24px;">

      <h1 style="font-size:2rem; margin-bottom:24px; text-align:center; color:#111827;">
        Welcome to this Eye Tracking Experiment
      </h1>

      <div style="
        background:#fafafa; border:1px solid #e5e5e5; border-radius:12px;
        padding:24px; margin-bottom:24px; line-height:1.7; font-size:15px; text-align:left;
      ">
        <p>
          The experiment consists of a series of short tasks, including navigation, reading
          comprehension, information search, and problem-solving. Each task is designed to
          be completed within 1–2 minutes, with some variability depending on your approach.
          After each task you will be asked a few brief questions about your experience.
          <br><br>
          Your interactions — including mouse movement, clicks, and eye gaze — will be
          recorded during the study. If you choose to exit before completion,
          <strong>no data will be saved</strong>.
          <br><br>
          If you have any questions regarding the study, please contact:
          <strong>jd2117@cam.ac.uk</strong>
        </p>
      </div>

      <div style="text-align:center; margin-bottom:28px;">
        <img
          src="${participantInfoSheet}"
          alt="Participant Information Sheet"
          style="max-width:100%; border-radius:12px; border:1px solid #ddd;"
        />
      </div>

      <div style="border:1px solid #ddd; border-radius:12px; padding:24px; background:#fff;">

        <p style="margin-bottom:20px; font-weight:600; text-align:left;">
          Please tick all boxes below to indicate your consent to participate.
        </p>

        <label style="display:block; margin-bottom:16px; text-align:left; cursor:pointer;">
          <input type="checkbox" class="consent-check" style="margin-right:10px;">
          I confirm that I have read and understand the Participant Information Sheet.
        </label>

        <label style="display:block; margin-bottom:16px; text-align:left; cursor:pointer;">
          <input type="checkbox" class="consent-check" style="margin-right:10px;">
          I have had the opportunity to ask questions and have had these answered satisfactorily.
        </label>

        <label style="display:block; margin-bottom:16px; text-align:left; cursor:pointer;">
          <input type="checkbox" class="consent-check" style="margin-right:10px;">
          I understand that my participation is voluntary and that I am free to withdraw at any time without giving a reason.
        </label>

        <label style="display:block; margin-bottom:16px; text-align:left; cursor:pointer;">
          <input type="checkbox" class="consent-check" style="margin-right:10px;">
          I agree that data gathered in this study may be stored anonymously and securely, and may be used for future research.
        </label>

        <label style="display:block; margin-bottom:16px; text-align:left; cursor:pointer;">
          <input type="checkbox" class="consent-check" style="margin-right:10px;">
          I agree that logged interaction data (e.g. mouse movement and eye tracking) may be included in an anonymised public dataset.
        </label>

        <label style="display:block; margin-bottom:16px; text-align:left; cursor:pointer;">
          <input type="checkbox" class="consent-check" style="margin-right:10px;">
          I confirm that I am 18 years of age or older.
        </label>

        <label style="display:block; margin-bottom:24px; text-align:left; cursor:pointer;">
          <input type="checkbox" class="consent-check" style="margin-right:10px;">
          I agree to take part in this study.
        </label>

        <div style="text-align:center;">
          <button
            id="begin-study-btn"
            disabled
            style="
              padding:14px 28px; font-size:16px; border:none; border-radius:10px;
              background:#111827; color:#fff; cursor:not-allowed; opacity:0.5;
              transition:opacity 0.2s ease, background 0.2s ease;
            "
          >
            Begin Study →
          </button>
        </div>

      </div>
    </div>
  `;

  // ── Consent gate ─────────────────────────────────────────────────────────
  const checkboxes = screen.querySelectorAll('.consent-check');
  const btn        = document.getElementById('begin-study-btn');

  function updateButton() {
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    btn.disabled          = !allChecked;
    btn.style.opacity     = allChecked ? '1' : '0.5';
    btn.style.cursor      = allChecked ? 'pointer' : 'not-allowed';
    btn.style.background  = allChecked ? '#111827' : '#111827';
  }

  checkboxes.forEach(cb => cb.addEventListener('change', updateButton));

  btn.addEventListener('mouseover', () => {
    if (!btn.disabled) btn.style.background = '#374151';
  });
  btn.addEventListener('mouseout', () => {
    btn.style.background = '#111827';
  });

  // ── Begin study ───────────────────────────────────────────────────────────
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;

    btn.disabled = true;
    btn.textContent = 'Starting...';

    sessionData.consentTimestamp = Date.now();
    sessionData.events.push({ type: 'consent-given', timestamp: Date.now() });

    try {
      await window.startWebEyeTrack();
      showScreen('screen-calibration');
    } catch (err) {
      console.error('Failed to start eye tracking:', err);
      btn.disabled    = false;
      btn.textContent = 'Begin Study →';
      alert('Failed to initialise eye tracking. Please refresh and try again.');
    }
  });

  updateButton();
}
