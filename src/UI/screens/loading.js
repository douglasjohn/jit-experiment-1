export function renderLoadingScreen() {
  const el = document.getElementById('screen-loading');
  if (!el) return;

  el.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      min-height:100vh; padding:24px; text-align:center;
    ">
      <div style="
        width:48px; height:48px;
        border:4px solid #e5e7eb; border-top:4px solid #4f46e5;
        border-radius:50%; animation:loading-spin 0.8s linear infinite;
        margin-bottom:20px;
      "></div>
      <p style="color:#6b7280; font-size:16px; margin:0;">Loading experiment…</p>
      <style>
        @keyframes loading-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </div>
  `;
}
