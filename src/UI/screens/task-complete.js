import { showScreen } from '../../experiment/router';

export function renderTaskCompleteScreen() {
  const el = document.getElementById('screen-task-complete');
  if (!el) return;

  el.innerHTML = `
    <div style="max-width:760px; margin:0 auto; padding:40px 24px; text-align:center;">
      <h1 style="margin-bottom:18px; font-size:32px; color:#111827;">Experimental Tasks Complete</h1>
      <p style="margin:0 auto 24px; max-width:620px; color:#4b5563; font-size:16px; line-height:1.7;">
        You have finished the main experiment. Just one short form remains before you can submit your study data.
      </p>
      <button
        id="task-complete-continue"
        type="button"
        style="padding:14px 34px; background:#4f46e5; color:#fff; border:none; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition:background 0.2s;"
        onmouseover="this.style.background='#4338ca'"
        onmouseout="this.style.background='#4f46e5'"
      >
        Continue to Final Form
      </button>
    </div>
  `;

  const btn = document.getElementById('task-complete-continue');
  if (btn) btn.onclick = () => showScreen('screen-nasatlx');
}
