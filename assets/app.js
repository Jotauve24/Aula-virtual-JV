import { normalizeCode } from './model.js';
import { drawWorld } from './world.js';
import { configured } from './supabase-client.js';

const form = document.querySelector('#course-form');
const input = document.querySelector('#course-code');
const submit = document.querySelector('#enter-course');
const error = document.querySelector('#code-error');
const dialog = document.querySelector('#info-dialog');
const canvas = document.querySelector('#preview-map');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0, lastFrame = 0;

function setError(text) {
  error.textContent = text;
  error.hidden = !text;
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}
function drawPreview(time = 0) { drawWorld(canvas, { decorative: true, time }); }
function animate(time) {
  if (time - lastFrame > 45) { drawPreview(time); lastFrame = time; }
  frame = requestAnimationFrame(animate);
}
function updatePreview() {
  cancelAnimationFrame(frame);
  frame = 0;
  drawPreview();
  if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(animate);
}

submit.disabled = !input.value.trim();
input.addEventListener('input', () => {
  submit.disabled = !input.value.trim();
  setError('');
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const code = normalizeCode(input.value);
  input.value = code;
  if (!/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code)) {
    setError('Revisa el código de tu docente. Tiene el formato MAT-XXXXX-XXXXX-XXXXX.');
    input.focus();
    return;
  }
  if (!configured) {
    setError('El aula no está disponible en este momento. Inténtalo más tarde.');
    return;
  }
  sessionStorage.setItem('aula-course-code', code);
  submit.disabled = true;
  submit.textContent = 'Abriendo tu materia…';
  window.location.assign('./live.html');
});

document.querySelector('#code-help').addEventListener('click', () => {
  document.querySelector('#dialog-title').textContent = 'Un código para cada materia.';
  document.querySelector('#dialog-text').textContent = 'Tu docente comparte el mismo código con toda la clase. Escríbelo aquí para registrar tu perfil y entrar al aula. Usa este mismo navegador cuando vuelvas; tu correo es un dato de contacto, no una contraseña de acceso.';
  dialog.showModal();
});
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.querySelector('.dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
reducedMotion.addEventListener('change', updatePreview);
document.addEventListener('visibilitychange', updatePreview);
window.addEventListener('pagehide', () => cancelAnimationFrame(frame));
updatePreview();
