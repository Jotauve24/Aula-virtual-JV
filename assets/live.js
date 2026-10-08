import { configured, sendCode, rpc, signedIn, signOut } from './supabase-client.js';
const $ = selector => document.querySelector(selector);
const sections = ['login','verify','course','pending','profile','room'];
let email = '', courseId = '', profile = null;
function show(id) { for (const name of sections) $(`#${name}`).hidden = name !== id; $('#logout').hidden = !signedIn(); }
function message(value) { $('#error').textContent = value; $('#error').hidden = !value; }
async function run(task) { message(''); try { await task(); } catch (error) { message(error.message); } }
if (!configured) { for (const id of sections) $(`#${id}`).hidden = true; $('#setup').hidden = false; }
else show(signedIn() ? 'course' : 'login');
const savedCode = sessionStorage.getItem('aula-course-code');
if (savedCode) { $('#course').elements.code.value = savedCode; sessionStorage.removeItem('aula-course-code'); }
$('#login').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  email = event.target.elements.email.value.trim().toLowerCase();
  await sendCode(email); show('verify'); $('#notice').textContent = 'Revisa tu correo y abre el enlace de ingreso. Luego escribe el código de la materia.';
}); });
$('#course').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const result = await rpc('request_course', { p_code: event.target.elements.code.value.trim() });
  courseId = result.course_id; $('#notice').textContent = result.course_name;
  if (result.status === 'pending') { show('pending'); return; }
  profile = await rpc('my_profile', { p_course_id: courseId });
  const form = $('#profile-form');
  for (const [field, value] of Object.entries({ firstName: profile.firstName, lastName: profile.lastName,
    nationalId: profile.nationalId, phone: profile.phone,
    skin: profile.avatar?.skin ?? 1, shirt: profile.avatar?.shirt ?? 0,
    hair: profile.avatar?.hair ?? 'short' })) form.elements[field].value = value ?? '';
  show(profile.phone && profile.nationalId ? 'room' : 'profile');
  if (!$('#room').hidden) await renderRoom();
}); });
$('#profile-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const f = event.target.elements, phone = f.phone.value.trim();
  if (!/^\d{4}-\d{4}$/.test(phone)) throw new Error('El teléfono debe tener el formato XXXX-XXXX.');
  await rpc('save_my_profile', { p_course_id: courseId, p_first_name: f.firstName.value.trim(),
    p_last_name: f.lastName.value.trim(), p_national_id: f.nationalId.value.trim(), p_phone: phone,
    p_avatar: { skin: Number(f.skin.value), shirt: Number(f.shirt.value), hair: f.hair.value } });
  profile = await rpc('my_profile', { p_course_id: courseId }); show('room'); await renderRoom();
}); });
async function renderRoom() {
  const topics = await rpc('course_room', { p_course_id: courseId });
  $('#topics').replaceChildren(...topics.map(topic => {
    const card = document.createElement('article'); card.className = 'topic';
    const title = document.createElement('h3'); title.textContent = topic.name;
    const detail = document.createElement('p'); detail.textContent = `${topic.instructions} · ${topic.members.length}/${topic.capacity} integrantes`;
    const names = document.createElement('p'); names.textContent = topic.members.map(m => m.name).join(', ') || 'Sin integrantes aún';
    const button = document.createElement('button'); button.textContent = profile.topicId === topic.id ? 'Tu equipo' : 'Unirme a este tema';
    button.disabled = !!profile.topicId || !profile.registrationOpen || topic.members.length >= topic.capacity;
    button.addEventListener('click', () => run(async () => {
      if (!confirm(`¿Confirmas que quieres unirte a ${topic.name}?`)) return;
      await rpc('choose_topic', { p_course_id: courseId, p_topic_id: topic.id });
      profile = await rpc('my_profile', { p_course_id: courseId }); await renderRoom();
    }));
    card.append(title, detail, names, button); return card;
  }));
}
$('#logout').addEventListener('click', () => { signOut(); courseId = ''; profile = null; show('login'); });
