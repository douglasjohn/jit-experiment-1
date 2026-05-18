export function showScreen(id) {
  const sections = document.querySelectorAll('section');

  if (!sections.length) {
    console.warn('No UI mounted yet');
    return;
  }

  sections.forEach(s => (s.style.display = 'none'));

  const el = document.getElementById(id);

  if (!el) {
    console.warn('Missing screen:', id);

    // 🔥 CRITICAL FALLBACK (prevents blank screen)
    sections[0].style.display = 'block';
    return;
  }

  el.style.display = 'block';
}