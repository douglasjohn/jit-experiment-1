import { showScreen } from '../../experiment/router';
import { sessionData } from '../../experiment/session';

export function renderEnvCheckScreen() {
  const el = document.getElementById('screen-env-check');
  if (!el) return;

  // Run checks
  const checks = _runChecks();
  const allPassed = checks.every(c => c.status === 'pass');

  sessionData.environmentCheck = {
    timestamp: Date.now(),
    checks,
    allPassed,
    userAgent:   navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
  };

  const rows = checks.map(c => `
    <tr>
      <td style="padding:10px 16px; font-size:14px; color:#374151;">${c.label}</td>
      <td style="padding:10px 16px; font-size:13px; color:${c.status === 'pass' ? '#059669' : c.status === 'warn' ? '#d97706' : '#dc2626'}; font-weight:600;">
        ${c.status === 'pass' ? '✓ ' : c.status === 'warn' ? '⚠ ' : '✗ '}${c.value}
      </td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div style="max-width:640px; margin:0 auto; padding:48px 24px;">

      <h1 style="margin:0 0 8px; font-size:28px; color:#111827;">Environment Check</h1>
      <p style="margin:0 0 28px; color:#6b7280; font-size:15px; line-height:1.6;">
        Checking your browser and display settings before the study begins.
      </p>

      <div style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; margin-bottom:24px;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb; border-bottom:1px solid #e5e7eb;">
              <th style="padding:10px 16px; text-align:left; font-size:13px; color:#6b7280; font-weight:600;">Check</th>
              <th style="padding:10px 16px; text-align:left; font-size:13px; color:#6b7280; font-weight:600;">Result</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      ${!allPassed ? `
        <div style="margin-bottom:20px; padding:16px; background:#fef2f2; border-radius:8px; border:1px solid #fecaca;">
          <p style="margin:0; color:#991b1b; font-size:14px; line-height:1.6;">
            One or more checks did not pass. You may continue, but the study experience
            may be affected. If possible, please use a desktop or laptop with an up-to-date
            version of Chrome or Edge.
          </p>
        </div>
      ` : ''}

      <button
        id="env-check-continue"
        style="
          padding:14px 28px; font-size:16px; border:none; border-radius:10px;
          background:#4f46e5; color:#fff; cursor:pointer; font-weight:600;
          transition:background 0.2s;
        "
        onmouseover="this.style.background='#4338ca'"
        onmouseout="this.style.background='#4f46e5'"
      >
        Continue →
      </button>
    </div>
  `;

  document.getElementById('env-check-continue').onclick = () => {
    showScreen('screen-calibration');
  };
}

function _runChecks() {
  return [
    {
      label: 'Browser',
      ...(() => {
        const ua = navigator.userAgent;
        const isChrome  = /Chrome/.test(ua) && !/Edg/.test(ua);
        const isEdge    = /Edg/.test(ua);
        const isFirefox = /Firefox/.test(ua);
        if (isChrome || isEdge) return { status: 'pass', value: isEdge ? 'Edge (recommended)' : 'Chrome (recommended)' };
        if (isFirefox) return { status: 'warn', value: 'Firefox (Chrome/Edge preferred)' };
        return { status: 'warn', value: 'Unknown — Chrome or Edge recommended' };
      })(),
    },
    {
      label: 'Screen width',
      ...(() => {
        const w = window.screen.width;
        if (w >= 1280) return { status: 'pass', value: `${w} px` };
        if (w >= 1024) return { status: 'warn', value: `${w} px (1280+ preferred)` };
        return { status: 'fail', value: `${w} px (too small — use a larger screen)` };
      })(),
    },
    {
      label: 'Screen height',
      ...(() => {
        const h = window.screen.height;
        if (h >= 768) return { status: 'pass', value: `${h} px` };
        return { status: 'warn', value: `${h} px (768+ preferred)` };
      })(),
    },
    {
      label: 'Camera permission',
      ...(() => {
        if (!navigator.mediaDevices?.getUserMedia) {
          return { status: 'fail', value: 'Not supported in this browser' };
        }
        return { status: 'pass', value: 'API available (will prompt on calibration screen)' };
      })(),
    },
    {
      label: 'Cookies / localStorage',
      ...(() => {
        try {
          localStorage.setItem('_env_check', '1');
          localStorage.removeItem('_env_check');
          return { status: 'pass', value: 'Enabled' };
        } catch {
          return { status: 'warn', value: 'Disabled — participant IDs may not persist' };
        }
      })(),
    },
  ];
}
