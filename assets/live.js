import { ATTACHMENT_ACCEPT, attachmentInfo, fileSizeLabel } from './attachments.js';
import './embed.js?v=20261012a';
import { configured, signInStudentAnonymously, studentRpc, studentSignedIn, studentSignOut, uploadTeamFile, cancelTeamFile, downloadTeamFile } from './supabase-client.js?v=20261012a';
import { SKINS, SHIRTS, normalizeCode } from './model.js';
import { avatarSVG, drawWorld } from './world.js?v=20261013c';
import { createRoomLayout, findPath, isWalkable, canWalkSegment } from './world-layout.js';
import { createParticipantPalette, applyParticipantColor, participantAvatar, chatMessage } from './chat-ui.js?v=20261011b';

const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let courseId = '', profile = null, topics = [], selectedTopic = null;
let look = { skin: 1, shirt: 0, hair: 'short', presentation: 'hombre' };
let player = { x: 400, y: 300, direction: 'down' }, path = [], animation = 0, onArrival = null;
let chatTimer = 0, chatLoading = false, chatTeamId = '';
let participantColor = createParticipantPalette();
let layout = createRoomLayout(0), activeTab = 'aula', roomRefresh = 0;
function stopAnimation() { cancelAnimationFrame(animation); animation = 0; }
function show(stage) {
  stopAnimation();
  const onboarding = stage !== 'room';
  $('#in-room-dialog').hidden = !onboarding;
  closeTopic();
  $('#registration').hidden = stage !== 'registration';
  $('#avatar').hidden = stage !== 'avatar';
  $('#teacher').hidden = !onboarding;
  $('#edit-avatar').hidden = !profile;
  $('#logout').hidden = !studentSignedIn();
  $('#room').dataset.stage = stage;
  $('.room-tabs').hidden = onboarding;
  if (onboarding) setRoomTab('aula');
  $('#registration h2').id = stage === 'registration' ? 'dialog-title' : 'registration-title';
  $('#avatar h2').id = stage === 'avatar' ? 'dialog-title' : 'avatar-title';
  document.title = 'Mi aula · Aula Encuentro';
  draw();
}
function message(value) {
  for (const id of ['#error', '#registration-error', '#avatar-error', '#topic-error']) {
    const node = $(id);
    if (node) { node.textContent = ''; node.hidden = true; }
  }
  if (!value) return;
  const stage = $('#room').dataset.stage;
  const target = stage === 'registration' ? $('#registration-error')
    : stage === 'avatar' ? $('#avatar-error')
    : !$('#topic-dialog').hidden ? $('#topic-error') : $('#error');
  target.textContent = value;
  target.hidden = false;
}
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
const questionText = {
  code: ['¿Cuál es el código de tu materia?', 'El código de tu docente te abre la puerta de esta sala.'],
  firstName: ['¡Hola! ¿Cómo te llamas?', 'Comencemos por tus nombres.'],
  lastName: ['¿Y cuál es tu apellido?', 'Así aparecerás en la lista del docente.'],
  email: ['¿Qué correo podemos usar para contactarte?', 'No tienes que abrir ningún enlace de confirmación.'],
  phone: ['Por último, ¿tu número de teléfono?', 'Tu teléfono solo lo verá el docente; no se muestra a tus compañeros.']
};
const registrationForm = $('#registration-form');
// An explicit entry must win over the code remembered from an earlier visit.
const submittedCode = normalizeCode(sessionStorage.getItem('aula-course-code') || '');
const rememberedCode = normalizeCode(localStorage.getItem('aula-student-course-code') || '');
const entryCode = submittedCode || rememberedCode;
registrationForm.elements.namedItem('code').value = entryCode;
sessionStorage.removeItem('aula-course-code');
let questions = registrationForm.elements.namedItem('code').value.trim()
  ? ['firstName', 'lastName', 'email', 'phone']
  : ['code', 'firstName', 'lastName', 'email', 'phone'];
let questionIndex = 0;
function renderQuestion(focus = false) {
  const key = questions[questionIndex];
  document.querySelectorAll('.dialog-step').forEach(step => { step.hidden = step.dataset.step !== key; });
  $('#registration h2').textContent = questionText[key][0];
  $('#dialog-description').textContent = questionText[key][1];
  $('#dialog-progress').textContent = `PREGUNTA ${questionIndex + 1} DE ${questions.length}`;
  $('#previous-question').hidden = questionIndex === 0;
  $('#next-question').hidden = questionIndex === questions.length - 1;
  $('#finish-registration').hidden = questionIndex !== questions.length - 1;
  $('#dialog-privacy').hidden = questionIndex !== questions.length - 1;
  $('#change-code').hidden = questions.includes('code');
  if (focus) registrationForm.elements.namedItem(key).focus();
}
$('#next-question').addEventListener('click', () => {
  const field = registrationForm.elements.namedItem(questions[questionIndex]);
  if (!field.reportValidity()) return;
  if (questions[questionIndex] === 'code' &&
      !/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(normalizeCode(field.value))) {
    message('Revisa el código de tu materia. Tiene el formato MAT-XXXXX-XXXXX-XXXXX.');
    field.focus(); return;
  }
  message('');
  if (questions[questionIndex] === 'code') field.value = normalizeCode(field.value);
  questionIndex++; renderQuestion(true);
});
$('#previous-question').addEventListener('click', () => { questionIndex--; renderQuestion(true); });
$('#change-code').addEventListener('click', () => {
  questions = ['code', 'firstName', 'lastName', 'email', 'phone'];
  questionIndex = 0; message(''); renderQuestion(true);
});
registrationForm.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || questions[questionIndex] === 'phone') return;
  event.preventDefault(); $('#next-question').click();
});
renderQuestion();
show('registration');
if (!configured) { $('#room').hidden = true; $('#setup').hidden = false; }
else {
  if (studentSignedIn() && entryCode) {
    run(async () => {
      try { await enterCourse(entryCode); }
      catch (error) {
        // This browser has a session, but may not have a profile in this subject.
        // Keep the registration form ready instead of treating missing details as a failure.
        if (error.message !== 'Revisa correo, nombre, apellido y teléfono') throw error;
      }
    });
  }
}
async function enterCourse(code, details = {}) {
  code = normalizeCode(code);
  let result;
  try { result = await studentRpc('enroll_student', { p_code: code, ...details }); }
  catch (error) {
    if (error.message !== 'Materia no encontrada') throw error;
    // Forget only the rejected shortcut. The anonymous session owns the profile and team.
    if (normalizeCode(localStorage.getItem('aula-student-course-code') || '') === code)
      localStorage.removeItem('aula-student-course-code');
    questions = ['code', 'firstName', 'lastName', 'email', 'phone'];
    questionIndex = 0; show('registration'); renderQuestion(true);
    throw new Error('No encontramos una materia con ese código. Revisa el código actual que te compartió tu docente.');
  }
  courseId = result.course_id;
  localStorage.setItem('aula-student-course-code', code);
  profile = await studentRpc('my_profile', { p_course_id: courseId });
  $('#avatar-course').textContent = result.course_name;
  $('#course-title').textContent = result.course_name;
  $('#avatar-name').textContent = profile.firstName + ' ' + profile.lastName;
  look = { skin: profile.avatar?.skin ?? 1, shirt: profile.avatar?.shirt ?? 0,
    hair: profile.avatar?.hair ?? 'short', presentation: profile.avatar?.presentation === 'mujer' ? 'mujer' : 'hombre' };
  renderAvatarOptions();
  if (Object.keys(profile.avatar || {}).length) await enterRoom();
  else show('avatar');
}
$('#registration-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const f = event.target.elements;
  const code = normalizeCode(f.namedItem('code').value);
  if (!/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code))
    throw new Error('Revisa el código de tu materia. Tiene el formato MAT-XXXXX-XXXXX-XXXXX.');
  const phone = f.namedItem('phone').value.trim();
  if (!/^\+?[0-9 -]{7,20}$/.test(phone) || (phone.match(/\d/g) || []).length < 7)
    throw new Error('Revisa el número de teléfono.');
  const details = { p_email: f.namedItem('email').value.trim().toLowerCase(),
    p_first_name: f.namedItem('firstName').value.trim(), p_last_name: f.namedItem('lastName').value.trim(), p_phone: phone };
  const submit = $('#finish-registration');
  submit.disabled = true; submit.textContent = 'Guardando tu perfil…';
  try {
    await signInStudentAnonymously();
    try { await enterCourse(code, details); }
    catch (error) {
      // A previously deleted anonymous account can leave a stale browser session.
      if (!error.message.includes('students_auth_user_id_fkey')) throw error;
      studentSignOut(); await signInStudentAnonymously(); await enterCourse(code, details);
    }
  } finally {
    submit.disabled = false; submit.textContent = 'Crear mi personaje →';
  }
}); });

function renderAvatarOptions() {
  $('#presentation-options').replaceChildren(...[['mujer', 'Mujer'], ['hombre', 'Hombre']].map(([value, label]) => {
    const button = element('button', '', 'avatar-style-option');
    button.type = 'button';
    button.dataset.presentation = value;
    button.setAttribute('aria-label', 'Avatar ' + label.toLowerCase());
    button.setAttribute('aria-pressed', String(look.presentation === value));
    button.innerHTML = avatarSVG({ ...look, presentation: value });
    button.append(element('span', label));
    button.addEventListener('click', () => { look.presentation = value; renderAvatarOptions();
      $('#presentation-options [data-presentation="' + value + '"]').focus(); });
    return button;
  }));
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
  const submit = $('#avatar-form button[type="submit"]');
  submit.disabled = true;
  try {
    await studentRpc('save_student_avatar', { p_course_id: courseId, p_avatar: look });
    profile = await studentRpc('my_profile', { p_course_id: courseId });
    await enterRoom();
  } finally { submit.disabled = false; }
}); });
$('#edit-avatar').addEventListener('click', () => { show('avatar'); renderAvatarOptions(); });

async function enterRoom() {
  topics = sortTopics(await studentRpc('course_room', { p_course_id: courseId }));
  show('room'); renderTopics(); draw();
  status(profile.topicId ? 'Tu lugar está guardado. Abre Mi equipo o Chat para coordinarte.' : 'Explora los temas y elige tu equipo.');
  clearInterval(chatTimer);
  chatTimer = setInterval(() => { if (!document.hidden && activeTab === 'chat') refreshChat(); }, 8000);
  clearInterval(roomRefresh); roomRefresh = setInterval(refreshRoom, 15000);
}
function sortTopics(rows) {
  return rows.sort((a, b) => (a.position || 0) - (b.position || 0) || a.id.localeCompare(b.id));
}
let locationsForTopics = [];
function renderTopics() {
  stopAnimation(); path = []; onArrival = null;
  layout = createRoomLayout(topics.length);
  locationsForTopics = layout.rooms.map(room => [room.arrival.x, room.arrival.y]);
  if (!isWalkable(player.x, player.y, layout)) player = { ...player, ...layout.spawn };
  $('#room-map').style.aspectRatio = layout.width + ' / ' + layout.height;
  draw();
  const mine = topics.find(t => t.id === profile.topicId);
  $('#group-badge').textContent = mine ? 'Tu equipo: ' + mine.name : 'Tu equipo: sin asignar';
  const locations = layout.rooms.map(room => [room.label.x, room.label.y, room.arrival.x, room.arrival.y]);
  $('#topic-buttons').replaceChildren(...topics.map((topic, i) => {
    const button = element('button', '', 'map-action' + (topic.id === profile.topicId ? ' is-mine' : ''));
    button.type = 'button'; button.dataset.topic = topic.id;
    button.style.left = locations[i][0] / 8 + '%'; button.style.top = locations[i][1] / layout.height * 100 + '%';
    button.append(element('strong', topic.name), element('small', topic.members.length + ' de ' + topic.capacity + ' lugares'));
    button.addEventListener('click', () => openTopic(topic, { x: locations[i][2], y: locations[i][3] }));
    return button;
  }));
  const activeTopic = selectedTopic && topics.find(t => t.id === selectedTopic.id);
  renderTeamChat(mine);
  homePanel();
  if (activeTopic) topicPanel(activeTopic);
}
function side(...nodes) { $('#side-content').replaceChildren(...nodes); }
function openTopic(topic, target) { setRoomTab('aula'); walkTo(target, () => topicPanel(topic)); }
function renderTeamChat(team) {
  const host = $('#team-chat-host');
  if (!team) {
    host.hidden = true;
    host.replaceChildren();
    chatTeamId = '';
    $('#chat-locked').hidden = false;
    return;
  }
  $('#chat-locked').hidden = true; host.hidden = false;
  if (chatTeamId !== team.id) {
    participantColor = createParticipantPalette(team.members);
    host.replaceChildren(teamChatPanel(team));
    chatTeamId = team.id;
    refreshChat();
  }
  $('#team-chat-title').textContent = team.name;
}
function homePanel() {
  selectedTopic = null;
  closeTopic();
  const greeting = element('span', 'HOLA, ' + profile.firstName.split(' ')[0].toLocaleUpperCase('es'), 'eyebrow');
  const title = element('h2', 'Encuentra tu lugar.');
  const intro = element('p', 'Explora los temas de tu materia. Abre un espacio para ver integrantes y elegir equipo.');
  const list = element('div', '', 'topic-list');
  if (!topics.length) list.append(element('p', 'El docente todavía no ha añadido temas.'));
  for (const topic of topics) {
    const button = element('button', topic.name, 'topic-link' + (topic.id === profile.topicId ? ' is-mine' : ''));
    button.type = 'button';
    const label = topic.id === profile.topicId ? 'Tu equipo' : topic.members.length + '/' + topic.capacity + ' lugares';
    button.append(element('span', label));
    button.addEventListener('click', () => { const i = topics.indexOf(topic);
      openTopic(topic, { x: locationsForTopics[i][0], y: locationsForTopics[i][1] });
    });
    list.append(button);
  }
  const team = topics.find(topic => topic.id === profile.topicId);
  const chatHost = $('#team-chat-host');
  const wasHidden = chatHost.hidden;
  chatHost.hidden = !team;
  if (team && wasHidden) refreshChat();
  const nodes = [greeting, title, intro, list];
  $('#team-roster-host').replaceChildren(team ? teamRosterPanel(team) : element('p', 'Elige un grupo en «Aula y temas» para ver aquí a tus compañeros.', 'empty-team'));
  nodes.push(element('p', 'Consulta tus compañeros en Mi equipo y comparte mensajes y archivos en Chat.', 'field-hint'));
  side(...nodes);
}
function teamRosterPanel(team) {
  const section = element('section', '', 'team-roster-panel');
  section.append(element('span', 'TU EQUIPO', 'eyebrow'), element('h3', team.name),
    element('p', team.instructions || 'El docente todavía no añadió indicaciones.'));
  section.append(element('h4', 'Tus compañeros'));
  const roster = element('div', '', 'team-roster');
  for (const member of team.members) {
    const card = element('div', '', 'team-member');
    applyParticipantColor(card, participantColor(member.id || member.name));
    const identity = element('div', '', 'team-member-identity');
    identity.append(participantAvatar(member.name), element('strong', member.name + (member.mine ? ' · Tú' : '')));
    card.append(identity);
    if (member.email) {
      const link = element('a', member.email); link.href = 'mailto:' + member.email; card.append(link);
    }
    if (member.phone) {
      const link = element('a', member.phone); link.href = 'tel:' + member.phone.replace(/[^+0-9]/g, ''); card.append(link);
    }
    if (!member.email && !member.phone) card.append(element('small', 'Contacto privado · usa el chat'));
    roster.append(card);
  }
  section.append(roster);
  const mine = team.members.find(member => member.mine);
  const label = element('label', '', 'share-contact');
  const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = !!mine?.sharing;
  label.append(toggle, element('span', 'Compartir mi correo y teléfono con este equipo'));
  toggle.addEventListener('change', () => run(async () => {
    toggle.disabled = true;
    try { await studentRpc('team_contact_setting', { p_course_id: courseId, p_share: toggle.checked });
      topics = sortTopics(await studentRpc('course_room', { p_course_id: courseId })); renderTopics(); }
    catch (error) { toggle.checked = !toggle.checked; throw error; }
    finally { toggle.disabled = false; }
  }));
  section.append(label, element('p', 'Puedes cambiar esta opción en cualquier momento.', 'field-hint'));
  return section;
}
function teamChatPanel(team) {
  const section = element('section', '', 'team-chat');
  section.setAttribute('aria-labelledby', 'team-chat-title');
  const header = element('div', '', 'team-chat-header');
  const icon = element('span', '···', 'team-chat-icon'); icon.setAttribute('aria-hidden', 'true');
  const heading = element('div', '', 'team-chat-heading');
  const title = element('h2', team.name); title.id = 'team-chat-title';
  heading.append(element('span', 'CHAT DEL EQUIPO', 'eyebrow'), title);
  header.append(icon, heading, element('span', 'Solo tu equipo', 'chat-private-badge'));
  section.append(header, element('p', 'Cada integrante tiene su color. Aquí pueden ponerse de acuerdo.', 'chat-description'));
  const messages = element('div', '', 'chat-messages'); messages.id = 'team-chat-messages';
  messages.setAttribute('role', 'log'); messages.setAttribute('aria-label', 'Mensajes de tu equipo');
  messages.setAttribute('aria-relevant', 'additions'); messages.tabIndex = 0;
  messages.append(element('p', 'Cargando conversación…', 'chat-empty'));
  const form = element('form', '', 'chat-form'); form.id = 'team-chat-form';
  const input = document.createElement('input'); input.name = 'message';
  input.id = 'team-chat-input'; input.maxLength = 500; input.placeholder = 'Escribe un mensaje…';
  const label = element('label', 'Escribe a tu equipo'); label.htmlFor = input.id;
  const send = element('button', 'Enviar', 'button primary'); send.type = 'submit';
  const chatError = element('p', '', 'field-error'); chatError.hidden = true;
  chatError.setAttribute('role', 'alert');
  let selectedFile = null, uploadedPath = '', fileInfo = null;
  const picker = document.createElement('input'); picker.type = 'file'; picker.accept = ATTACHMENT_ACCEPT; picker.hidden = true;
  picker.id = 'team-chat-file'; picker.setAttribute('aria-label','Seleccionar un archivo para el equipo');
  const attach = element('button', 'Adjuntar', 'button secondary chat-attach'); attach.type = 'button';
  const preview = element('div', '', 'attachment-preview'); preview.hidden = true; preview.setAttribute('role','status');
  const previewName = element('span');
  const remove = element('button','Quitar','attachment-remove'); remove.type = 'button';
  preview.append(previewName, remove);
  const uploadStatus = element('p','','upload-status'); uploadStatus.setAttribute('role','status'); uploadStatus.hidden = true;
  const help = element('p','Un archivo por mensaje · hasta 10 MB. Imágenes, PDF, Word, Excel, PowerPoint, TXT, CSV o ZIP.','attachment-help');
  help.id = 'attachment-help'; attach.setAttribute('aria-describedby',help.id);
  const clearFile = async () => {
    const oldPath = uploadedPath;
    selectedFile = null; uploadedPath = ''; fileInfo = null; picker.value = ''; preview.hidden = true;
    if (oldPath) await cancelTeamFile(oldPath).catch(() => {});
  };
  attach.addEventListener('click', () => picker.click());
  remove.addEventListener('click', clearFile);
  picker.addEventListener('change', async () => {
    const file = picker.files[0]; if (!file) return;
    try {
      const info = attachmentInfo(file); await clearFile(); selectedFile = file; fileInfo = info;
      previewName.textContent = info.name + ' · ' + fileSizeLabel(info.size); preview.hidden = false; chatError.hidden = true;
    } catch(error) { picker.value = ''; chatError.textContent = error.message; chatError.hidden = false; }
  });
  form.append(label, input, attach, send, picker, preview, help, uploadStatus, chatError);
  form.addEventListener('submit', async event => { event.preventDefault();
    const body = input.value.trim();
    if (!body && !selectedFile) { chatError.textContent = 'Escribe un mensaje o adjunta un archivo.'; chatError.hidden = false; return; }
    send.disabled = true; attach.disabled = true; remove.disabled = true; input.disabled = true; chatError.hidden = true;
    try {
      if (selectedFile) {
        uploadStatus.hidden = false; uploadStatus.textContent = uploadedPath ? 'Enviando archivo al equipo…' : 'Subiendo archivo…';
        if (!uploadedPath) uploadedPath = await uploadTeamFile(courseId, team.id, selectedFile, fileInfo);
        uploadStatus.textContent = 'Enviando archivo al equipo…';
        await studentRpc('team_chat_send_file', { p_course_id:courseId,p_topic_id:team.id,p_body:body,p_path:uploadedPath,p_name:fileInfo.name });
        uploadedPath = ''; await clearFile();
      } else await studentRpc('team_chat_send', { p_course_id: courseId, p_topic_id: team.id, p_body: body });
      input.value = ''; await refreshChat(true);
    } catch (error) { chatError.textContent = (error.name === 'TimeoutError' ? 'La subida tardó demasiado. Puedes volver a intentarlo.' : error.message); chatError.hidden = false; }
    finally { send.disabled = false; attach.disabled = false; remove.disabled = false; input.disabled = false; uploadStatus.hidden = true; input.focus(); }
  });
  section.append(messages, form,
    element('p', 'Solo quienes integran este equipo pueden leer y escribir aquí.', 'field-hint'));
  return section;
}
async function refreshChat(forceBottom = false) {
  const box = $('#team-chat-messages');
  if (!box || chatLoading || !profile?.topicId) return;
  chatLoading = true;
  try {
    const messages = await studentRpc('team_chat_read', { p_course_id: courseId, p_topic_id: profile.topicId });
    if (!box.isConnected) return;
    const signature = JSON.stringify(messages);
    if (box.dataset.signature === signature) {
      if (forceBottom) box.scrollTop = box.scrollHeight;
      return;
    }
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 45;
    box.replaceChildren(...(messages.length ? messages.map(msg => chatMessage(msg, participantColor(msg.senderId || msg.name), downloadTeamFile))
      : [element('p', 'La conversación empieza contigo. Saluda a tu equipo para comenzar.', 'chat-empty')]));
    box.dataset.signature = signature;
    box.dataset.lastMessage = messages.length ? String(messages.at(-1).id) : '';
    if (nearBottom || forceBottom) box.scrollTop = box.scrollHeight;
  } catch (error) { if (box.isConnected) {
    delete box.dataset.signature;
    box.replaceChildren(element('p', error.message, 'chat-empty'));
  } }
  finally { chatLoading = false; }
}
function topicPanel(topic, confirmJoin = false) {
  selectedTopic = topic;
  const mine = profile.topicId === topic.id;

  const full = topic.members.length >= topic.capacity;
  const header = element('div', '', 'topic-dialog-heading');
  const close = element('button', '×', 'topic-close'); close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar tema'); close.addEventListener('click', homePanel);
  header.append(element('span', 'TEMA DE TU MATERIA', 'eyebrow'), close);
  const count = element('span', topic.members.length + ' de ' + topic.capacity + ' integrantes' + (mine ? ' · Tu equipo' : ''), 'side-tag');
  const members = element('ul', '', 'member-list');
  for (const member of topic.members) members.append(element('li', member.name));
  for (let i = topic.members.length; i < topic.capacity; i++) members.append(element('li', 'Lugar disponible', 'free'));
  const title = element('h2', topic.name); title.id = 'topic-title';
  const nodes = [header, title,
    element('p', topic.instructions || 'Sin indicaciones todavía.'), count, members];
  if (mine) nodes.push(element('p', 'Ya formas parte de este equipo. Tu lugar está guardado.'));
  else if (profile.topicId) nodes.push(element('p', 'Ya perteneces a otro equipo. Puedes consultar este tema y sus integrantes.'));
  else if (full) nodes.push(element('p', 'Este equipo está completo.'));
  else if (!profile.registrationOpen) nodes.push(element('p', 'La elección de equipos está cerrada.'));
  else if (confirmJoin) {
    const confirmation = element('div', '', 'join-confirmation');
    confirmation.setAttribute('role', 'group');
    confirmation.setAttribute('aria-labelledby', 'join-confirm-title');
    const warning = element('span', '!', 'join-confirm-icon'); warning.setAttribute('aria-hidden', 'true');
    const heading = element('h3', 'Confirma tu elección'); heading.id = 'join-confirm-title'; heading.tabIndex = -1;
    const explanation = element('p', '¿Seguro que quieres pertenecer a ' + topic.name + '? Después solo el docente podrá cambiarte de equipo.');
    const actions = element('div', '', 'join-confirm-actions');
    const cancel = element('button', 'No, volver', 'button secondary'); cancel.type = 'button';
    cancel.addEventListener('click', () => topicPanel(topic));
    const join = element('button', 'Sí, unirme al equipo', 'button danger'); join.type = 'button';
    join.addEventListener('click', () => run(async () => {
      join.disabled = true; join.textContent = 'Guardando tu lugar…';
      try {
        await studentRpc('choose_topic', { p_course_id: courseId, p_topic_id: topic.id });
        profile = await studentRpc('my_profile', { p_course_id: courseId });
        topics = sortTopics(await studentRpc('course_room', { p_course_id: courseId }));
        renderTopics(); status('Te uniste al equipo de ' + topic.name + '.');
      } finally { join.disabled = false; join.textContent = 'Sí, unirme al equipo'; }
    }));
    actions.append(cancel, join); confirmation.append(warning, heading, explanation, actions);
    nodes.push(confirmation);
  } else {
    const button = element('button', 'Quiero este equipo', 'button primary');
    button.type = 'button'; button.addEventListener('click', () => topicPanel(topic, true));
    nodes.push(button);
  }
  const back = element('button', 'Ver todos los temas', 'button secondary');
  back.type = 'button'; back.addEventListener('click', homePanel); nodes.push(back);
  if (mine) {
    const change = element('details', '', 'team-change');
    change.append(element('summary', '¿Necesitas cambiar de equipo?'),
      element('p', 'Escríbele al docente por el mensajero de E-ducativa. Solo él puede liberar tu lugar para que elijas otro equipo.'));
    nodes.push(change);
  }
  const topicError = element('p', '', 'field-error'); topicError.id = 'topic-error';
  topicError.setAttribute('role', 'alert'); topicError.hidden = true; nodes.push(topicError);
  const dialog = $('#topic-dialog');
  dialog.replaceChildren(...nodes); dialog.hidden = false;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  if (confirmJoin) dialog.querySelector('#join-confirm-title')?.focus();
  status('Estás viendo el tema ' + topic.name + '.');
}
function draw(time = 0) {
  const canvas = $('#world');
  const inRoom = $('#room').dataset.stage === 'room';
  if (!inRoom) { canvas.width = 800; canvas.height = 560; $('#room-map').style.aspectRatio = '10 / 7'; }
  if (!$('#room').hidden) drawWorld(canvas, { layout: inRoom ? layout : undefined, labels: false, actors: false,
    player: profile ? { ...player, ...look } : undefined, walking: path.length > 0, time });
}
function walkTo(target, arrived = null) {
  if ($('#room').dataset.stage !== 'room') return;
  if (!$('#topic-dialog').hidden) homePanel();
  onArrival = arrived;
  path = findPath(player, target, layout);
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
  const target = { x: (event.clientX - bounds.left) / bounds.width * layout.width,
    y: (event.clientY - bounds.top) / bounds.height * layout.height };
  const desk = layout.rooms.findIndex(({desk:d}) => target.x>=d.x && target.x<=d.x+d.w && target.y>=d.y && target.y<=d.y+d.h);
  if (desk >= 0 && topics[desk]) openTopic(topics[desk], {x:locationsForTopics[desk][0],y:locationsForTopics[desk][1]});
  else walkTo(target);
});
function moveDirection(direction) {
  if ($('#room').dataset.stage !== 'room') return;
  const delta = { up: [0,-20], down: [0,20], left: [-20,0], right: [20,0] }[direction];
  const target = { x: Math.round(player.x / 20) * 20 + delta[0],
    y: Math.round(player.y / 20) * 20 + delta[1] };
  if (canWalkSegment(player, target, layout)) { player.direction = direction; walkTo(target); }
  else status('Hay una pared o un mueble. Busca la puerta hacia el pasillo.');
}
document.querySelectorAll('[data-direction]').forEach(button =>
  button.addEventListener('click', () => moveDirection(button.dataset.direction)));
document.addEventListener('keydown', event => {
  if ($('#room').dataset.stage !== 'room' || activeTab !== 'aula' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape' && !$('#topic-dialog').hidden) { event.preventDefault(); homePanel(); return; }
  if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (event.target.closest('button,a,summary')) return;
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
  clearInterval(chatTimer); clearInterval(roomRefresh);
  chatTimer = 0; chatTeamId = '';
  $('#team-chat-host').hidden = true;
  $('#team-chat-host').replaceChildren();
  courseId = ''; profile = null; topics = []; selectedTopic = null;
  registrationForm.reset(); questions = ['code', 'firstName', 'lastName', 'email', 'phone'];
  questionIndex = 0; renderQuestion();
  $('#course-title').textContent = 'Bienvenido al aula';
  $('#group-badge').textContent = 'Elige tu espacio';
  $('#topic-buttons').replaceChildren();
  $('#side-content').replaceChildren(element('h2', 'La sala ya está aquí.'), element('p', 'Habla con el docente para empezar.'));
  show('registration');
});


function closeTopic() {
  const dialog = $('#topic-dialog');
  if (dialog.open) dialog.close(); dialog.hidden = true;
}
$('#topic-dialog').addEventListener('cancel', event => { event.preventDefault(); homePanel(); });
function setRoomTab(name) {
  activeTab = name;
  for (const tab of document.querySelectorAll('[data-room-tab]')) {
    const selected = tab.dataset.roomTab === name;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    $('#panel-' + tab.dataset.roomTab).hidden = !selected;
  }
  if (name === 'chat') {
    $('#chat-unread').hidden = true;
    const box = $('#team-chat-messages');
    const firstOpen = box && !box.dataset.opened;
    if (firstOpen) { box.dataset.opened = 'true'; box.scrollTop = box.scrollHeight; }
    refreshChat(firstOpen);
  }
  else if (name === 'aula') draw();
}
for (const tab of document.querySelectorAll('[data-room-tab]')) {
  tab.addEventListener('click', () => setRoomTab(tab.dataset.roomTab));
  tab.addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[data-room-tab]')]; let i = tabs.indexOf(tab);
    if (event.key === 'ArrowRight') i = (i+1)%tabs.length;
    else if (event.key === 'ArrowLeft') i = (i+tabs.length-1)%tabs.length;
    else if (event.key === 'Home') i = 0; else if (event.key === 'End') i=tabs.length-1; else return;
    event.preventDefault(); setRoomTab(tabs[i].dataset.roomTab); tabs[i].focus();
  });
}
let refreshingRoom = false;
async function refreshRoom() {
  if (document.hidden || !courseId || $('#room').dataset.stage !== 'room' || refreshingRoom) return;
  refreshingRoom = true;
  try {
    const [rows, currentProfile] = await Promise.all([studentRpc('course_room', {p_course_id:courseId}), studentRpc('my_profile',{p_course_id:courseId})]);
    const ordered = sortTopics(rows);
    if (JSON.stringify(ordered) !== JSON.stringify(topics) || currentProfile.topicId !== profile.topicId || currentProfile.registrationOpen !== profile.registrationOpen) {
      topics = ordered; profile = currentProfile; renderTopics();
    }
    if (activeTab !== 'chat' && profile.topicId) {
      const rows = await studentRpc('team_chat_read',{p_course_id:courseId,p_topic_id:profile.topicId});
      const box = $('#team-chat-messages');
      if (rows.length && box && box.dataset.lastMessage !== String(rows.at(-1).id)) $('#chat-unread').hidden = false;
    }
  } catch { /* Keep the current classroom usable during a temporary disconnect. */ }
  finally { refreshingRoom = false; }
}

