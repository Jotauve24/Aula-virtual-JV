import './embed.js?v=0.34.0';
import { configured, rpc, signedIn, studentRpc, studentSignedIn, contentBoardFiles, sessionUserId } from './supabase-client.js?v=0.34.0';
import { createContentBoard } from './content-board.js?v=0.34.0';
import { createContentBoardDemo } from './content-board-demo.js?v=0.34.0';
import { createLibrarySession, libraryRole } from './library-session.js?v=0.34.0';
import { BOARD_CATEGORIES, mergeBoardPosts } from './content-board-model.js?v=0.34.0';

const $ = selector => document.querySelector(selector), params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
const roleNames = { teacher: 'Docente', student: 'Estudiante', demo: 'Demostración' };
// Publication/file authorization uses these internal scopes; their names are never rendered.
const sampleCourses = [{ id: '00000000-0000-4000-8000-000000000001', name: 'Colección de prueba A' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Colección de prueba B' }];
const examples = new Map(), boards = new Map();
let activeBoard = null, activeRole = '', signature = '';
let category = Object.hasOwn(BOARD_CATEGORIES, params.get('categoria')) ? params.get('categoria') : '';
let mine = params.get('aportes') === '1';
const preferredScope = params.get('materia') || '';
const available = () => demo ? ['demo'] : [signedIn() ? 'teacher' : '', studentSignedIn() ? 'student' : ''].filter(Boolean);
const authorized = role => role === 'demo' ? demo : role === 'teacher' ? signedIn() : role === 'student' && studentSignedIn();
const identity = role => role === 'demo' ? 'demo' : sessionUserId(role);
const accountSignature = () => available().map(role => role + ':' + identity(role)).join(',');
const owns = id => catalog.snapshot().courses.some(row => row.id === id);
function example(id) {
  if (!sampleCourses.some(row => row.id === id)) throw new Error('Este espacio de prueba no está disponible.');
  if (!examples.has(id)) { const data = createContentBoardDemo(); data.setContext(id); examples.set(id, data); }
  return examples.get(id);
}
const demoFiles = {
  upload: (id, file, info) => example(id).files.upload(id, file, info),
  cancel: path => example(path.split('/')[0]).files.cancel(path),
  blob: file => example(file.path.split('/')[0]).files.blob(file)
};
async function sharedExample(args) {
  const pages = await Promise.all(sampleCourses.map(async course => {
    const page = await example(course.id).request('course_board', { ...args, p_course_id: course.id, p_topic_id: null, p_offset: 0, p_limit: 24 });
    return page.posts.map(post => ({ ...post, courseId: course.id, courseName: course.name }));
  }));
  const posts = mergeBoardPosts([], pages.flat());
  return { actor: { isTeacher: false, name: 'Demostración' }, settings: { instructions: '', postingOpen: false, revision: 0 },
    groups: [], posts: posts.slice(args.p_offset, args.p_offset + args.p_limit), total: posts.length,
    nextOffset: Math.min(args.p_offset + args.p_limit, posts.length), hasMore: args.p_offset + args.p_limit < posts.length };
}
function boardFor(role, shared) {
  const owner = identity(role), key = role + ':' + shared;
  if (!boards.has(key)) boards.set(key, createContentBoard({ host: $('#library-content'),
    demo: role === 'demo', showGroups: false, shared, signedIn: () => authorized(role) && owner === identity(role),
    rpc: role === 'demo' ? (name, args) => name === 'shared_library' ? sharedExample(args) : example(args.p_course_id).request(name, args) : role === 'teacher' ? rpc : studentRpc,
    files: role === 'demo' ? demoFiles : contentBoardFiles(role),
    onPublish: shared ? kind => void publish(kind) : null, canPublish: () => catalog.snapshot().courses.length > 0,
    onEdit: shared ? post => void edit(post) : null, canEdit: post => owns(post.courseId),
    onKindChange: shared ? kind => { category = kind; renderCategories(catalog.snapshot()); updateLocation(catalog.snapshot()); } : undefined
  }));
  return boards.get(key);
}
const catalog = createLibrarySession({ signedIn: authorized, identity, onChange: render, shared: true,
  request: role => role === 'demo' ? Promise.resolve(sampleCourses) : role === 'teacher' ? rpc('my_courses') : studentRpc('student_owned_courses') });
function clearBoard() { activeBoard?.reset(); activeBoard = null; activeRole = ''; $('#library-resources').hidden = true; }
function discardChanges() {
  return !activeBoard?.hasUnsaved() || confirm('Tienes cambios sin guardar en esta publicación o en las orientaciones. ¿Descartarlos y continuar?');
}
function selectCategory(value) {
  if (!discardChanges()) { $('#library-category').value = selectedCategory(catalog.snapshot()); return; }
  category = Object.hasOwn(BOARD_CATEGORIES, value) ? value : ''; mine = value === 'mine';
  if (catalog.snapshot().selected === 'all') render('selected', catalog.snapshot()); else catalog.select('all');
}
function ownBoard(post = null) {
  if (!discardChanges() || post && (!post.mine || !owns(post.courseId))) return null;
  const state = catalog.snapshot();
  const id = post?.courseId || (owns(state.selected) ? state.selected : owns(preferredScope) ? preferredScope : state.courses[0]?.id);
  if (!id) return null;
  if (state.selected !== id) catalog.select(id);
  return activeBoard;
}
async function publish(kind) { const board = ownBoard(); if (board) await board.compose({ kind: kind || category || 'note' }); }
async function edit(post) { const board = ownBoard(post); if (board) await board.compose({ post }); }
function selectedCategory(state) { return state.selected !== 'all' || mine ? 'mine' : category || 'all'; }
function renderCategories(state) {
  const selected = selectedCategory(state);
  $('#library-all').setAttribute('aria-current', selected === 'all' ? 'page' : 'false');
  $('#library-category-list').replaceChildren(...Object.entries(BOARD_CATEGORIES).map(([id, name]) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name;
    button.className = 'library-course-button'; if (id === selected) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => selectCategory(id)); return button;
  }));
  const mineButton = $('#library-my-posts'); mineButton.hidden = !state.courses.length;
  mineButton.setAttribute('aria-current', selected === 'mine' ? 'page' : 'false');
  const select = $('#library-category'); select.replaceChildren();
  for (const [value, label] of [['all', 'Toda la biblioteca'], ...Object.entries(BOARD_CATEGORIES), ...(state.courses.length ? [['mine', 'Mis publicaciones']] : [])]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  }
  select.value = selected;
  $('#library-current-category').textContent = state.selected !== 'all' ? 'Mi espacio de creación' : mine ? 'Mis publicaciones' : BOARD_CATEGORIES[category] || 'Contenido de toda la comunidad';
}
function updateLocation(state) {
  const url = new URL(location.href); url.search = '';
  if (demo) url.searchParams.set('demo', '1'); else url.searchParams.set('vista', state.role === 'teacher' ? 'docente' : 'estudiante');
  if (category) url.searchParams.set('categoria', category);
  if (mine) url.searchParams.set('aportes', '1');
  history.replaceState(null, '', url.pathname + url.search);
}
function render(kind, state) {
  if (['reset', 'loading', 'error'].includes(kind)) clearBoard();
  const ready = state.phase === 'ready';
  $('#library-workspace').hidden = !ready;
  $('#library-status').textContent = state.phase === 'loading' ? 'Abriendo la biblioteca…' : '';
  $('#library-error').hidden = state.phase !== 'error'; $('#library-error-text').textContent = state.error;
  if (!ready) return;
  renderCategories(state);
  const shared = state.selected === 'all', boardKey = state.role + ':' + shared;
  if (!shared && !owns(state.selected)) { clearBoard(); return; }
  if (activeRole !== boardKey) { clearBoard(); activeBoard = boardFor(state.role, shared); activeRole = boardKey; }
  $('#library-resources').hidden = false;
  activeBoard.setContext(shared ? 'all' : state.selected);
  activeBoard.open(shared ? { kind: category, scope: mine ? 'mine' : 'all' } : { scope: 'mine' });
  updateLocation(state);
  const back = $('#library-back'), ownId = owns(preferredScope) ? preferredScope : state.courses[0]?.id;
  back.hidden = demo; back.textContent = state.role === 'teacher' ? 'Volver al panel docente' : 'Volver a mi aula';
  back.href = demo ? './' : state.role === 'teacher' ? './docente.html' : ownId ? './live.html?resume_id=' + ownId : './';
}
function start() {
  const query = new URLSearchParams(location.search), roles = available(), nextSignature = accountSignature();
  if (signature && signature !== nextSignature) { category = ''; mine = false; }
  signature = nextSignature;
  const role = demo ? 'demo' : libraryRole(query.get('vista') === 'docente' ? 'teacher' : query.get('vista') === 'estudiante' ? 'student' : '', roles);
  const select = $('#library-role'); select.replaceChildren();
  for (const value of roles) { const option = document.createElement('option'); option.value = value; option.textContent = roleNames[value]; select.append(option); }
  select.value = role; $('#library-role-wrap').hidden = roles.length < 2;
  $('#library-role-label').textContent = roleNames[role] || '';
  $('#library-demo-notice').hidden = !demo; $('#library-gate').hidden = !!role;
  $('#library-reset-demo').hidden = !demo;
  if (!configured && !demo) { catalog.reset(); $('#library-status').textContent = 'La conexión del aula todavía no está configurada.'; return; }
  if (role) void catalog.load(role, 'all'); else catalog.reset();
}
$('#library-category').addEventListener('change', event => selectCategory(event.target.value));
$('#library-all').addEventListener('click', () => selectCategory('all'));
$('#library-my-posts').addEventListener('click', () => selectCategory('mine'));
$('#library-role').addEventListener('change', event => {
  if (!discardChanges()) { event.target.value = catalog.snapshot().role; return; }
  $('#library-role-label').textContent = roleNames[event.target.value];
  void catalog.load(event.target.value, 'all');
});
$('#library-retry').addEventListener('click', () => void catalog.load(catalog.snapshot().role, 'all'));
$('#library-reset-demo').addEventListener('click', () => {
  if (!discardChanges()) return;
  clearBoard(); examples.clear(); void catalog.load('demo', 'all');
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
