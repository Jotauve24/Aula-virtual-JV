import './video-guide.js?v=0.27.8';
import './embed.js?v=0.27.8';
import { normalizeCode } from './model.js?v=0.27.8';
import { mountEntranceTutorial } from './entrance-tutorial.js?v=0.27.8';
import { configured } from './supabase-client.js?v=0.27.8';
import { avatarSVG } from './world.js?v=0.27.8';
import { createRecentCourses } from './recent-courses.js?v=0.27.8';

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
const recentCourses = createRecentCourses();
const recentToggle = document.querySelector('#recent-code-toggle');
const recentPanel = document.querySelector('#recent-code-panel');
const recentList = document.querySelector('#recent-code-list');
const codeHint = document.querySelector('#code-hint');
const defaultHint = codeHint.textContent;

function setError(text) {
  error.textContent = text;
  error.hidden = !text;
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function hideRecentCodes() {
  recentPanel.hidden = true;
  recentToggle.setAttribute('aria-expanded', 'false');
}
function renderRecentCodes() {
  const rows = recentCourses.list();
  recentToggle.hidden = !rows.length;
  recentList.replaceChildren(...rows.map((row, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'recent-code-option';
    const name = document.createElement('strong'); name.textContent = row.name || (index === 0 ? 'Última materia' : 'Materia reciente');
    const code = document.createElement('span'); code.textContent = row.code; code.translate = false;
    button.append(name, code);
    button.addEventListener('click', () => {
      input.value = row.code; submit.disabled = false; setError('');
      codeHint.textContent = 'Código listo. Pulsa «Entrar a mi materia».';
      submit.focus({preventScroll: true}); hideRecentCodes();
    });
    return button;
  }));
  if (!rows.length) hideRecentCodes();
  return rows;
}
function showRecentCodes() {
  if (!renderRecentCodes().length) return;
  recentPanel.hidden = false;
  recentToggle.setAttribute('aria-expanded', 'true');
}
const recent = renderRecentCodes()[0];
if (!input.value.trim() && recent) {
  input.value = recent.code;
  codeHint.textContent = 'Último código usado. Puedes entrar o elegir otro reciente.';
}
submit.disabled = !input.value.trim();
input.addEventListener('input', () => {
  submit.disabled = !input.value.trim();
  codeHint.textContent = defaultHint;
  setError('');
});
input.addEventListener('focus', showRecentCodes);
input.addEventListener('click', showRecentCodes);
recentToggle.addEventListener('click', () => { if (recentPanel.hidden) showRecentCodes(); else hideRecentCodes(); });
form.addEventListener('focusout', event => { if (event.relatedTarget && !form.contains(event.relatedTarget)) hideRecentCodes(); });
document.addEventListener('pointerdown', event => { if (!form.contains(event.target)) hideRecentCodes(); });
form.addEventListener('keydown', event => {
  if (recentPanel.hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); input.focus({preventScroll: true}); hideRecentCodes(); }
  else if (event.key === 'ArrowDown' && event.target === input) { event.preventDefault(); recentList.querySelector('button')?.focus(); }
});
document.querySelector('#forget-recent-codes').addEventListener('click', () => {
  if (recentCourses.list().some(row => row.code === normalizeCode(input.value))) input.value = '';
  recentCourses.clear(); renderRecentCodes();
  submit.disabled = !input.value.trim(); codeHint.textContent = defaultHint; setError('');
  input.focus({preventScroll: true});
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
  recentCourses.remember(code);
  hideRecentCodes();
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

