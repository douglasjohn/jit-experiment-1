import { showScreen } from './router';
import { screens } from './screens';

export function initRouter() {
  screens.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.style.display = i === 0 ? 'block' : 'none';
  });

  showScreen('screen-loading');
}