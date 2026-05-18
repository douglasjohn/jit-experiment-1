export function updateDebugPanel({
  gazeX,
  gazeY,
  gazeState
}) {
  const coords = document.getElementById('gaze-coords');
  const state = document.getElementById('gaze-state');

  coords.textContent = `${gazeX.toFixed(3)}, ${gazeY.toFixed(3)}`;
  state.textContent = gazeState;
}

export function incrementFixationCount() {
  const el = document.getElementById('fixation-count');

  el.textContent = parseInt(el.textContent) + 1;
}