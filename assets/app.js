import './embed.js?v=0.8.1';
import { normalizeCode } from './model.js?v=0.8.1';
import { mountEntranceTutorial } from './entrance-tutorial.js?v=0.8.1';
import { configured } from './supabase-client.js?v=0.8.1';
import { avatarSVG } from './world.js?v=0.8.1';

// Decorative classmates use the same characters as the real classroom.
const entranceLooks = [
  { skin: 2, shirt: 0, hair: 'curly' },
  { skin: 0, shirt: 2, hair: 'long', presentation: 'mujer' },
  { skin: 3, shirt: 3, hair: 'short' }
];
document.querySelectorAll('[data-entry-avatar]').forEach(node => {
  node.innerHTML = avatarSVG(entranceLooks[Number(node.dataset.entryAvatar)] || entranceLooks[0]);
});

const form = document.querySelector('#course-form');
const input = document.querySelector('#course-code');
const submit = document.querySelector('#enter-course');
const error = document.querySelector('#code-error');
const dialog = document.querySelector('#info-dialog');

function setError(text) {
  error.textContent = text;
  error.hidden = !text;
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
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
  document.querySelector('#dialog-text').textContent = 'Tu docente comparte el mismo código con toda la clase. Escríbelo aquí para registrar tu perfil y entrar al aula. Si regresas desde este navegador, tu sesión se conserva. Para entrar desde otro dispositivo, usa «Recuperar tu cuenta» y verifica tu correo. No vuelvas a inscribirte si ya tienes perfil.';
  dialog.showModal();
});
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.querySelector('.dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
mountEntranceTutorial(document.querySelector('#entrance-tutorial'));

