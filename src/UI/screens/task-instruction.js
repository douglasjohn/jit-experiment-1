import { addContinueButton } from './calibration';
export function renderTaskInstructionScreen() {
  const el = document.getElementById('screen-task-instruction');
  if (el) {
    el.innerHTML = `<div class=\"screen-container\"><h1>Task Instructions</h1><p>Instructions for the task will appear here.</p></div>`;
    addContinueButton('screen-task-instruction');
  }
}
