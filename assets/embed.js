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
  if (button) button.textContent = document.fullscreenElement ? 'Reducir' : 'Ampliar aula';
});
