import { addContinueButton } from './calibration';
export function renderTaskScreen() {
  const el = document.getElementById('screen-task');
  if (el) {
    el.innerHTML = `<div class=\"screen-container\"><h1>Task</h1><p>Task content will appear here.</p></div>`;
    addContinueButton('screen-task');
  }
}
