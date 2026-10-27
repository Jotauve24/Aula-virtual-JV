import './embed.js?v=0.16.0';
import { normalizeCode } from './model.js?v=0.16.0';
import { mountEntranceTutorial } from './entrance-tutorial.js?v=0.16.0';
import { configured } from './supabase-client.js?v=0.16.0';
import { avatarSVG } from './world.js?v=0.16.0';

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
  document.querySelector('#dialog-title').textContent = '¿Dónde está el código?';
  document.querySelector('#dialog-text').textContent = 'Pídeselo a tu docente: es el mismo para toda la clase. Cópialo completo, incluidos los guiones. Si ya tienes un perfil, usa «Recupera tu cuenta» para conservar tu avatar y equipo.';
  dialog.showModal();
});
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.querySelector('.dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
mountEntranceTutorial(document.querySelector('#entrance-tutorial'));

