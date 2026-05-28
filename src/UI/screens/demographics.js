import { showScreen } from '../../experiment/router';
import { sessionData } from '../../experiment/session';

export function renderDemographicsScreen() {
  const screen = document.getElementById('screen-demographics');
  if (!screen) {
    console.error('Missing #screen-demographics');
    return;
  }

  screen.innerHTML = `
    <div style="max-width:860px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:2rem;margin-bottom:18px;color:#111827;text-align:center;">
        Demographic information
      </h1>

      <p style="margin-bottom:24px;color:#334155;line-height:1.8;">
        Your responses help us understand the participant sample and improve our analysis. All answers are stored securely with the rest of your study data.
      </p>

      <div style="display:grid;gap:24px;">

        <section>
          <h2 style="font-size:1rem;font-weight:700;color:#111827;margin-bottom:12px;text-align:left;">What is the highest level of education you have completed or are currently pursuing?</h2>
          <div style="display:grid;gap:10px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-education" value="None" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">None</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-education" value="Primary Education" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Primary Education</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-education" value="Secondary Education (High School)" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Secondary Education (High School)</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-education" value="Undergraduate Degree" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Undergraduate Degree</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-education" value="Postgraduate Degree" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Postgraduate Degree</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-education" value="Prefer not to say" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Prefer not to say</span>
            </label>
          </div>
        </section>

        <section>
          <h2 style="font-size:1rem;font-weight:700;color:#111827;margin-bottom:12px;text-align:left;">How would you rate your English proficiency?</h2>
          <div style="display:grid;gap:10px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-english" value="Native" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Native</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-english" value="Advanced" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Advanced</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-english" value="Basic" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Basic</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-english" value="Prefer not to say" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Prefer not to say</span>
            </label>
          </div>
        </section>

        <section>
          <h2 style="font-size:1rem;font-weight:700;color:#111827;margin-bottom:12px;text-align:left;">I can usually complete tasks on websites without help.</h2>
          <div style="display:grid;gap:10px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:6px;">
              <span>Strongly disagree</span>
              <span>Strongly agree</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">
              ${[1,2,3,4,5,6,7].map(value => `
                <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;font-size:13px;">
                  <input type="radio" name="demo-unfamiliar-task" value="${value}" style="width:16px;height:16px;" />
                  <span style="margin-top:6px;color:#1f2937;">${value}</span>
                </label>`).join('')}
            </div>
          </div>
        </section>

        <section>
          <h2 style="font-size:1rem;font-weight:700;color:#111827;margin-bottom:12px;text-align:left;">When a website is confusing or poorly designed, I can usually figure out how to proceed.</h2>
          <div style="display:grid;gap:10px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:6px;">
              <span>Strongly disagree</span>
              <span>Strongly agree</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">
              ${[1,2,3,4,5,6,7].map(value => `
                <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;font-size:13px;">
                  <input type="radio" name="demo-website-figure-out" value="${value}" style="width:16px;height:16px;" />
                  <span style="margin-top:6px;color:#1f2937;">${value}</span>
                </label>`).join('')}
            </div>
          </div>
        </section>

        <section>
          <h2 style="font-size:1rem;font-weight:700;color:#111827;margin-bottom:12px;text-align:left;">I am confident troubleshooting problems I encounter while using websites.</h2>
          <div style="display:grid;gap:10px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;margin-bottom:6px;">
              <span>Strongly disagree</span>
              <span>Strongly agree</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">
              ${[1,2,3,4,5,6,7].map(value => `
                <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;font-size:13px;">
                  <input type="radio" name="demo-troubleshooting" value="${value}" style="width:16px;height:16px;" />
                  <span style="margin-top:6px;color:#1f2937;">${value}</span>
                </label>`).join('')}
            </div>
          </div>
        </section>
      </div>

      <div id="demo-error" style="display:none;margin-top:20px;padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#991b1b;font-size:15px;"></div>

      <div style="text-align:center;margin-top:28px;">
        <button id="demo-continue-btn" style="padding:14px 28px;border:none;border-radius:12px;background:#4f46e5;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">
          Continue to Camera Permission →
        </button>
      </div>
    </div>
  `;

  // const genderRadios = Array.from(screen.querySelectorAll('input[name="demo-gender"]'));
  // const genderSelfWrap = document.getElementById('demo-gender-self-wrap');
  // const genderSelfInput = document.getElementById('demo-gender-self');
  const continueBtn = document.getElementById('demo-continue-btn');
  const errorEl = document.getElementById('demo-error');

  // function setGenderSelfVisibility() {
  //   const selected = genderRadios.find(r => r.checked);
  //   if (selected?.value === 'Prefer to self describe') {
  //     genderSelfWrap.style.display = 'block';
  //   } else {
  //     genderSelfWrap.style.display = 'none';
  //   }
  // }

  // genderRadios.forEach(radio => radio.addEventListener('change', setGenderSelfVisibility));

  async function handleContinue() {
    // const age = screen.querySelector('input[name="demo-age"]:checked')?.value;
    // const gender = screen.querySelector('input[name="demo-gender"]:checked')?.value;
    const education = screen.querySelector('input[name="demo-education"]:checked')?.value;
    const english = screen.querySelector('input[name="demo-english"]:checked')?.value;
    const unfamiliarTask = screen.querySelector('input[name="demo-unfamiliar-task"]:checked')?.value;
    const websiteFigureOut = screen.querySelector('input[name="demo-website-figure-out"]:checked')?.value;
    const troubleshooting = screen.querySelector('input[name="demo-troubleshooting"]:checked')?.value;
    // const genderSelf = genderSelfInput?.value.trim() || null;

    if (!education || !english || !unfamiliarTask || !websiteFigureOut || !troubleshooting) {
      errorEl.textContent = 'Please answer all questions before continuing.';
      errorEl.style.display = 'block';
      return;
    }

    // if (gender === 'Prefer to self describe' && !genderSelf) {
    //   errorEl.textContent = 'Please describe yourself when selecting self describe.';
    //   errorEl.style.display = 'block';
    //   return;
    // }

    errorEl.style.display = 'none';

    sessionData.demographics = {
      // age_group: age,
      // gender: gender === 'Prefer to self describe' ? 'Prefer to self describe' : gender,
      // gender_self_description: gender === 'Prefer to self describe' ? genderSelf : null,
      education_level: education,
      english_proficiency: english,
      website_unfamiliar_task_confidence: Number(unfamiliarTask),
      website_confusion_recovery_confidence: Number(websiteFigureOut),
      website_troubleshooting_confidence: Number(troubleshooting),
    };

    sessionData.events.push({
      type: 'demographics-submitted',
      timestamp: Date.now(),
      demographics: sessionData.demographics,
    });

    if (typeof window.startWebEyeTrack === 'function') {
      continueBtn.disabled = true;
      continueBtn.textContent = 'Continuing...';
      await window.startWebEyeTrack();
    } else {
      showScreen('screen-calibration');
    }
  }

  continueBtn.addEventListener('click', handleContinue);
  // setGenderSelfVisibility();
}
