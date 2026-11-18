import './embed.js?v=0.32.0';
import { configured, rpc, signedIn, studentRpc, studentSignedIn, contentBoardFiles, sessionUserId } from './supabase-client.js?v=0.32.0';
import { createContentBoard } from './content-board.js?v=0.32.0';
import { createContentBoardDemo } from './content-board-demo.js?v=0.32.0';
import { createLibrarySession, libraryRole } from './library-session.js?v=0.32.0';

const $ = selector => document.querySelector(selector), params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
const roleNames = { teacher: 'Docente', student: 'Estudiante', demo: 'Demostración' };
const sampleCourses = [{ id: '00000000-0000-4000-8000-000000000001', name: 'Informática II · Ejemplo' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Sistemas II · Ejemplo' }];
const examples = new Map(), boards = new Map();
let activeBoard = null, activeRole = '', filter = '', signature = '';
const available = () => demo ? ['demo'] : [signedIn() ? 'teacher' : '', studentSignedIn() ? 'student' : ''].filter(Boolean);
const authorized = role => role === 'demo' ? demo : role === 'teacher' ? signedIn() : role === 'student' && studentSignedIn();
const identity = role => role === 'demo' ? 'demo' : sessionUserId(role);
const accountSignature = () => available().map(role => role + ':' + identity(role)).join(',');
function example(id) {
  if (!sampleCourses.some(row => row.id === id)) throw new Error('Esta materia de ejemplo no está disponible.');
  if (!examples.has(id)) { const data = createContentBoardDemo(); data.setContext(id); examples.set(id, data); }
  return examples.get(id);
}
const demoFiles = {
  upload: (id, file, info) => example(id).files.upload(id, file, info),
  cancel: path => example(path.split('/')[0]).files.cancel(path),
  blob: file => example(file.path.split('/')[0]).files.blob(file)
};
function boardFor(role) {
  const owner = identity(role);
  if (!boards.has(role)) boards.set(role, createContentBoard({ host: $('#library-content'),
    demo: role === 'demo', signedIn: () => authorized(role) && owner === identity(role),
    rpc: role === 'demo' ? (name, args) => example(args.p_course_id).request(name, args) : role === 'teacher' ? rpc : studentRpc,
    files: role === 'demo' ? demoFiles : contentBoardFiles(role)
  }));
  return boards.get(role);
}
const catalog = createLibrarySession({ signedIn: authorized, identity, onChange: render,
  request: role => role === 'demo' ? Promise.resolve(sampleCourses) : role === 'teacher' ? rpc('my_courses') : studentRpc('student_owned_courses') });
function clearBoard() { activeBoard?.reset(); activeBoard = null; activeRole = ''; $('#library-resources').hidden = true; }
function discardChanges() {
  return !activeBoard?.hasUnsaved() || confirm('Tienes cambios sin guardar en esta publicación o en las indicaciones. ¿Descartarlos y continuar?');
}
function selectCourse(id) {
  if (id === catalog.snapshot().selected) return;
  if (!discardChanges()) { $('#library-course').value = catalog.snapshot().selected; return; }
  catalog.select(id);
}
function renderCourses(state) {
  const rows = state.courses.filter(row => row.name.toLocaleLowerCase('es').includes(filter));
  $('#library-course-list').replaceChildren(...rows.map(row => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = row.name;
    button.className = 'library-course-button'; if (row.id === state.selected) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => selectCourse(row.id)); return button;
  }));
  $('#library-filter-empty').hidden = rows.length !== 0 || !state.courses.length;
  $('#library-filter-wrap').hidden = state.courses.length < 6;
}
function render(kind, state) {
  if (['reset', 'loading', 'error'].includes(kind)) clearBoard();
  const ready = state.phase === 'ready';
  $('#library-workspace').hidden = !ready || !state.courses.length;
  $('#library-status').textContent = state.phase === 'loading' ? 'Cargando tus materias…' : '';
  $('#library-error').hidden = state.phase !== 'error'; $('#library-error-text').textContent = state.error;
  $('#library-empty').hidden = !ready || state.courses.length !== 0;
  if (!ready) return;
  const select = $('#library-course'); select.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.disabled = true; placeholder.textContent = 'Selecciona una materia'; select.append(placeholder);
  for (const row of state.courses) { const option = document.createElement('option'); option.value = row.id; option.textContent = row.name; select.append(option); }
  select.value = state.selected; renderCourses(state);
  $('#library-selection-hint').hidden = !!state.selected;
  $('#library-selection-hint').textContent = state.unavailable
    ? 'La materia de ese enlace no está disponible para esta cuenta. Elige una de tus materias.' : 'Elige una materia para explorar sus recursos.';
  const course = state.courses.find(row => row.id === state.selected);
  if (!course) { clearBoard(); return; }
  if (activeRole !== state.role) { clearBoard(); activeBoard = boardFor(state.role); activeRole = state.role; }
  $('#library-current-course').textContent = course.name; $('#library-resources').hidden = false;
  activeBoard.setContext(course.id); activeBoard.open();
  const url = new URL(location.href); url.search = '';
  if (demo) url.searchParams.set('demo', '1'); else url.searchParams.set('vista', state.role === 'teacher' ? 'docente' : 'estudiante');
  url.searchParams.set('materia', course.id); history.replaceState(null, '', url.pathname + url.search);
  const back = $('#library-back'); back.hidden = demo; back.textContent = state.role === 'teacher' ? 'Volver a mi materia' : 'Volver a mi aula';
  back.href = demo ? './' : state.role === 'teacher' ? './docente.html?materia=' + course.id : './live.html?resume_id=' + course.id;
}
function start() {
  const query = new URLSearchParams(location.search);
  const roles = available(), nextSignature = accountSignature();
  if (signature && signature !== nextSignature) { filter = ''; $('#library-filter').value = ''; }
  signature = nextSignature;
  const role = demo ? 'demo' : libraryRole(query.get('vista') === 'docente' ? 'teacher' : query.get('vista') === 'estudiante' ? 'student' : '', roles);
  const select = $('#library-role'); select.replaceChildren();
  for (const value of roles) { const option = document.createElement('option'); option.value = value; option.textContent = roleNames[value]; select.append(option); }
  select.value = role; $('#library-role-wrap').hidden = roles.length < 2;
  $('#library-role-label').textContent = roleNames[role] || '';
  $('#library-demo-notice').hidden = !demo; $('#library-gate').hidden = !!role;
  $('#library-reset-demo').hidden = !demo;
  if (!configured && !demo) { catalog.reset(); $('#library-status').textContent = 'La conexión del aula todavía no está configurada.'; return; }
  if (role) void catalog.load(role, query.get('materia') || ''); else catalog.reset();
}
$('#library-course').addEventListener('change', event => selectCourse(event.target.value));
$('#library-filter').addEventListener('input', event => { filter = event.target.value.trim().toLocaleLowerCase('es'); renderCourses(catalog.snapshot()); });
$('#library-role').addEventListener('change', event => {
  if (!discardChanges()) { event.target.value = catalog.snapshot().role; return; }
  filter = ''; $('#library-filter').value = ''; $('#library-role-label').textContent = roleNames[event.target.value];
  void catalog.load(event.target.value);
});
$('#library-retry').addEventListener('click', () => void catalog.load(catalog.snapshot().role, new URLSearchParams(location.search).get('materia') || ''));
$('#library-reset-demo').addEventListener('click', () => {
  if (!discardChanges()) return;
  const selected = catalog.snapshot().selected; clearBoard(); examples.clear(); void catalog.load('demo', selected);
});
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href]');
  if (!link || !activeBoard?.hasUnsaved() || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href').startsWith('#')) return;
  if (!discardChanges()) event.preventDefault(); else clearBoard();
});
function checkAccount() {
  if (!demo && signature !== accountSignature()) { catalog.reset(); for (const board of boards.values()) board.reset(); boards.clear(); start(); }
}
window.addEventListener('focus', checkAccount);
window.addEventListener('pageshow', () => { if (catalog.snapshot().phase === 'idle') start(); });
window.addEventListener('storage', event => { if (event.key === null || ['aula-supabase-session', 'aula-student-session'].includes(event.key)) checkAccount(); });
window.addEventListener('pagehide', () => { catalog.reset(); for (const board of boards.values()) board.reset(); boards.clear(); examples.clear(); });
start();
