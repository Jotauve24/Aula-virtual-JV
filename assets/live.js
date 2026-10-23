import { normalizeStudentDocument, DOCUMENT_COUNTRIES } from './student-document.js?v=0.6.1';
import { ATTACHMENT_ACCEPT, attachmentInfo, fileSizeLabel } from './attachments.js?v=0.6.1';
import './embed.js?v=0.6.1';
import { configured, signInStudentAnonymously, studentRpc, studentSignedIn, studentSignOut, uploadTeamFile, cancelTeamFile, downloadTeamFile } from './supabase-client.js?v=0.6.1';
import { SKINS, SHIRTS, normalizeCode } from './model.js?v=0.6.1';
import { avatarSVG, drawWorld, roomTheme } from './world.js?v=0.6.1';
import { createRoomLayout, findPath, isWalkable, canWalkSegment, memberSeat } from './world-layout.js?v=0.6.1';
import { createParticipantPalette, applyParticipantColor, participantAvatar, chatMessage } from './chat-ui.js?v=0.6.1';
import { createIncomingMessageTracker } from './chat-notification.js?v=0.6.1';

const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let courseId = '', profile = null, topics = [], selectedTopic = null;
let look = { skin: 1, shirt: 0, outfit: 0, hair: 'short', presentation: 'hombre' };
let player = { x: 400, y: 300, direction: 'down' }, path = [], animation = 0, onArrival = null;
let chatTimer = 0, chatLoading = false, chatTeamId = '', unreadCount = 0;
const incomingMessages = createIncomingMessageTracker();
let arrivalHighlightTimer = 0;
let participantColor = createParticipantPalette();
let layout = createRoomLayout(0), activeTab = 'aula', roomRefresh = 0;
let presenceTimer = 0, presenceLoading = false, peers = [], courseName = '';
let presenceVerifiedAt = 0, presenceState = 'pending', avatarReturn = null;
let assignedSeats = [];
let ambientAnimation = 0, ambientLastFrame = 0;
function stopAnimation() { cancelAnimationFrame(animation); animation = 0; }
function stopAmbientAnimation() {
  cancelAnimationFrame(ambientAnimation); ambientAnimation = 0; ambientLastFrame = 0;
}
function updateAmbientAnimation() {
  stopAmbientAnimation();
  const visible = () => !document.hidden && !$('#room').hidden && activeTab === 'aula' &&
    $('#room').dataset.stage === 'room' && !reducedMotion.matches;
  if (!visible()) return;
  function animateAmbient(time) {
    if (!visible()) { stopAmbientAnimation(); return; }
    // Walking already redraws the whole map; idle creatures need only 12 fps.
    if (!path.length && time - ambientLastFrame >= 80) { draw(time); ambientLastFrame = time; }
    ambientAnimation = requestAnimationFrame(animateAmbient);
  }
  ambientAnimation = requestAnimationFrame(animateAmbient);
}
function show(stage) {
  stopAnimation();
  stopAmbientAnimation();
  const onboarding = stage !== 'room';
  $('#in-room-dialog').hidden = !onboarding;
  closeTopic();
  $('#registration').hidden = stage !== 'registration';
  $('#avatar').hidden = stage !== 'avatar';
  $('#cancel-avatar').hidden = stage !== 'avatar' || !avatarReturn;
  $('#avatar-form button[type="submit"]').textContent = avatarReturn
    ? 'Guardar cambios y volver al aula' : 'Guardar y explorar el aula ↗';
  $('#teacher').hidden = !onboarding;
  $('#edit-avatar').hidden = !profile || stage === 'registration';
  $('#logout').hidden = !studentSignedIn();
  $('#room').dataset.stage = stage;
  $('#course-title').textContent = stage === 'registration' ? 'Bienvenido a tu aula'
    : stage === 'avatar' ? 'Personaliza tu avatar' : courseName;
  $('#room-intro').textContent = stage === 'registration'
    ? 'Entra con el código de tu docente y prepara tu lugar en el aula.'
    : stage === 'avatar' ? 'Elige tu estilo antes de entrar a las mesas de trabajo.'
    : 'Explora, crea y conversa con tu equipo.';
  $('.room-tabs').hidden = onboarding;
  if (onboarding) setRoomTab('aula');
  $('#registration h2').id = stage === 'registration' ? 'dialog-title' : 'registration-title';
  $('#avatar h2').id = stage === 'avatar' ? 'dialog-title' : 'avatar-title';
  document.title = 'Mi aula · AulaVirtualJv';
  renderChatNotice(onboarding ? 0 : unreadCount);
  draw();
  updateAmbientAnimation();
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
  firstName: ['¡Hola! ¿Cómo te llamas?', 'Escribe tus nombres para comenzar a crear tu perfil.'],
  lastName: ['¿Y cuál es tu apellido?', 'Así aparecerás en la lista del docente.'],
  email: ['¿Qué correo podemos usar para contactarte?', 'Tu equipo podrá ver este correo. No tienes que abrir ningún enlace de confirmación.'],
  documentNumber: ['Tu documento de identidad', 'Una sola cuenta por estudiante, aunque cambies de correo o dispositivo.'],
  phone: ['Por último, ¿tu número de teléfono?', 'Tu teléfono empieza privado. En «Mi equipo» decides si lo compartes.']
};
const registrationForm = $('#registration-form');
// An explicit entry must win over the code remembered from an earlier visit.
const submittedCode = normalizeCode(sessionStorage.getItem('aula-course-code') || '');
const rememberedCode = normalizeCode(localStorage.getItem('aula-student-course-code') || '');
const entryCode = submittedCode || rememberedCode;
registrationForm.elements.namedItem('code').value = entryCode;
sessionStorage.removeItem('aula-course-code');
let questions = registrationForm.elements.namedItem('code').value.trim()
  ? ['firstName', 'lastName', 'documentNumber', 'email', 'phone']
  : ['code', 'firstName', 'lastName', 'documentNumber', 'email', 'phone'];
let questionIndex = 0;
let registrationPending = false;
let completingDocument = false;
const documentType = registrationForm.elements.namedItem('documentType');
const documentNumber = registrationForm.elements.namedItem('documentNumber');
const documentCountry = registrationForm.elements.namedItem('documentCountry');
const documentPrefix = registrationForm.elements.namedItem('documentPrefix');
const documentTome = registrationForm.elements.namedItem('documentTome');
const documentEntry = registrationForm.elements.namedItem('documentEntry');
const countryNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['es'], {type:'region'}) : null;
for (const code of [...DOCUMENT_COUNTRIES].sort((a,b)=>(countryNames?.of(a)||a).localeCompare(countryNames?.of(b)||b,'es'))) {
  const option = element('option',countryNames?.of(code)||code); option.value=code; documentCountry.append(option);
}
function updateDocumentInput(typeChanged = false) {
  const cedula = documentType.value === 'cedula';
  $('#cedula-parts').hidden = !cedula;
  $('#passport-country-field').hidden = cedula;
  documentNumber.readOnly = cedula;
  $('#document-number-label').textContent = cedula ? 'Tu cédula con guiones' : 'Número de pasaporte';
  documentNumber.placeholder = cedula ? 'Selecciona prefijo, tomo y asiento' : 'Como aparece en tu pasaporte';
  if (typeChanged) documentNumber.value = '';
  if (cedula) documentNumber.value = [documentPrefix.value,documentTome.value,documentEntry.value].join('-');
  hideDuplicateContact();
}
documentType.addEventListener('change',()=>updateDocumentInput(true));
for (const field of [documentPrefix,documentTome,documentEntry]) field.addEventListener('input',()=>updateDocumentInput());
documentPrefix.addEventListener('change',()=>updateDocumentInput());
documentNumber.addEventListener('input',hideDuplicateContact);
documentCountry.addEventListener('change',hideDuplicateContact);
function documentDetails() {
  if (documentType.value === 'cedula') documentNumber.value = [documentPrefix.value,documentTome.value,documentEntry.value].join('-');
  const number = normalizeStudentDocument(documentType.value,documentNumber.value);
  const country = documentType.value === 'cedula' ? 'PA' : documentCountry.value;
  if (!DOCUMENT_COUNTRIES.includes(country)) throw Error('Selecciona el país emisor del pasaporte');
  return {p_document_type:documentType.value,p_document_number:number,p_document_country:country};
}

// This notice is conditional. No old student's profile is exposed or attached
// merely from a guessed email; recovery still requires verified ownership.
const duplicateNotice = $('#email-duplicate-notice');
const registrationEmail = registrationForm.elements.namedItem('email');
const registrationPhone = registrationForm.elements.namedItem('phone');
function hideDuplicateContact() {
  duplicateNotice.hidden = true;
  duplicateNotice.dataset.field = '';
  $('#next-question').disabled = registrationPending;
  $('#finish-registration').disabled = registrationPending;
}
function showDuplicateContact(field = 'email') {
  questionIndex = questions.indexOf(field);
  if(questionIndex < 0) return;
  renderQuestion(true);
  duplicateNotice.dataset.field = field;
  $('#registration-duplicate-title').textContent = field === 'documentNumber'
    ? 'Este documento ya tiene una cuenta. Recupera tu perfil anterior.'
    : field === 'phone'
    ? 'Este teléfono ya tiene una inscripción en esta materia.'
    : 'Este correo ya tiene una inscripción en esta materia.';
  duplicateNotice.hidden = false;
  $('#next-question').disabled = field !== 'phone';
  $('#finish-registration').disabled = field === 'phone' || field === 'documentNumber';
}
registrationEmail.addEventListener('input',hideDuplicateContact);
registrationPhone.addEventListener('input',hideDuplicateContact);
$('#email-duplicate-recover').addEventListener('click',()=>{
  // Preserve the intended subject across an email magic-link callback even
  // when the link opens a different tab on the same device.
  if (duplicateNotice.dataset.field === 'documentNumber') localStorage.setItem('aula-student-document-recovery','1');
  else localStorage.removeItem('aula-student-document-recovery');
  const code=normalizeCode(registrationForm.elements.namedItem('code').value);
  if (/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code))
    localStorage.setItem('aula-student-recovery-code',code);
  // Use the existing verified-email recovery, never copy student data.
  $('#student-sign-in').click();
});
function renderQuestion(focus = false) {
  const key = questions[questionIndex];
  document.querySelectorAll('.dialog-step').forEach(step => { step.hidden = step.dataset.step !== key; });
  $('#registration h2').textContent = questionText[key][0];
  $('#dialog-description').textContent = questionText[key][1];
  $('#dialog-progress').textContent = `PASO ${questionIndex + 1} DE ${questions.length} · ${completingDocument ? 'COMPLETAR PERFIL' : 'REGISTRO POR PRIMERA VEZ'}`;
  $('#previous-question').hidden = questionIndex === 0;
  $('#next-question').hidden = questionIndex === questions.length - 1;
  $('#finish-registration').hidden = questionIndex !== questions.length - 1;
  $('#finish-registration').textContent = completingDocument ? 'Guardar documento y entrar →' : 'Crear mi personaje →';
  $('#student-sign-in').hidden = completingDocument;
  $('#change-code').disabled = completingDocument;
  $('#dialog-privacy').hidden = questionIndex !== questions.length - 1;
  $('#change-code').hidden = questions.includes('code');
  if(key !== duplicateNotice.dataset.field) hideDuplicateContact();
  if (focus) (key === 'documentNumber' && documentType.value === 'cedula' ? documentPrefix : registrationForm.elements.namedItem(key)).focus();
}
$('#next-question').addEventListener('click', async () => {
  const field = registrationForm.elements.namedItem(questions[questionIndex]);
  if (!field.reportValidity()) return;
  const key=questions[questionIndex];
  if (key === 'code' &&
      !/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(normalizeCode(field.value))) {
    message('Revisa el código de tu materia. Tiene el formato MAT-XXXXX-XXXXX-XXXXX.');
    field.focus(); return;
  }
  message('');
  if (key === 'documentNumber') {
    try { documentDetails(); } catch(error) { message(error.message); return; }
  }
  if (key === 'email') {
    const submit=$('#next-question');
    const email=field.value.trim().toLowerCase();
    const firstName=registrationForm.elements.namedItem('firstName').value.trim();
    const lastName=registrationForm.elements.namedItem('lastName').value.trim();
    const code=normalizeCode(registrationForm.elements.namedItem('code').value);
    submit.disabled=true;
    try {
      await signInStudentAnonymously();
      const exists=await studentRpc('student_registration_email_hint',{
        p_code:code,p_email:email,p_first_name:firstName,p_last_name:lastName
      });
      if (email!==field.value.trim().toLowerCase() || questions[questionIndex]!=='email')
        return;
      if (exists) {
        showDuplicateContact('email');
        return;
      }
    } catch {
      // The hint is best-effort; the server independently BLOCKS duplicates
      // when the student eventually submits the full registration form.
    } finally {
      if (duplicateNotice.hidden) submit.disabled=false;
    }
    if (email!==field.value.trim().toLowerCase() || questions[questionIndex]!=='email')
      return;
  }
  if (key === 'code') field.value = normalizeCode(field.value);
  questionIndex++; renderQuestion(true);
});
$('#previous-question').addEventListener('click', () => { questionIndex--; renderQuestion(true); });
$('#change-code').addEventListener('click', () => {
  questions = ['code', 'firstName', 'lastName', 'documentNumber', 'email', 'phone'];
  questionIndex = 0; message(''); renderQuestion(true);
});
registrationForm.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || questionIndex === questions.length - 1) return;
  event.preventDefault(); $('#next-question').click();
});
renderQuestion();
show('registration');
if (!configured) { $('#room').hidden = true; $('#setup').hidden = false; }
else {
  // An explicit code from the teacher always wins; otherwise reopen the student's
  // last authorized course without a new email or another registration.
  const authLinkReturn = typeof location !== 'undefined' &&
    (new URLSearchParams(location.search).has('student_auth') ||
     new URLSearchParams(location.search).get('login') === '1');
  const requestedResume = !submittedCode && !authLinkReturn
    ? (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('resume_id') : null) ||
      localStorage.getItem('aula-student-resume-id')
    : null;
  if (studentSignedIn() && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestedResume || '')) {
    run(async () => {
      const existing = await studentRpc('student_open_owned_course',{p_course_id:requestedResume});
      await openStudentCourse(existing);
      history.replaceState(null,'',location.pathname);
    });
  } else if (studentSignedIn() && entryCode && !authLinkReturn) {
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
  try { result = await studentRpc('enroll_student_document', { p_code: code, ...details }); }
  catch (error) {
    if (error.message !== 'Materia no encontrada') throw error;
    // Forget only the rejected shortcut. The anonymous session owns the profile and team.
    if (normalizeCode(localStorage.getItem('aula-student-course-code') || '') === code)
      localStorage.removeItem('aula-student-course-code');
    questions = ['code', 'firstName', 'lastName', 'documentNumber', 'email', 'phone'];
    questionIndex = 0; show('registration'); renderQuestion(true);
    throw new Error('No encontramos una materia con ese código. Revisa el código actual que te compartió tu docente.');
  }
  await openStudentCourse(result, code);
}
async function openStudentCourse(result, code = null) {
  completingDocument = false;
  courseId = result.course_id;
  courseName = result.course_name;
  if (code) {
    localStorage.setItem('aula-student-course-code', code);
    localStorage.removeItem('aula-student-resume-id');
  } else {
    localStorage.setItem('aula-student-resume-id', result.course_id);
  }
  profile = await studentRpc('my_profile', { p_course_id: courseId });
  const documentStatus = await studentRpc('student_document_status',{p_course_id:courseId});
  if (documentStatus.required) {
    completingDocument = true;
    questions = ['documentNumber']; questionIndex = 0;
    documentType.value = 'cedula'; updateDocumentInput(true);
    show('registration'); renderQuestion(true);
    $('#registration h2').textContent = 'Completa tu documento para continuar';
    $('#dialog-description').textContent = 'Tu avatar, equipo y conversaciones se conservan. Este dato evita registros repetidos.';
    return;
  }
  $('#avatar-course').textContent = result.course_name;
  $('#avatar-name').textContent = profile.firstName + ' ' + profile.lastName;
  look = { skin: profile.avatar?.skin ?? 1, shirt: profile.avatar?.shirt ?? 0,
    outfit: profile.avatar?.outfit ?? profile.avatar?.shirt ?? 0,
    hair: profile.avatar?.hair ?? 'short', presentation: profile.avatar?.presentation === 'mujer' ? 'mujer' : 'hombre' };
  renderAvatarOptions();
  if (Object.keys(profile.avatar || {}).length) await enterRoom();
  else show('avatar');
}
$('#registration-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  if (registrationPending) return;
  const f = event.target.elements;
  if (completingDocument) {
    const details = documentDetails();
    registrationPending = true; $('#finish-registration').disabled = true;
    try {
      await studentRpc('student_set_document',{p_course_id:courseId,...details});
      await openStudentCourse({course_id:courseId,course_name:courseName});
    } catch(error) {
      if (error.message?.startsWith('Este documento ya tiene')) showDuplicateContact('documentNumber');
      else throw error;
    } finally {
      registrationPending = false;
      $('#finish-registration').disabled = !duplicateNotice.hidden;
    }
    return;
  }
  const documentInfo = documentDetails();
  for (const name of ['firstName','lastName','email','phone']) {
    if (!f.namedItem(name).reportValidity()) {
      questionIndex = questions.indexOf(name); renderQuestion(true); return;
    }
  }
  const code = normalizeCode(f.namedItem('code').value);
  if (!/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code))
    throw new Error('Revisa el código de tu materia. Tiene el formato MAT-XXXXX-XXXXX-XXXXX.');
  const phone = f.namedItem('phone').value.trim();
  if (!/^\+?[0-9 -]{7,20}$/.test(phone) || (phone.match(/\d/g) || []).length < 7)
    throw new Error('Revisa el número de teléfono.');
  const details = { p_email: f.namedItem('email').value.trim().toLowerCase(),
    p_first_name: f.namedItem('firstName').value.trim(), p_last_name: f.namedItem('lastName').value.trim(), p_phone: phone, ...documentInfo };
  const submit = $('#finish-registration');
  registrationPending = true;
  submit.disabled = true; submit.textContent = 'Guardando tu perfil…';
  try {
    await signInStudentAnonymously();
    // Only a convenience hint; enroll_student enforces the phone check even
    // if this request fails or a second browser submits at the same time.
    let repeatedPhone = false;
    try {
      repeatedPhone = await studentRpc('student_registration_phone_hint', {
        p_code:code,p_phone:phone,p_first_name:details.p_first_name,p_last_name:details.p_last_name
      });
    } catch { /* The database validates the final registration independently. */ }
    if (JSON.stringify(documentInfo) !== JSON.stringify(documentDetails()) ||
        phone !== f.namedItem('phone').value.trim() ||
        details.p_email !== f.namedItem('email').value.trim().toLowerCase() ||
        details.p_first_name !== f.namedItem('firstName').value.trim() ||
        details.p_last_name !== f.namedItem('lastName').value.trim() ||
        code !== normalizeCode(f.namedItem('code').value)) return;
    if (repeatedPhone) { showDuplicateContact('phone'); return; }
    try { await enterCourse(code, details); }
    catch (error) {
      if (error.message?.startsWith('Este documento ya tiene')) { showDuplicateContact('documentNumber'); return; }
      if (error.message?.includes('Este correo ya tiene una inscripción')) {
        showDuplicateContact('email');
        return;
      }
      if (error.message?.includes('Este teléfono ya tiene una inscripción')) {
        showDuplicateContact('phone');
        return; // Nothing was created; keep their original name and email.
      }
      // A previously deleted anonymous account can leave a stale browser session.
      if (!error.message.includes('students_auth_user_id_fkey')) throw error;
      studentSignOut(); await signInStudentAnonymously(); await enterCourse(code, details);
    }
  } finally {
    registrationPending = false;
    $('#next-question').disabled = !duplicateNotice.hidden && duplicateNotice.dataset.field !== 'phone';
    submit.disabled = !duplicateNotice.hidden && ['phone','documentNumber'].includes(duplicateNotice.dataset.field);
    submit.textContent = completingDocument ? 'Guardar documento y entrar →' : 'Crear mi personaje →';
  }
}); });

function renderAvatarOptions() {
  $('#presentation-options').replaceChildren(...[['mujer', 'Mujer'], ['hombre', 'Hombre']].map(([value, label]) => {
    const button = element('button', '', 'avatar-style-option');
    button.type = 'button';
    button.dataset.presentation = value;
    button.setAttribute('aria-label', 'Avatar ' + label.toLowerCase());
    button.setAttribute('aria-pressed', String(look.presentation === value));
    button.innerHTML = avatarSVG({ ...look, presentation: value,
      hair: value === 'mujer' ? 'long' : 'short', outfit: value === 'mujer' ? 5 : 1 });
    button.append(element('span', label));
    button.addEventListener('click', () => { if (look.presentation !== value) {
      look.presentation = value;
      look.hair = value === 'mujer' ? 'long' : 'short';
      look.outfit = value === 'mujer' ? 5 : 1;
      look.shirt = value === 'mujer' ? 0 : 1;
    } renderAvatarOptions();
      $('#presentation-options [data-presentation="' + value + '"]').focus(); });
    return button;
  }));
  const choices = [
    ['skin-options', 'skin', SKINS.slice(0, 3), ['Claro', 'Medio', 'Oscuro']],
    ['shirt-options', 'outfit', SHIRTS, ['Verde', 'Azul', 'Naranja', 'Mostaza', 'Violeta', 'Rosa', 'Lila']]
  ];
  for (const [id, key, colors, labels] of choices) {
    const buttons = colors.map((color, index) => {
      const button = element('button', '', 'swatch');
      button.type = 'button'; button.style.background = color;
      button.setAttribute('aria-label', labels[index]);
      button.setAttribute('aria-pressed', String(look[key] === index));
      button.addEventListener('click', () => { look[key] = index;
        // The existing save endpoint accepts shirt 0–2; the extra outfit index
        // preserves the wider palette in its JSON avatar without a data migration.
        if (key === 'outfit') look.shirt = index < 3 ? index : 0;
        renderAvatarOptions(); });
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
  submit.disabled = true; $('#cancel-avatar').disabled = true;
  try {
    await studentRpc('save_student_avatar', { p_course_id: courseId, p_avatar: look });
    profile = await studentRpc('my_profile', { p_course_id: courseId });
    await enterRoom();
  } finally { submit.disabled = false; $('#cancel-avatar').disabled = false; }
}); });
$('#edit-avatar').addEventListener('click', () => {
  if ($('#room').dataset.stage !== 'room') return;
  avatarReturn = { courseId, player: { ...player }, look: { ...look }, tab: activeTab };
  show('avatar'); renderAvatarOptions();
  $('#presentation-options button[aria-pressed="true"]')?.focus();
});
function returnFromAvatar() {
  if (!avatarReturn || $('#avatar-form button[type="submit"]').disabled) return;
  const saved = avatarReturn; avatarReturn = null;
  player = saved.player; look = saved.look;
  message(''); show('room'); setRoomTab(saved.tab);
  $('#edit-avatar').focus(); refreshPresence(); refreshRoom();
}
$('#cancel-avatar').addEventListener('click', returnFromAvatar);

async function enterRoom() {
  topics = sortTopics(await studentRpc('course_room', { p_course_id: courseId }));
  const newLayout = createRoomLayout(topics.length);
  const idHash = [...String(profile.id || '')].reduce((hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0), 0);
  const myTeamIndex = topics.findIndex(topic => topic.id === profile.topicId);
  const myMemberIndex = myTeamIndex < 0 ? -1 : [...topics[myTeamIndex].members]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .findIndex(member => member.id === profile.id);
  const returning = avatarReturn?.courseId === courseId ? avatarReturn : null;
  player = returning && isWalkable(returning.player.x, returning.player.y, newLayout)
    ? { ...returning.player }
    : myMemberIndex < 0
      ? { x: 272 + idHash % 9 * 32, y: newLayout.spawn.y, direction: 'down' }
      : { ...memberSeat(newLayout.rooms[myTeamIndex], myMemberIndex), direction: 'down' };
  avatarReturn = null;
  layout = newLayout;
  show('room'); renderTopics(); draw();
  status(profile.topicId ? 'Tu lugar está guardado. Abre Mi equipo o Chat para coordinarte.' : 'Explora los temas y elige tu equipo.');
  clearInterval(chatTimer);
  chatTimer = setInterval(() => { if (!document.hidden && profile?.topicId) refreshChat(); }, 6000);
  clearInterval(roomRefresh); roomRefresh = setInterval(refreshRoom, 15000);
  clearInterval(presenceTimer); presenceTimer = setInterval(refreshPresence, 2500);
  refreshPresence();
  if (returning) setRoomTab(returning.tab);
}
function sortTopics(rows) {
  return rows.sort((a, b) => (a.position || 0) - (b.position || 0) || a.id.localeCompare(b.id));
}
let locationsForTopics = [];
let renderedTopicOrder = '';
function renderTopics() {
  const roomOrder = topics.map(topic => topic.id).join(',');
  const geometryChanged = layout.rooms.length !== topics.length;
  if (geometryChanged || roomOrder !== renderedTopicOrder) {
    stopAnimation(); path = []; onArrival = null;
    if (geometryChanged) layout = createRoomLayout(topics.length);
  }
  renderedTopicOrder = roomOrder;
  assignedSeats = topics.flatMap((topic,roomIndex)=>[...topic.members]
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
    .map((member,seatIndex)=>({id:member.id,roomIndex,seatIndex,avatar:member.avatar||{}})));
  locationsForTopics = layout.rooms.map(room => [room.arrival.x, room.arrival.y]);
  if (!isWalkable(player.x, player.y, layout)) {
    stopAnimation(); path = []; onArrival = null;
    player = { ...player, ...layout.spawn };
  }
  $('#room-map').style.aspectRatio = layout.width + ' / ' + layout.height;
  draw();
  const mine = topics.find(t => t.id === profile.topicId);
  $('#group-badge').textContent = mine ? 'Tu equipo: ' + mine.name : 'Tu equipo: sin asignar';
  const locations = layout.rooms.map(room => [room.label.x, room.label.y, room.arrival.x, room.arrival.y]);
  $('#topic-buttons').replaceChildren(...topics.map((topic, i) => {
    const button = element('button', '', 'map-action' + (topic.id === profile.topicId ? ' is-mine' : ''));
    const theme = roomTheme(i);
    button.type = 'button'; button.dataset.topic = topic.id;
    button.style.setProperty('--table-accent', theme.accent);
    button.style.setProperty('--table-soft', theme.card);
    button.style.left = locations[i][0] / 8 + '%'; button.style.top = locations[i][1] / layout.height * 100 + '%';
    const occupancy = topic.members.length + '/' + topic.capacity;
    const details = (topic.id === profile.topicId ? 'Tu equipo seleccionado. ' : '') + topic.name + ', ' + topic.members.length + ' de ' + topic.capacity + ' lugares ocupados. Abrir el tema.';
    button.title = details; button.setAttribute('aria-label', details);
    const count = topic.id === profile.topicId
      ? element('small', '✓ Tu equipo · ' + occupancy, 'team-selected-marker')
      : element('small', occupancy + ' ');
    if (topic.id === profile.topicId) button.setAttribute('aria-current','true');
    else count.append(element('span', 'lugares', 'map-place-word'));
    button.append(element('strong', topic.name), count);
    button.addEventListener('click', () => openTopic(topic, { x: locations[i][2], y: locations[i][3] }));
    return button;
  }));
  const activeTopic = selectedTopic && topics.find(t => t.id === selectedTopic.id);
  renderTeamChat(mine);
  homePanel();
  if (activeTopic) topicPanel(activeTopic);
}
function side(...nodes) { $('#side-content').replaceChildren(...nodes); }
function openTopic(topic, target) {
  setRoomTab('aula');
  walkTo(target, () => {
    const current = topics.find(row => row.id === topic.id);
    if (current) topicPanel(current);
  });
}
function renderTeamChat(team) {
  const host = $('#team-chat-host');
  if (!team) {
    host.hidden = true;
    host.replaceChildren();
    chatTeamId = '';
    renderChatNotice(0);
    $('#chat-locked').hidden = false;
    return;
  }
  $('#chat-locked').hidden = true; host.hidden = false;
  if (chatTeamId !== team.id) {
    renderChatNotice(0);
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
  const ownTopic = topics.find(topic=>topic.id === profile.topicId);
  const title = element('h2', ownTopic ? 'Tu equipo está guardado.' : 'Encuentra tu lugar.');
  const intro = element('p', ownTopic ? 'Elegiste ' + ownTopic.name + '. Está marcado con ✓ en el mapa y en esta lista.'
    : 'Explora los temas de tu materia. Abre un espacio para ver integrantes y elegir equipo.');
  const list = element('div', '', 'topic-list');
  if (!topics.length) list.append(element('p', 'El docente todavía no ha añadido temas.'));
  for (const [index, topic] of topics.entries()) {
    const button = element('button', topic.name, 'topic-link' + (topic.id === profile.topicId ? ' is-mine' : ''));
    button.type = 'button';
    const theme = roomTheme(index);
    button.style.setProperty('--table-accent', theme.accent);
    button.style.setProperty('--table-soft', theme.card);
    const label = topic.id === profile.topicId ? '✓ Tu equipo' : topic.members.length + '/' + topic.capacity + ' lugares';
    button.append(element('span', label));
    if(topic.id === profile.topicId)button.setAttribute('aria-current','true');
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
  const nodes = [greeting, title, intro];
  if(team) {
    const shortcut=element('button','Ver mi equipo →','button primary team-open-button');
    shortcut.type='button';shortcut.addEventListener('click',()=>{setRoomTab('equipo');$('#tab-equipo').focus();});
    nodes.push(shortcut);
  }
  nodes.push(list);
  $('#team-roster-host').replaceChildren(team ? teamRosterPanel(team) : element('p', 'Elige un grupo en «Aula y temas» para ver aquí a tus compañeros.', 'empty-team'));
  updateTeamPresence();
  nodes.push(element('p', 'Consulta tus compañeros en Mi equipo y comparte mensajes y archivos en Chat.', 'field-hint'));
  side(...nodes);
}
function teamRosterPanel(team) {
  const section = element('section', '', 'team-roster-panel');
  section.append(element('span', 'TU EQUIPO', 'eyebrow'), element('h3', team.name));
  const mine = team.members.find(member => member.mine);
  const sharingCard = element('div', '', 'share-contact-card');
  sharingCard.dataset.sharing = String(!!mine?.sharing);
  const sharingHeading = element('div', '', 'share-contact-heading');
  const sharingIcon = element('span', '✉', 'share-contact-icon');
  sharingIcon.setAttribute('aria-hidden', 'true');
  const sharingText = element('div');
  sharingText.append(element('span', 'TU PRIVACIDAD', 'share-contact-eyebrow'),
    element('h4', '¿Quieres compartir tu teléfono con tu equipo?', 'share-contact-title'));
  sharingHeading.append(sharingIcon, sharingText);
  const sharingDescription = element('p', 'Tu correo siempre es visible para los integrantes de tu equipo. Activa esta opción si también quieres compartir tu teléfono.', 'share-contact-description');
  const label = element('label', '', 'share-contact');
  const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = !!mine?.sharing;
  const toggleText = element('span', 'Sí, compartir mi teléfono con mi equipo');
  label.append(toggle, toggleText);
  const sharingStatus = element('span', toggle.checked ? 'Teléfono visible para mi equipo' : 'Teléfono privado', 'share-contact-status');
  sharingStatus.setAttribute('role', 'status');
  sharingCard.append(sharingHeading, sharingDescription, label, sharingStatus);
  section.append(sharingCard,
    element('p', team.instructions || 'El docente todavía no añadió indicaciones.'),
    element('h4', 'Tus compañeros'));
  const roster = element('div', '', 'team-roster');
  for (const member of team.members) {
    const card = element('div', '', 'team-member');
    applyParticipantColor(card, participantColor(member.id || member.name));
    const identity = element('div', '', 'team-member-identity');
    identity.append(participantAvatar(member.name), element('strong', member.name + (member.mine ? ' · Tú' : '')));
    card.append(identity);
    const presence = element('span', '', 'member-presence');
    presence.dataset.studentId = member.id;
    presence.dataset.memberPresence = '';
    card.append(presence);
    if (member.email) {
      const link = element('a', member.email); link.href = 'mailto:' + member.email; card.append(link);
    }
    if (member.phone) {
      const link = element('a', member.phone); link.href = 'tel:' + member.phone.replace(/[^+0-9]/g, ''); card.append(link);
    }
    if (!member.phone) card.append(element('small', 'Teléfono privado · puedes usar el correo o el chat'));
    roster.append(card);
  }
  section.append(roster);
  toggle.addEventListener('change', () => run(async () => {
    toggle.disabled = true;
    sharingStatus.textContent = 'Guardando tu preferencia…';
    try { await studentRpc('team_contact_setting', { p_course_id: courseId, p_share: toggle.checked });
      topics = sortTopics(await studentRpc('course_room', { p_course_id: courseId })); renderTopics(); }
    catch (error) { toggle.checked = !toggle.checked;
      sharingStatus.textContent = toggle.checked ? 'Teléfono visible para mi equipo' : 'Teléfono privado';
      throw error; }
    finally { toggle.disabled = false; }
  }));
  return section;
}
function updateTeamPresence() {
  const online = new Set([profile?.id, ...peers.map(peer => peer.id)]);
  document.querySelectorAll('[data-member-presence]').forEach(node => {
    const own = node.dataset.studentId === profile?.id;
    const connected = own || presenceState === 'live' && online.has(node.dataset.studentId);
    node.dataset.connected = connected ? 'true' : presenceState === 'live' ? 'false' : 'unknown';
    node.textContent = own ? 'Tú · en el aula'
      : connected ? 'En el aula ahora' : presenceState === 'live' ? 'Sin conexión' : 'Actualizando conexión…';
  });
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
  const connection = element('p', '', 'chat-connection-status');
  connection.id = 'chat-connection-status'; connection.setAttribute('role', 'status'); connection.hidden = true;
  section.append(connection);
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
function renderChatNotice(count) {
  unreadCount = count;
  $('#chat-unread').hidden = !count;
  $('#chat-unread').textContent = count > 99 ? '99+' : String(count);
  $('#chat-alert').hidden = !count;
  $('#chat-alert-text').textContent = count === 1
    ? 'Tienes 1 mensaje nuevo en el chat de tu equipo.'
    : `Tienes ${count} mensajes nuevos en el chat de tu equipo.`;
  document.title = count ? `(${count}) Mensajes · Mi aula · AulaVirtualJv` : 'Mi aula · AulaVirtualJv';
}
function updateChatNotice(messages, topicId) {
  const key = `aula-chat-seen:${courseId}:${profile.id}:${topicId}`;
  const lastSeen = BigInt(localStorage.getItem(key) || '0');
  const newest = messages.length ? BigInt(messages.at(-1).id) : 0n;
  if (activeTab === 'chat' && !document.hidden && $('#room').dataset.stage === 'room') {
    if (newest > lastSeen) localStorage.setItem(key, String(newest));
    renderChatNotice(0);
  } else {
    renderChatNotice(messages.filter(msg => !msg.mine && BigInt(msg.id) > lastSeen).length);
  }
}
function notifyIncomingMessages(messages, topicId) {
  const key = courseId + ':' + profile.id + ':' + topicId;
  const arrivals = incomingMessages.check(key, messages);
  if (!arrivals || activeTab === 'chat' || document.hidden ||
      $('#room').hidden || $('#room').dataset.stage !== 'room') return;

  // The existing unread badge remains visible. Animate the banner only once
  // for a new batch, not on every six-second refresh.
  const banner = $('#chat-alert');
  if (!banner.hidden) {
    banner.classList.remove('chat-just-arrived');
    void banner.offsetWidth;
    banner.classList.add('chat-just-arrived');
    clearTimeout(arrivalHighlightTimer);
    arrivalHighlightTimer = setTimeout(() => {
      banner.classList.remove('chat-just-arrived');
      arrivalHighlightTimer = 0;
    }, 1150);
  }
  document.dispatchEvent(new CustomEvent('aulajv:chat-received', {
    detail: { count: arrivals }
  }));
}
$('#chat-alert-open').addEventListener('click', () => setRoomTab('chat'));
async function refreshChat(forceBottom = false) {
  const box = $('#team-chat-messages');
  if (!box || chatLoading || !profile?.topicId) return;
  const topicId = profile.topicId;
  const currentCourseId = courseId;
  chatLoading = true;
  try {
    const messages = await studentRpc('team_chat_read', { p_course_id: currentCourseId, p_topic_id: topicId });
    if (!box.isConnected || courseId !== currentCourseId || profile?.topicId !== topicId) return;
    const connection = $('#chat-connection-status');
    if (connection) { connection.hidden = true; connection.textContent = ''; }
    updateChatNotice(messages, topicId);
    notifyIncomingMessages(messages, topicId);
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
  } catch (error) { if (box.isConnected && courseId === currentCourseId && profile?.topicId === topicId) {
    const connection = $('#chat-connection-status');
    if (connection) { connection.textContent = 'No pudimos actualizar el chat. Volveremos a intentarlo.'; connection.hidden = false; }
    if (!box.dataset.signature) box.replaceChildren(element('p', 'Conectando con tu equipo…', 'chat-empty'));
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
  if (mine) {
    nodes.push(element('p', 'Ya formas parte de este equipo. Tu lugar está guardado.'));
    const viewTeam = element('button', 'Ver mi equipo →', 'button primary team-open-button');
    viewTeam.id = 'view-my-team'; viewTeam.type = 'button';
    viewTeam.addEventListener('click', () => { homePanel(); setRoomTab('equipo'); $('#tab-equipo').focus(); });
    nodes.push(viewTeam);
  }
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
        renderTopics(); $('#view-my-team')?.focus(); status('Te uniste al equipo de ' + topic.name + '.');
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
function disconnectedMembers() {
  // Wait for a verified presence response before treating anyone as offline.
  if(presenceState!=='live')return [];
  const connected=new Set([profile?.id,...peers.map(peer=>peer.id)]);
  return assignedSeats.filter(member=>!connected.has(member.id));
}
function draw(time = 0) {
  const canvas = $('#world');
  const inRoom = $('#room').dataset.stage === 'room';
  if (!inRoom) { canvas.width = 800; canvas.height = 560; $('#room-map').style.aspectRatio = '10 / 7'; }
  if (!$('#room').hidden) drawWorld(canvas, { layout: inRoom ? layout : undefined, labels: false, actors: false,
    player: inRoom && profile ? { ...player, ...look, id:profile.id } : undefined,
    seated: inRoom ? disconnectedMembers() : [],
    seatCounts: inRoom ? topics.map(topic=>topic.members.length) : [],
    peers: inRoom ? peers : [], walking: path.length > 0, time,
    ambientTime: reducedMotion.matches ? 0 : Date.now(), reducedMotion: reducedMotion.matches });
}
async function refreshPresence() {
  if ($('#room').dataset.stage === 'room' && presenceVerifiedAt && Date.now() - presenceVerifiedAt > 15000) {
    peers = []; presenceState = 'reconnecting';
    $('#online-count').textContent = 'Reconectando…'; $('#online-count').dataset.state = presenceState;
    updateTeamPresence(); draw();
  }
  if (presenceLoading || document.hidden || !profile?.id || !courseId || $('#room').dataset.stage !== 'room') return;
  const currentCourseId = courseId, studentId = profile.id;
  presenceLoading = true;
  try {
    const nearby = await studentRpc('classroom_presence_ping', {
      p_course_id: currentCourseId, p_x: Math.round(player.x), p_y: Math.round(player.y),
      p_direction: player.direction
    });
    if (courseId !== currentCourseId || profile?.id !== studentId || $('#room').dataset.stage !== 'room') return;
    presenceVerifiedAt = Date.now(); presenceState = 'live';
    peers = (Array.isArray(nearby) ? nearby : []).filter(peer => peer.id !== studentId &&
      Number.isFinite(peer.x) && Number.isFinite(peer.y) && peer.x >= 28 && peer.x <= layout.width - 28 &&
      peer.y >= 28 && peer.y <= layout.height - 28);
    $('#online-count').textContent = `En el aula: ${peers.length + 1}`;
    $('#online-count').dataset.state = presenceState;
    $('#online-count').hidden = false;
    updateTeamPresence();
    draw();
  } catch (_) {
    if (courseId === currentCourseId && profile?.id === studentId && $('#room').dataset.stage === 'room') {
      presenceState = 'reconnecting';
      $('#online-count').textContent = 'Reconectando…'; $('#online-count').dataset.state = presenceState;
      $('#online-count').hidden = false; updateTeamPresence(); draw();
    }
  } finally { presenceLoading = false; }
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
  if (event.key === 'Escape' && $('#room').dataset.stage === 'avatar' && avatarReturn) {
    event.preventDefault(); returnFromAvatar(); return;
  }
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
  if (document.hidden) { stopAnimation(); stopAmbientAnimation(); }
  else if (!$('#room').hidden) { path = []; draw(); refreshPresence(); if (profile?.topicId) refreshChat(); }
  updateAmbientAnimation();
});
window.addEventListener('pagehide', () => { stopAnimation(); stopAmbientAnimation(); });
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { stopAnimation(); path = []; onArrival = null; }
  draw(); updateAmbientAnimation();
});
function stopRoomPolling() {
  stopAmbientAnimation();
  incomingMessages.reset();
  clearTimeout(arrivalHighlightTimer);
  arrivalHighlightTimer = 0;
  $('#chat-alert').classList.remove('chat-just-arrived');
  clearInterval(chatTimer); clearInterval(roomRefresh); clearInterval(presenceTimer);
  chatTimer = roomRefresh = presenceTimer = 0;
  peers = [];
  presenceVerifiedAt = 0; presenceState = 'pending'; avatarReturn = null;
  assignedSeats = [];
  renderedTopicOrder = '';
  $('#online-count').hidden = true;
  renderChatNotice(0);
}
$('#logout').addEventListener('click', () => {
  if (!confirm('Al salir perderás el acceso a este perfil desde este dispositivo. ¿Deseas continuar?')) return;
  studentSignOut(); localStorage.removeItem('aula-student-course-code');
  localStorage.removeItem('aula-student-resume-id');
  localStorage.removeItem('aula-student-recovery-code');
  localStorage.removeItem('aula-student-document-recovery');
  stopRoomPolling(); chatTeamId = '';
  $('#team-chat-host').hidden = true;
  $('#team-chat-host').replaceChildren();
  courseId = ''; courseName = ''; profile = null; topics = []; selectedTopic = null;
  completingDocument = false;
  registrationForm.reset(); documentType.value='cedula'; updateDocumentInput(true); questions = ['code', 'firstName', 'lastName', 'documentNumber', 'email', 'phone'];
  questionIndex = 0; renderQuestion();
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
    clearTimeout(arrivalHighlightTimer);
    $('#chat-alert').classList.remove('chat-just-arrived');
    const box = $('#team-chat-messages');
    const firstOpen = box && !box.dataset.opened;
    if (firstOpen) { box.dataset.opened = 'true'; box.scrollTop = box.scrollHeight; }
    refreshChat(firstOpen);
  }
  else if (name === 'aula') draw();
  updateAmbientAnimation();
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
  const currentCourseId = courseId, studentId = profile?.id;
  const stillCurrent = () => courseId === currentCourseId && profile?.id === studentId && $('#room').dataset.stage === 'room';
  refreshingRoom = true;
  try {
    const [rows, currentProfile] = await Promise.all([studentRpc('course_room', {p_course_id:currentCourseId}), studentRpc('my_profile',{p_course_id:currentCourseId})]);
    if (!stillCurrent()) return;
    const ordered = sortTopics(rows);
    if (JSON.stringify(ordered) !== JSON.stringify(topics) || currentProfile.topicId !== profile.topicId || currentProfile.registrationOpen !== profile.registrationOpen) {
      topics = ordered; profile = currentProfile; renderTopics();
    }
  } catch (error) {
    if (!stillCurrent()) return;
    if (error.message === 'Materia deshabilitada') {
      stopRoomPolling();
      courseId = ''; courseName = ''; profile = null; topics = [];
      localStorage.removeItem('aula-student-course-code');
      localStorage.removeItem('aula-student-resume-id');
      localStorage.removeItem('aula-student-recovery-code');
      questions = ['code', 'firstName', 'lastName', 'documentNumber', 'email', 'phone']; questionIndex = 0;
      registrationForm.elements.namedItem('code').value = '';
      show('registration'); renderQuestion();
      message('Esta materia ya no está disponible. Pide al docente un código vigente.');
    }
    // A temporary disconnect leaves the current classroom usable.
  }
  finally { refreshingRoom = false; }
}

