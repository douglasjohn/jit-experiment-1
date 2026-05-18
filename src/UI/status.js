export function setStatus(text) {
  const el = document.getElementById('status-text');

  if (el) {
    el.textContent = text;
  }
}