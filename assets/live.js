import { configured, signInStudentAnonymously, studentRpc, studentSignedIn, studentSignOut } from './supabase-client.js';
import { SKINS, SHIRTS } from './model.js';
import { avatarSVG, drawWorld, findPath, isWalkable } from './world.js';

const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let courseId = '', profile = null, topics = [], selectedTopic = null;
let look = { skin: 1, shirt: 0, hair: 'short' };
let player = { x: 400, y: 300, direction: 'down' }, path = [], animation = 0, onArrival = null;
function stopAnimation() { cancelAnimationFrame(animation); animation = 0; }
function show(stage) {
  stopAnimation();
  const onboarding = stage !== 'room';
  $('#in-room-dialog').hidden = !onboarding;
  $('#topic-dialog').hidden = true;
  $('#registration').hidden = stage !== 'registration';
  $('#avatar').hidden = stage !== 'avatar';
  $('#teacher').hidden = !onboarding;
  $('#edit-avatar').hidden = !profile;
  $('#logout').hidden = !studentSignedIn();
  $('#room').dataset.stage = stage;
  $('#registration h2').id = stage === 'registration' ? 'dialog-title' : 'registration-title';
  $('#avatar h2').id = stage === 'avatar' ? 'dialog-title' : 'avatar-title';
  document.title = 'Mi aula · Aula Encuentro';
  draw();
}
function message(value) { $('#error').textContent = value; $('#error').hidden = !value; }
async function run(task) { message(''); try { await task(); } catch (error) { message(error.message); } }
function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function status(value) { $('#room-status').textContent = value; }
$('#teacher-image').innerHTML = avatarSVG({ skin: 1, shirt: 1, hair: 'curly' });
$('#dialog-teacher-image').innerHTML = avatarSVG({ skin: 1, shirt: 1, hair: 'curly' });
const savedCode = sessionStorage.getItem('aula-course-code');
if (savedCode) {
  $('#registration-form').elements.code.value = savedCode;
  sessionStorage.removeItem('aula-course-code');
}
show('registration');
if (!configured) { $('#room').hidden = true; $('#setup').hidden = false; }
else {
  const priorCode = localStorage.getItem('aula-student-course-code');
  if (studentSignedIn() && priorCode) {
    $('#registration-form').elements.code.value = priorCode;
    run(() => enterCourse(priorCode));
  }
}
async function enterCourse(code, details = {}) {
  const result = await studentRpc('enroll_student', { p_code: code, ...details });
  courseId = result.course_id;
  localStorage.setItem('aula-student-course-code', code);
  profile = await studentRpc('my_profile', { p_course_id: courseId });
  $('#avatar-course').textContent = result.course_name;
  $('#course-title').textContent = result.course_name;
  $('#avatar-name').textContent = profile.firstName + ' ' + profile.lastName;
  look = { skin: profile.avatar?.skin ?? 1, shirt: profile.avatar?.shirt ?? 0, hair: profile.avatar?.hair ?? 'short' };
  renderAvatarOptions();
  if (Object.keys(profile.avatar || {}).length) await enterRoom();
  else show('avatar');
}
$('#registration-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const f = event.target.elements;
  const code = f.code.value.trim().toUpperCase();
  const phone = f.phone.value.trim();
  if (!/^\+?[0-9 -]{7,20}$/.test(phone) || (phone.match(/\d/g) || []).length < 7)
    throw new Error('Revisa el número de teléfono.');
  await signInStudentAnonymously();
  await enterCourse(code, { p_email: f.email.value.trim().toLowerCase(),
    p_first_name: f.firstName.value.trim(), p_last_name: f.lastName.value.trim(), p_phone: phone });
}); });

function renderAvatarOptions() {
  const choices = [
    ['skin-options', 'skin', SKINS.slice(0, 3), ['Claro', 'Medio', 'Oscuro']],
    ['shirt-options', 'shirt', SHIRTS.slice(0, 3), ['Verde', 'Azul', 'Naranja']]
  ];
  for (const [id, key, colors, labels] of choices) {
    const buttons = colors.map((color, index) => {
      const button = element('button', '', 'swatch');
      button.type = 'button'; button.style.background = color;
      button.setAttribute('aria-label', labels[index]);
      button.setAttribute('aria-pressed', String(look[key] === index));
      button.addEventListener('click', () => { look[key] = index; renderAvatarOptions(); });
      return button;
    });
    $('#' + id).replaceChildren(...buttons);
  }
  const hairs = [['short', 'Corto'], ['long', 'Largo'], ['curly', 'Rizado']];
  $('#hair-options').replaceChildren(...hairs.map(([value, label]) => {
    const button = element('button', label, 'hair-option'); button.type = 'button';
    button.setAttribute('aria-pressed', String(look.hair === value));
    button.addEventListener('click', () => { look.hair = value; renderAvatarOptions(); });
    return button;
  }));
  $('#avatar-image').innerHTML = avatarSVG(look);
}
$('#avatar-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  await studentRpc('save_student_avatar', { p_course_id: courseId, p_avatar: look });
  profile = await studentRpc('my_profile', { p_course_id: courseId });
  await enterRoom();
}); });
$('#edit-avatar').addEventListener('click', () => { show('avatar'); renderAvatarOptions(); });

async function enterRoom() {
  topics = await studentRpc('course_room', { p_course_id: courseId });
  show('room'); renderTopics(); draw();
  status('Explora los temas y elige tu equipo.');
}
const locationsForTopics = [[220, 240], [590, 240], [590, 480]];
function renderTopics() {
  const mine = topics.find(t => t.id === profile.topicId);
  $('#group-badge').textContent = mine ? 'Tu equipo: ' + mine.name : 'Tu equipo: sin asignar';
  const locations = [[217, 122, 220, 240], [587, 122, 590, 240], [587, 352, 590, 480]];
  $('#topic-buttons').replaceChildren(...topics.slice(0, 3).map((topic, i) => {
    const button = element('button', '', 'map-action' + (topic.id === profile.topicId ? ' is-mine' : ''));
    button.type = 'button'; button.dataset.topic = topic.id;
    button.style.left = locations[i][0] / 8 + '%'; button.style.top = locations[i][1] / 5.6 + '%';
    button.append(element('strong', topic.name), element('small', topic.members.length + ' de ' + topic.capacity + ' lugares'));
    button.addEventListener('click', () => walkTo({ x: locations[i][2], y: locations[i][3] }, () => topicPanel(topic)));
    return button;
  }));
  if (selectedTopic) {
    selectedTopic = topics.find(t => t.id === selectedTopic.id) || null;
    if (selectedTopic) topicPanel(selectedTopic);
    else homePanel();
  } else homePanel();
}
function side(...nodes) { $('#side-content').replaceChildren(...nodes); }
function homePanel() {
  selectedTopic = null;
  $('#topic-dialog').hidden = true;
  const greeting = element('span', 'HOLA, ' + profile.firstName.split(' ')[0].toLocaleUpperCase('es'), 'eyebrow');
  const title = element('h2', 'Encuentra tu lugar.');
  const intro = element('p', 'Explora los temas de tu materia. Abre un espacio para ver integrantes y elegir equipo.');
  const list = element('div', '', 'topic-list');
  if (!topics.length) list.append(element('p', 'El docente todavía no ha añadido temas.'));
  for (const topic of topics) {
    const button = element('button', topic.name); button.type = 'button';
    button.append(element('span', topic.members.length + '/' + topic.capacity + ' lugares'));
    button.addEventListener('click', () => { const i = topics.indexOf(topic); if (i < 3) walkTo({ x: locationsForTopics[i][0], y: locationsForTopics[i][1] }, () => topicPanel(topic)); else topicPanel(topic); }); list.append(button);
  }
  side(greeting, title, intro, list, element('p', 'Caminar por otro espacio no cambia tu equipo.', 'field-hint'));
}
function topicPanel(topic, confirmJoin = false) {
  selectedTopic = topic;
  const mine = profile.topicId === topic.id;
  const full = topic.members.length >= topic.capacity;
  const count = element('span', topic.members.length + ' de ' + topic.capacity + ' integrantes' + (mine ? ' · Tu equipo' : ''), 'side-tag');
  const members = element('ul', '', 'member-list');
  for (const member of topic.members) members.append(element('li', member.name));
  for (let i = topic.members.length; i < topic.capacity; i++) members.append(element('li', 'Lugar disponible', 'free'));
  const nodes = [element('span', 'TEMA DE TU MATERIA', 'eyebrow'), element('h2', topic.name),
    element('p', topic.instructions || 'Sin indicaciones todavía.'), count, members];
  if (mine) nodes.push(element('p', 'Ya formas parte de este equipo. Tu lugar está guardado.'));
  else if (full) nodes.push(element('p', 'Este equipo está completo.'));
  else if (profile.topicId) nodes.push(element('p', 'Ya elegiste un equipo. Pide al docente cambiarlo si lo necesitas.'));
  else if (!profile.registrationOpen) nodes.push(element('p', 'La elección de equipos está cerrada.'));
  else {
    if (confirmJoin) nodes.push(element('p', '¿Confirmas que quieres unirte? Esta elección queda guardada.'));
    const button = element('button', confirmJoin ? 'Sí, unirme al equipo' : 'Quiero este equipo', 'button primary');
    button.type = 'button';
    button.addEventListener('click', () => {
      if (!confirmJoin) { topicPanel(topic, true); return; }
      run(async () => {
        await studentRpc('choose_topic', { p_course_id: courseId, p_topic_id: topic.id });
        profile = await studentRpc('my_profile', { p_course_id: courseId });
        topics = await studentRpc('course_room', { p_course_id: courseId });
        renderTopics(); status('Te uniste al equipo de ' + topic.name + '.');
      });
    });
    nodes.push(button);
  }
  const back = element('button', 'Ver todos los temas', 'button secondary');
  back.type = 'button'; back.addEventListener('click', homePanel); nodes.push(back);
  const dialog = $('#topic-dialog');
  dialog.replaceChildren(...nodes); dialog.hidden = false;
  dialog.scrollTop = 0;
  status('Estás viendo el tema ' + topic.name + '.');
}
function draw(time = 0) {
  const canvas = $('#world');
  if (!$('#room').hidden) drawWorld(canvas, { labels: false, actors: false,
    player: profile ? { ...player, ...look } : undefined, walking: path.length > 0, time });
}
function walkTo(target, arrived = null) {
  if ($('#room').dataset.stage !== 'room') return;
  onArrival = arrived;
  path = findPath(player, target);
  if (!path.length) {
    if (Math.hypot(player.x-target.x, player.y-target.y) < 30 && arrived) arrived();
    else status('Elige un lugar libre del suelo para caminar.');
    return;
  }
  if (reducedMotion.matches) { player = { ...player, ...path.at(-1) }; path = []; draw(); if (onArrival) { const done = onArrival; onArrival = null; done(); } return; }
  stopAnimation(); let previous = 0;
  function walk(time) {
    if ($('#room').hidden || !path.length) { draw(time); return; }
    const dt = previous ? Math.min((time - previous) / 1000, .05) : .016; previous = time;
    const next = path[0], dx = next.x - player.x, dy = next.y - player.y;
    const distance = Math.hypot(dx, dy), speed = 135 * dt;
    player.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (distance <= speed) { player.x = next.x; player.y = next.y; path.shift(); }
    else { player.x += dx / distance * speed; player.y += dy / distance * speed; }
    draw(time);
    if (path.length) animation = requestAnimationFrame(walk);
    else if (onArrival) { const done = onArrival; onArrival = null; done(); }
    else { const i = locationsForTopics.findIndex(([x,y]) => Math.hypot(player.x-x, player.y-y) < 65);
      if (i >= 0 && topics[i]) status('Llegaste a ' + topics[i].name + '. Pulsa E o toca su letrero para ver el tema.'); }
  }
  animation = requestAnimationFrame(walk);
}
$('#world').addEventListener('click', event => {
  const bounds = event.currentTarget.getBoundingClientRect();
  walkTo({ x: (event.clientX - bounds.left) / bounds.width * 800,
    y: (event.clientY - bounds.top) / bounds.height * 560 });
});
function moveDirection(direction) {
  if ($('#room').dataset.stage !== 'room') return;
  const delta = { up: [0,-20], down: [0,20], left: [-20,0], right: [20,0] }[direction];
  const target = { x: Math.round(player.x / 20) * 20 + delta[0],
    y: Math.round(player.y / 20) * 20 + delta[1] };
  if (isWalkable(target.x, target.y)) { player.direction = direction; walkTo(target); }
  else status('Hay mobiliario en ese lugar. Rodea la mesa por el pasillo.');
}
document.querySelectorAll('[data-direction]').forEach(button =>
  button.addEventListener('click', () => moveDirection(button.dataset.direction)));
document.addEventListener('keydown', event => {
  if ($('#room').dataset.stage !== 'room' || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (event.key === 'Escape' && !$('#topic-dialog').hidden) { homePanel(); return; }
  if ((event.key === 'e' || event.key === 'E' || event.key === 'Enter') && $('#topic-dialog').hidden) {
    const i = locationsForTopics.findIndex(([x,y]) => Math.hypot(player.x-x, player.y-y) < 65);
    if (i >= 0 && topics[i]) { event.preventDefault(); topicPanel(topics[i]); return; }
  }
  const direction = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down',
    s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right' }[event.key];
  if (direction) { event.preventDefault(); if (!$('#topic-dialog').hidden) homePanel(); moveDirection(direction); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAnimation();
  else if (!$('#room').hidden) { path = []; draw(); }
});
window.addEventListener('pagehide', stopAnimation);
$('#logout').addEventListener('click', () => {
  if (!confirm('Al salir perderás el acceso a este perfil desde este dispositivo. ¿Deseas continuar?')) return;
  studentSignOut(); localStorage.removeItem('aula-student-course-code');
  courseId = ''; profile = null; topics = []; selectedTopic = null;
  $('#course-title').textContent = 'Bienvenido al aula';
  $('#group-badge').textContent = 'Elige tu espacio';
  $('#topic-buttons').replaceChildren();
  $('#side-content').replaceChildren(element('h2', 'La sala ya está aquí.'), element('p', 'Habla con el docente para empezar.'));
  show('registration');
});
