import { addContinueButton } from './calibration';
export function renderProbeScreen() {
  const el = document.getElementById('screen-probe');
  if (el) {
    el.innerHTML = `<div class=\"screen-container\"><h1>Probe</h1><p>Probe content will appear here.</p></div>`;
    addContinueButton('screen-probe');
  }
}
