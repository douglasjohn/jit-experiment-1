import { captureProlificParams } from './session';
import { initRouter } from './router-init';
import { showScreen } from './router';

export function initExperiment() {
  captureProlificParams();
  initRouter();

  // 🔥 FORCE SAFE START SCREEN
  showScreen('screen-calibration');
}
