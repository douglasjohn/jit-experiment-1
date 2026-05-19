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
          <h2 style="font-size:1rem;font-weight:700;color:#111827;margin-bottom:12px;text-align:left;">How old are you?</h2>
          <div style="display:grid;gap:10px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-age" value="18-24" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">18-24</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-age" value="25-34" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">25-34</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-age" value="35-44" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">35-44</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-age" value="45-54" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">45-54</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-age" value="55-64" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">55-64</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-age" value="65+" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">65+</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-age" value="Prefer not to say" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Prefer not to say</span>
            </label>
          </div>
        </section>

        <section>
          <h2 style="font-size:1rem;font-weight:700;color:#111827;margin-bottom:12px;text-align:left;">How do you describe yourself?</h2>
          <div style="display:grid;gap:10px;">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-gender" value="Female" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Female</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-gender" value="Male" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Male</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-gender" value="Non-binary" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Non-binary</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-gender" value="Prefer to self describe" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Prefer to self describe</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-gender" value="Prefer not to say" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Prefer not to say</span>
            </label>
          </div>
          <div id="demo-gender-self-wrap" style="margin-top:14px;display:none;">
            <label for="demo-gender-self" style="display:block;font-weight:600;color:#111827;margin-bottom:8px;">Please describe yourself</label>
            <input id="demo-gender-self" type="text" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;box-sizing:border-box;" placeholder="Self description" />
          </div>
        </section>

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
              <input type="radio" name="demo-education" value="Master’s Degree" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">Master’s Degree</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="radio" name="demo-education" value="PhD" style="width:16px;height:16px;" />
              <span style="color:#1f2937;font-size:15px;">PhD</span>
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
      </div>

      <div id="demo-error" style="display:none;margin-top:20px;padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#991b1b;font-size:15px;"></div>

      <div style="text-align:center;margin-top:28px;">
        <button id="demo-continue-btn" style="padding:14px 28px;border:none;border-radius:12px;background:#4f46e5;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">
          Continue to Camera Permission →
        </button>
      </div>
    </div>
  `;

  const genderRadios = Array.from(screen.querySelectorAll('input[name="demo-gender"]'));
  const genderSelfWrap = document.getElementById('demo-gender-self-wrap');
  const genderSelfInput = document.getElementById('demo-gender-self');
  const continueBtn = document.getElementById('demo-continue-btn');
  const errorEl = document.getElementById('demo-error');

  function setGenderSelfVisibility() {
    const selected = genderRadios.find(r => r.checked);
    if (selected?.value === 'Prefer to self describe') {
      genderSelfWrap.style.display = 'block';
    } else {
      genderSelfWrap.style.display = 'none';
    }
  }

  genderRadios.forEach(radio => radio.addEventListener('change', setGenderSelfVisibility));

  async function handleContinue() {
    const age = screen.querySelector('input[name="demo-age"]:checked')?.value;
    const gender = screen.querySelector('input[name="demo-gender"]:checked')?.value;
    const education = screen.querySelector('input[name="demo-education"]:checked')?.value;
    const english = screen.querySelector('input[name="demo-english"]:checked')?.value;
    const genderSelf = genderSelfInput?.value.trim() || null;

    if (!age || !gender || !education || !english) {
      errorEl.textContent = 'Please answer all questions before continuing.';
      errorEl.style.display = 'block';
      return;
    }

    if (gender === 'Prefer to self describe' && !genderSelf) {
      errorEl.textContent = 'Please describe yourself when selecting self describe.';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';

    sessionData.demographics = {
      age_group: age,
      gender: gender === 'Prefer to self describe' ? 'Prefer to self describe' : gender,
      gender_self_description: gender === 'Prefer to self describe' ? genderSelf : null,
      education_level: education,
      english_proficiency: english,
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
  setGenderSelfVisibility();
}
