function aulaHost() {
  try { return window.frameElement?.hasAttribute('data-aula-content') ? window.parent : null; }
  catch { return null; }
}

// OAuth providers must open in the browser document, not inside the Aula frame.
export function openAuthPage(url) {
  try { window.top.location.href = url; }
  catch { window.open(url, '_blank', 'noopener'); }
}

const host = aulaHost();
const fullscreenDocument = host ? host.document : document;
const embedded = host ? window.frameElement.getAttribute('data-aula-embedded') === 'true' : window.self !== window.top;
if (embedded) document.documentElement.classList.add('is-embedded');
const button = document.querySelector('#expand-aula');
const expanded = () => !!(fullscreenDocument.fullscreenElement || fullscreenDocument.webkitFullscreenElement);

function syncFullscreen() {
  if (!button) return;
  const active = expanded();
  const label = active ? 'Reducir aula' : 'Ampliar aula';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(active));
  button.title = label;
  const icon = button.querySelector('svg[data-fullscreen-icon] path');
  if (icon) icon.setAttribute('d', active
    ? 'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5'
    : 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');
  if (!button.querySelector('svg')) button.textContent = label;
}

button?.addEventListener('click', async () => {
  try {
    if (expanded()) {
      const exit = fullscreenDocument.exitFullscreen || fullscreenDocument.webkitExitFullscreen;
      if (!exit) throw new Error('Fullscreen unavailable');
      await exit.call(fullscreenDocument);
    } else {
      const root = fullscreenDocument.documentElement;
      const enter = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!enter) throw new Error('Fullscreen unavailable');
      await enter.call(root);
    }
    syncFullscreen();
  } catch {
    window.open(location.href, '_blank', 'noopener');
  }
});

function connectFullscreen() {
  fullscreenDocument.addEventListener('fullscreenchange', syncFullscreen);
  fullscreenDocument.addEventListener('webkitfullscreenchange', syncFullscreen);
  syncFullscreen();
}
function disconnectFullscreen() {
  fullscreenDocument.removeEventListener('fullscreenchange', syncFullscreen);
  fullscreenDocument.removeEventListener('webkitfullscreenchange', syncFullscreen);
}
window.addEventListener('pagehide', disconnectFullscreen);
window.addEventListener('pageshow', connectFullscreen);
connectFullscreen();
