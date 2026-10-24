if (window.self !== window.top) document.documentElement.classList.add('is-embedded');
document.querySelector('#expand-aula')?.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    window.open(location.href, '_blank', 'noopener');
  }
});
document.addEventListener('fullscreenchange', () => {
  const button = document.querySelector('#expand-aula');
  if (button) {
    const label = document.fullscreenElement ? 'Reducir aula' : 'Ampliar aula';
    button.setAttribute('aria-label', label);
    button.title = label;
    if (!button.classList.contains('entry-expand')) button.textContent = label;
  }
});
