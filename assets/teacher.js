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
  const list = $('#courses');
  if (!courses.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = 'Todavía no tienes materias. Crea la primera para obtener su código.';
    list.replaceChildren(empty); return;
  }
  list.replaceChildren(...courses.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(course => {
    const button = document.createElement('button'); button.className = 'course-card'; button.type = 'button';
    const title = document.createElement('strong'); title.textContent = course.name;
    const meta = document.createElement('small');
    meta.textContent = `${course.student_count} estudiantes · ${course.topic_count} temas · Abrir materia →`;
    button.append(title, meta);
    button.addEventListener('click', () => run(() => openCourse(course.id))); return button;
  }));
}
$('#new-course').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const submit = event.target.querySelector('button[type="submit"]'); submit.disabled = true;
  try {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(15));
    const part = Array.from(bytes, n => chars[n % chars.length]).join('');
    const code = `MAT-${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10)}`;
    await rpc('create_course', { p_name: event.target.elements.namedItem('name').value.trim(), p_code: code });
    event.target.reset(); await loadCourses();
    $('#new-code').textContent = `Guarda y comparte este código con la clase; se muestra una sola vez: ${code}`;
    $('#new-code').hidden = false;
  } finally { submit.disabled = false; }
}); });
async function openCourse(id) {
  courseId = id; overview = await rpc('teacher_overview', { p_course_id: id });
  overview.topics.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  show('detail'); $('#course-title').textContent = overview.course.name;
  $('#course-summary').textContent = `${overview.students.length} estudiantes · ${overview.topics.length} temas`;
  if (!overview.topics.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = 'Aún no hay temas. Añade uno para que los estudiantes puedan elegir equipo.';
    $('#topic-list').replaceChildren(empty);
  } else $('#topic-list').replaceChildren(...overview.topics.map(topic => {
    const card = document.createElement('article'); card.className = 'topic-card';
    const title = document.createElement('h3'); title.textContent = topic.name;
    const capacity = document.createElement('small'); capacity.textContent = `${topic.capacity} cupos`;
    const instructions = document.createElement('p'); instructions.textContent = topic.instructions || 'Sin indicaciones todavía.';
    card.append(title, capacity, instructions); return card;
  }));
  const groups = [...overview.topics.map(topic => ({ id: topic.id, name: topic.name, capacity: topic.capacity })),
    { id: null, name: 'Sin equipo', capacity: null }];
  $('#student-list').replaceChildren(...groups.map(group => {
    const students = overview.students.filter(student => student.topicId === group.id)
      .sort((a, b) => (a.lastName + ' ' + a.firstName).localeCompare(b.lastName + ' ' + b.firstName, 'es'));
    const card = document.createElement('section'); card.className = 'teacher-group';
    const heading = document.createElement('div'); heading.className = 'teacher-group-heading';
    const title = document.createElement('h4'); title.textContent = group.name;
    const count = document.createElement('span'); count.textContent = group.capacity === null
      ? `${students.length} pendientes` : `${students.length} de ${group.capacity} integrantes`;
    heading.append(title, count); card.append(heading);
    if (!students.length) {
      const empty = document.createElement('p'); empty.textContent = group.id ? 'Aún no hay estudiantes en este grupo.' : 'Todos eligieron un equipo.';
      card.append(empty);
    }
    for (const student of students) {
      const row = document.createElement('div'); row.className = 'teacher-student';
      const name = document.createElement('strong'); name.textContent = `${student.lastName}, ${student.firstName}`;
      const contact = document.createElement('span'); contact.textContent = [student.email || 'Sin correo', student.phone || 'Sin teléfono'].join(' · ');
      row.append(name, contact);
      if (group.id) {
        const release = document.createElement('button'); release.type = 'button';
        release.className = 'button secondary'; release.textContent = 'Liberar del grupo';
        release.addEventListener('click', () => {
          if (!confirm(`¿Liberar a ${student.firstName} ${student.lastName} de ${group.name}? Podrá elegir otro equipo.`)) return;
          run(async () => { release.disabled = true;
            try { await rpc('teacher_release_student', { p_course_id: courseId, p_student_id: student.id }); await openCourse(courseId); }
            finally { release.disabled = false; }
          });
        });
        row.append(release);
      }
      card.append(row);
    }
    return card;
  }));
  $('#registration').textContent = overview.course.registrationOpen ? 'Cerrar inscripciones' : 'Abrir inscripciones';
  $('#registration').setAttribute('aria-label', (overview.course.registrationOpen ? 'Inscripciones abiertas. Cerrar' : 'Inscripciones cerradas. Abrir') + ' para ' + overview.course.name);
}
$('#new-topic').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const submit = event.target.querySelector('button[type="submit"]'); submit.disabled = true;
  try {
    const f = event.target.elements;
    await rpc('teacher_add_topic', { p_course_id: courseId, p_name: f.namedItem('name').value.trim(),
      p_instructions: f.namedItem('instructions').value.trim(), p_capacity: Number(f.namedItem('capacity').value) });
    event.target.reset(); await openCourse(courseId);
  } finally { submit.disabled = false; }
}); });
$('#registration').addEventListener('click', () => run(async () => {
  const button = $('#registration'); button.disabled = true;
  try { await rpc('teacher_set_registration', { p_course_id: courseId, p_open: !overview.course.registrationOpen }); await openCourse(courseId); }
  finally { button.disabled = false; }
}));
$('#back').addEventListener('click', () => run(loadCourses));
$('#logout').addEventListener('click', () => { signOut(); show('login'); });
