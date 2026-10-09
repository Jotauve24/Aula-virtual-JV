import { configured, signInStudentAnonymously, studentRpc, studentSignedIn, studentSignOut } from './supabase-client.js';
const $ = selector => document.querySelector(selector);
const sections = ['registration', 'avatar', 'room'];
let courseId = '', profile = null;
function show(id) {
  for (const name of sections) $(`#${name}`).hidden = name !== id;
  $('#logout').hidden = !studentSignedIn();
}
function message(value) { $('#error').textContent = value; $('#error').hidden = !value; }
async function run(task) { message(''); try { await task(); } catch (error) { message(error.message); } }
const savedCode = sessionStorage.getItem('aula-course-code');
if (savedCode) {
  $('#registration').elements.code.value = savedCode;
  sessionStorage.removeItem('aula-course-code');
}
if (!configured) { $('#registration').hidden = true; $('#setup').hidden = false; }
else {
  show('registration');
  const priorCode = localStorage.getItem('aula-student-course-code');
  if (studentSignedIn() && priorCode) {
    $('#registration').elements.code.value = priorCode;
    run(() => enterCourse(priorCode));
  }
}

async function enterCourse(code, details = {}) {
  const result = await studentRpc('enroll_student', { p_code: code, ...details });
  courseId = result.course_id;
  localStorage.setItem('aula-student-course-code', code);
  $('#notice').textContent = result.course_name;
  profile = await studentRpc('my_profile', { p_course_id: courseId });
  const avatar = profile.avatar || {};
  for (const [field, value] of Object.entries({ skin: avatar.skin ?? 1,
    shirt: avatar.shirt ?? 0, hair: avatar.hair ?? 'short' }))
    $('#avatar-form').elements[field].value = value;
  show(Object.keys(avatar).length ? 'room' : 'avatar');
  if (!$('#room').hidden) await renderRoom();
}

$('#registration').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const f = event.target.elements;
  const code = f.code.value.trim().toUpperCase();
  const email = f.email.value.trim().toLowerCase();
  const firstName = f.firstName.value.trim(), lastName = f.lastName.value.trim();
  const phone = f.phone.value.trim();
  if (!/^\+?[0-9 -]{7,20}$/.test(phone) || (phone.match(/\d/g) || []).length < 7)
    throw new Error('Revisa el número de teléfono.');
  await signInStudentAnonymously();
  await enterCourse(code, { p_email: email, p_first_name: firstName,
    p_last_name: lastName, p_phone: phone });
}); });

$('#avatar-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const f = event.target.elements;
  await studentRpc('save_student_avatar', { p_course_id: courseId,
    p_avatar: { skin: Number(f.skin.value), shirt: Number(f.shirt.value), hair: f.hair.value } });
  profile = await studentRpc('my_profile', { p_course_id: courseId });
  show('room'); await renderRoom();
}); });

async function renderRoom() {
  const topics = await studentRpc('course_room', { p_course_id: courseId });
  $('#topics').replaceChildren(...topics.map(topic => {
    const card = document.createElement('article'); card.className = 'topic';
    const title = document.createElement('h3'); title.textContent = topic.name;
    const detail = document.createElement('p'); detail.textContent = `${topic.instructions} · ${topic.members.length}/${topic.capacity} integrantes`;
    const names = document.createElement('p'); names.textContent = topic.members.map(m => m.name).join(', ') || 'Sin integrantes aún';
    const button = document.createElement('button'); button.textContent = profile.topicId === topic.id ? 'Tu equipo' : 'Unirme a este tema';
    button.disabled = !!profile.topicId || !profile.registrationOpen || topic.members.length >= topic.capacity;
    button.addEventListener('click', () => run(async () => {
      if (!confirm(`¿Confirmas que quieres unirte a ${topic.name}?`)) return;
      await studentRpc('choose_topic', { p_course_id: courseId, p_topic_id: topic.id });
      profile = await studentRpc('my_profile', { p_course_id: courseId }); await renderRoom();
    }));
    card.append(title, detail, names, button); return card;
  }));
}
$('#logout').addEventListener('click', () => {
  if (!confirm('Al salir perderás el acceso a este perfil desde este dispositivo. ¿Deseas continuar?')) return;
  studentSignOut(); localStorage.removeItem('aula-student-course-code');
  courseId = ''; profile = null; $('#notice').textContent = 'Entra con el código de tu materia y registra tus datos.';
  show('registration');
});
