import { configured, sendCode, googleAvailable, signInWithGoogle, rpc, signedIn, signOut } from './supabase-client.js';
const $ = selector => document.querySelector(selector);
let email = '', courseId = '', overview = null;
function show(id) { for (const name of ['login','verify','dashboard','detail']) $(`#${name}`).hidden = name !== id; }
function alertError(value) { $('#error').textContent = value; $('#error').hidden = !value; }
async function run(task) { alertError(''); try { await task(); } catch (error) { alertError(error.message); } }
if (!configured) { show('login'); $('#login').hidden = true; $('#setup').hidden = false; }
else if (signedIn()) run(loadCourses); else show('login');
if (configured) googleAvailable().then(available => { $('#google-login').hidden = !available; }).catch(() => {});
$('#google-login').addEventListener('click', signInWithGoogle);
$('#login').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  email = event.target.elements.email.value.trim().toLowerCase(); await sendCode(email);
  show('verify'); $('#notice').textContent = 'Revisa el correo docente y abre el enlace de ingreso en este navegador.';
}); });
async function loadCourses() {
  const courses = await rpc('my_courses'); show('dashboard');
  const list = $('#courses'); list.replaceChildren(...courses.map(course => {
    const button = document.createElement('button'); button.className = 'topic';
    button.textContent = `${course.name} · ${course.student_count} estudiantes · ${course.topic_count} temas`;
    button.addEventListener('click', () => run(() => openCourse(course.id))); return button;
  }));
}
$('#new-course').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(15));
  const part = Array.from(bytes, n => chars[n % chars.length]).join('');
  const code = `MAT-${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10)}`;
  await rpc('create_course', { p_name: event.target.elements.name.value.trim(), p_code: code });
  event.target.reset(); await loadCourses();
  $('#new-code').textContent = `Guarda este código ahora; se muestra una sola vez: ${code}`;
  $('#new-code').hidden = false;
}); });
async function openCourse(id) {
  courseId = id; overview = await rpc('teacher_overview', { p_course_id: id });
  show('detail'); $('#course-title').textContent = overview.course.name;
  $('#course-summary').textContent = `${overview.students.length} estudiantes · ${overview.topics.length} temas`;
  $('#topic-list').replaceChildren(...overview.topics.map(topic => {
    const p = document.createElement('p'); p.textContent = `${topic.name} · ${topic.capacity} cupos · ${topic.instructions}`; return p;
  }));
  $('#student-list').replaceChildren(...overview.students.map(student => {
    const p = document.createElement('p'); p.textContent = `${student.lastName}, ${student.firstName} · ${student.email || 'Sin correo'} · ${student.phone || 'Sin teléfono'} · ${student.topicId ? 'Con equipo' : 'Sin equipo'}`; return p;
  }));
  $('#registration').textContent = overview.course.registrationOpen ? 'Cerrar inscripción' : 'Abrir inscripción';
}
$('#new-topic').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const f = event.target.elements;
  await rpc('teacher_add_topic', { p_course_id: courseId, p_name: f.name.value.trim(),
    p_instructions: f.instructions.value.trim(), p_capacity: Number(f.capacity.value) });
  event.target.reset(); await openCourse(courseId);
}); });
$('#registration').addEventListener('click', () => run(async () => {
  await rpc('teacher_set_registration', { p_course_id: courseId, p_open: !overview.course.registrationOpen }); await openCourse(courseId);
}));
$('#back').addEventListener('click', () => run(loadCourses));
$('#logout').addEventListener('click', () => { signOut(); show('login'); });
