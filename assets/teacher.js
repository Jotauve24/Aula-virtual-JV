import './embed.js?v=20261012a';
import { configured, sendCode, googleAvailable, signInWithGoogle, rpc, signedIn, signOut, deleteTeacherCourseFiles } from './supabase-client.js?v=20261013d';
import { allCoursesCsv } from './teacher-export.js?v=20261013b';
const $ = selector => document.querySelector(selector);
let email = '', courseId = '', overview = null;
function show(id) { for (const name of ['login','verify','dashboard','detail']) $(`#${name}`).hidden = name !== id; }
function alertError(value) { $('#error').textContent = value; $('#error').hidden = !value; }
async function run(task) { alertError(''); try { await task(); } catch (error) { alertError(error.message); } }
function newCourseCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(15));
  const part = Array.from(bytes, n => chars[n % chars.length]).join('');
  return `MAT-${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10)}`;
}
if (!configured) { show('login'); $('#login').hidden = true; $('#setup').hidden = false; }
else if (signedIn()) run(loadCourses); else show('login');
if (configured) googleAvailable().then(available => { $('#google-login').hidden = !available; }).catch(() => {});
$('#google-login').addEventListener('click', signInWithGoogle);
$('#login').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  email = event.target.elements.email.value.trim().toLowerCase(); await sendCode(email);
  show('verify'); $('#notice').textContent = 'Revisa el correo docente y abre el enlace de ingreso en este navegador.';
}); });
async function loadCourses() {
  const [courses, disabled] = await Promise.all([rpc('my_courses'), rpc('teacher_disabled_courses')]);
  show('dashboard');
  $('#export-all').disabled = !courses.length && !disabled.length;
  const list = $('#courses');
  if (!courses.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = 'Todavía no tienes materias. Crea la primera para obtener su código.';
    list.replaceChildren(empty);
  } else list.replaceChildren(...courses.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(course => {
    const button = document.createElement('button'); button.className = 'course-card'; button.type = 'button';
    const title = document.createElement('strong'); title.textContent = course.name;
    const meta = document.createElement('small');
    meta.textContent = `${course.student_count} estudiantes · ${course.topic_count} temas · Abrir materia →`;
    button.append(title, meta);
    button.addEventListener('click', () => run(() => openCourse(course.id))); return button;
  }));
  $('#disabled-area').hidden = !disabled.length;
  $('#disabled-courses').replaceChildren(...disabled.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(course => {
    const card = document.createElement('article'); card.className = 'course-card disabled-course-card';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'course-card-link';
    const title = document.createElement('strong'); title.textContent = course.name;
    const meta = document.createElement('small');
    meta.textContent = `${course.student_count} estudiantes · ${course.topic_count} temas · Código inactivo · Ver materia →`;
    open.append(title, meta); open.addEventListener('click', () => run(() => openCourse(course.id)));
    const actions = document.createElement('div'); actions.className = 'disabled-course-actions';
    const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'secondary';
    restore.textContent = 'Restaurar';
    restore.addEventListener('click', () => run(async () => {
      restore.disabled = true;
      try { await rpc('teacher_set_course_active', { p_course_id: course.id, p_active: true });
        await loadCourses(); teacherSuccess('Materia restaurada. Su código vuelve a funcionar.'); }
      finally { restore.disabled = false; }
    }));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-outline';
    remove.textContent = 'Eliminar'; remove.addEventListener('click', () => openDeleteCourse({ ...course, active: false }));
    actions.append(restore, remove); card.append(open, actions); return card;
  }));
}
$('#new-course').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const submit = event.target.querySelector('button[type="submit"]'); submit.disabled = true;
  try {
    const code = newCourseCode();
    await rpc('create_course_with_groups', { p_name: event.target.elements.namedItem('name').value.trim(), p_code: code,
      p_count: Number(event.target.elements.namedItem('groups').value), p_capacity: Number(event.target.elements.namedItem('capacity').value) });
    event.target.reset(); await loadCourses();
    $('#new-code').textContent = `Código de la materia: ${code}. Puedes volver a consultarlo al abrir la materia.`;
    $('#new-code').hidden = false;
  } finally { submit.disabled = false; }
}); });
async function openCourse(id) {
  courseId = id; overview = await rpc('teacher_overview', { p_course_id: id });
  overview.topics.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  $('#group-count').value = overview.topics.length; updateGroupPreview();
  show('detail'); $('#course-title').textContent = overview.course.name;
  $('#course-summary').textContent = `${overview.students.length} estudiantes · ${overview.topics.length} temas`;
  renderCourseCode();
  const active = overview.course.active;
  $('.course-management').dataset.active = String(active);
  $('.course-code-panel').dataset.active = String(active);
  $('#course-state-label').textContent = active ? 'Materia activa' : 'Materia deshabilitada';
  $('#course-state-description').textContent = active
    ? 'El código permite ingresar al aula.'
    : 'No aparece entre las materias activas. El código y el acceso de estudiantes están bloqueados.';
  $('#toggle-course').textContent = active ? 'Deshabilitar materia' : 'Restaurar materia';
  $('#registration').hidden = !active;
  $('#new-topic').hidden = !active;
  $('#group-count-form').hidden = !active;
  $('#generate-course-code').hidden = !active;
  if (!active) $('#course-code-status').textContent = 'Código deshabilitado. Volverá a funcionar si restauras la materia.';
  if (!overview.topics.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = 'Aún no hay temas. Añade uno para que los estudiantes puedan elegir equipo.';
    $('#topic-list').replaceChildren(empty);
  } else $('#topic-list').replaceChildren(...overview.topics.map(topic => {
    const card = document.createElement('article'); card.className = 'topic-card';
    const title = document.createElement('h3'); title.textContent = topic.name;
    const capacity = document.createElement('small'); capacity.textContent = `${topic.capacity} cupos`;
    const instructions = document.createElement('p'); instructions.textContent = topic.instructions || 'Sin indicaciones todavía.';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary'; edit.textContent = 'Editar tema y cupos';
    edit.addEventListener('click', () => editTopic(topic));
    edit.hidden = !active;
    card.append(title, capacity, instructions, edit); return card;
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
      if (group.id && active) {
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
$('#export-all').addEventListener('click', () => run(async () => {
  const button = $('#export-all');
  button.disabled = true; button.textContent = 'Preparando todas las materias…';
  try {
    // Refresh both lists so newly created, disabled or restored courses are included.
    const [active, disabled] = await Promise.all([rpc('my_courses'), rpc('teacher_disabled_courses')]);
    const courses = [...new Map([...active, ...disabled].map(course => [course.id, course])).values()];
    if (!courses.length) { teacherSuccess('Todavía no hay materias para descargar.'); return; }
    const overviews = [];
    for (let start = 0; start < courses.length; start += 4) {
      const batch = await Promise.all(courses.slice(start, start + 4).map(course =>
        rpc('teacher_overview', { p_course_id: course.id })));
      if (batch.some(item => !item?.course || !Array.isArray(item.students) || !Array.isArray(item.topics)))
        throw new Error('No se pudo preparar el listado completo. Inténtalo de nuevo.');
      overviews.push(...batch);
    }
    const total = overviews.reduce((count, item) => count + item.students.length, 0);
    if (!total) { teacherSuccess('Tus materias todavía no tienen estudiantes registrados.'); return; }
    const blob = new Blob([allCoursesCsv(overviews)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'Estudiantes_todas_las_materias.csv';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    teacherSuccess(`Listo: ${total} estudiantes de ${courses.length} materias en un solo archivo.`);
  } finally { button.disabled = false; button.textContent = '↓ Descargar estudiantes de todas las materias'; }
}));
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
$('#toggle-course').addEventListener('click', () => run(async () => {
  const active = overview.course.active;
  if (active && !confirm('¿Deshabilitar esta materia? Desaparecerá de las materias activas y sus estudiantes no podrán entrar con el código ni usar el aula. Puedes restaurarla después.')) return;
  const button = $('#toggle-course'); button.disabled = true;
  try {
    await rpc('teacher_set_course_active', { p_course_id: courseId, p_active: !active });
    await loadCourses();
    teacherSuccess(active ? 'Materia deshabilitada. El código ya no permite ingresar.'
      : 'Materia restaurada. Su código vuelve a funcionar.');
  } finally { button.disabled = false; }
}));
$('#delete-course').addEventListener('click', () => openDeleteCourse({ ...overview.course,
  student_count: overview.students.length, topic_count: overview.topics.length }));
$('#back').addEventListener('click', () => run(loadCourses));
$('#logout').addEventListener('click', () => { signOut(); show('login'); });

let deleteTarget = null, deletingCourse = false;
function openDeleteCourse(course) {
  deleteTarget = course;
  $('#delete-course-name').textContent = course.name;
  $('#delete-course-counts').textContent = `${course.student_count} estudiantes · ${course.topic_count} equipos. También se eliminarán los mensajes y archivos.`;
  $('#delete-course-confirmation').value = '';
  $('#confirm-course-delete').disabled = true;
  $('#delete-course-progress').textContent = '';
  $('#delete-course-error').hidden = true;
  $('#delete-course-dialog').showModal();
  $('#delete-course-confirmation').focus();
}
$('#delete-course-confirmation').addEventListener('input', event => {
  $('#confirm-course-delete').disabled = deletingCourse || event.target.value.trim() !== deleteTarget?.name;
});
$('#delete-course-dialog').addEventListener('cancel', event => { if (deletingCourse) event.preventDefault(); });
$('#cancel-course-delete').addEventListener('click', () => {
  if (deletingCourse) return;
  $('#delete-course-dialog').close(); deleteTarget = null;
  run(loadCourses);
});
$('#delete-course-form').addEventListener('submit', async event => {
  event.preventDefault();
  const course = deleteTarget;
  if (!course || deletingCourse || $('#delete-course-confirmation').value.trim() !== course.name) return;
  deletingCourse = true;
  const submit = $('#confirm-course-delete'); submit.disabled = true;
  $('#cancel-course-delete').disabled = true;
  $('#delete-course-confirmation').disabled = true;
  $('#delete-course-error').hidden = true;
  const progress = $('#delete-course-progress');
  try {
    if (course.active) {
      progress.textContent = 'Deshabilitando el acceso…';
      await rpc('teacher_set_course_active', { p_course_id: course.id, p_active: false });
      course.active = false;
    }
    progress.textContent = 'Revisando archivos de la materia…';
    const paths = await rpc('teacher_course_file_paths', { p_course_id: course.id });
    progress.textContent = paths.length ? `Eliminando ${paths.length} archivos…` : 'Eliminando materia y estudiantes…';
    await deleteTeacherCourseFiles(course.id, paths);
    progress.textContent = 'Eliminando materia y estudiantes…';
    await rpc('teacher_delete_course', { p_course_id: course.id });
    $('#delete-course-dialog').close(); deleteTarget = null;
    try { await loadCourses(); teacherSuccess('Materia eliminada. Su código dejó de funcionar.'); }
    catch { alertError('La materia fue eliminada, pero no se pudo actualizar la lista. Recarga el panel.'); }
  } catch (error) {
    progress.textContent = '';
    $('#delete-course-error').textContent = (course.active ? '' : 'La materia está deshabilitada. Puedes reintentar la eliminación. ') + error.message;
    $('#delete-course-error').hidden = false;
  } finally {
    deletingCourse = false;
    $('#cancel-course-delete').disabled = false;
    $('#delete-course-confirmation').disabled = false;
    submit.disabled = !deleteTarget || $('#delete-course-confirmation').value.trim() !== deleteTarget.name;
  }
});

function renderCourseCode() {
  const code = overview.course.accessCode;
  $('#course-code-saved').hidden = !code;
  $('#course-code-missing').hidden = !!code;
  $('#course-access-code').value = code || '';
  $('#course-code-status').textContent = '';
}
$('#copy-course-code').addEventListener('click', async () => {
  const field = $('#course-access-code');
  if (!field.value) return;
  try {
    await navigator.clipboard.writeText(field.value);
    $('#course-code-status').textContent = 'Código copiado. Ya puedes compartirlo con tu clase.';
  } catch {
    field.focus(); field.select();
    $('#course-code-status').textContent = 'El código está seleccionado. Usa Copiar o Ctrl+C (⌘C en Mac).';
  }
});
$('#generate-course-code').addEventListener('click', () => {
  if (!confirm('¿Generar un código nuevo para esta materia? El código anterior dejará de servir. Comparte el nuevo con tus estudiantes; sus perfiles y equipos se conservarán.')) return;
  run(async () => {
    const button = $('#generate-course-code'), id = courseId;
    button.disabled = true;
    try {
      const code = await rpc('teacher_generate_course_code', { p_course_id:id, p_code:newCourseCode() });
      if (courseId !== id) return;
      overview.course.accessCode = code; renderCourseCode();
      $('#course-code-status').textContent = 'Código guardado. Lo encontrarás aquí cada vez que abras la materia.';
    } finally { button.disabled = false; }
  });
});


function updateGroupPreview() {
  if (!overview) return;
  const count = Number($('#group-count').value), current = overview.topics.length;
  const empty = overview.topics.filter(t => !overview.students.some(s => s.topicId === t.id)).reverse();
  $('#group-count-preview').textContent = count < current
    ? empty.length < current-count ? 'Primero libera los integrantes de los grupos que quieras retirar.'
      : 'Se retirarán estas mesas vacías: ' + empty.slice(0,current-count).map(t=>t.name).join(', ') + '.'
    : count > current ? 'Se crearán ' + (count-current) + ' mesas nuevas.' : 'El aula tiene ' + current + ' mesas.';
}
$('#group-count').addEventListener('input', updateGroupPreview);
$('#group-count-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const button = event.target.querySelector('button'); button.disabled = true;
  try { await rpc('teacher_set_group_count', { p_course_id: courseId,
    p_count: Number($('#group-count').value), p_capacity: Number($('#new-group-capacity').value) });
    await openCourse(courseId); teacherSuccess('La cantidad de mesas quedó guardada.');
  } finally { button.disabled = false; }
}); });
let editingTopicId = '';
function editTopic(topic) {
  editingTopicId = topic.id;
  const form = $('#edit-topic-form');
  form.elements.namedItem('name').value = topic.name;
  form.elements.namedItem('instructions').value = topic.instructions;
  form.elements.namedItem('capacity').value = topic.capacity;
  $('#edit-topic-error').hidden = true; $('#edit-topic-dialog').showModal();
}
$('#cancel-topic-edit').addEventListener('click', () => $('#edit-topic-dialog').close());
$('#edit-topic-form').addEventListener('submit', async event => {
  event.preventDefault(); const f = event.target.elements, button = event.target.querySelector('[type="submit"]');
  button.disabled = true; $('#edit-topic-error').hidden = true;
  try { await rpc('teacher_edit_topic', { p_course_id: courseId, p_topic_id: editingTopicId,
    p_name: f.namedItem('name').value.trim(), p_instructions: f.namedItem('instructions').value.trim(),
    p_capacity: Number(f.namedItem('capacity').value) });
    $('#edit-topic-dialog').close(); await openCourse(courseId); teacherSuccess('Tema y cupos actualizados.');
  } catch(error) { $('#edit-topic-error').textContent = error.message; $('#edit-topic-error').hidden = false; }
  finally { button.disabled = false; }
});
function teacherSuccess(text) {
  $('#teacher-success').textContent = text; $('#teacher-success').hidden = false;
  setTimeout(() => { $('#teacher-success').hidden = true; }, 6000);
}
