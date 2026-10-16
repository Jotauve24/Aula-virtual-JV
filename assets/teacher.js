import './embed.js?v=20261012a';
import { configured, sendCode, googleAvailable, signInWithGoogle, rpc, signedIn, signOut, deleteTeacherCourseFiles } from './supabase-client.js?v=20261013d';
import { allCoursesXlsx } from './teacher-export.js?v=20261013c';
import { buildTeacherPresenceStats, presenceAgeLabel } from './teacher-live-model.js?v=20261015c';
const $ = selector => document.querySelector(selector);
let email = '', courseId = '', overview = null;
let courseRequestGeneration = 0;
let dashboardCourses = [], liveTimer = 0, liveGeneration = 0, liveRefreshing = false;
let liveRosterSnapshot = null, lastLiveFetch = 0;
function stopDashboardPresence() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = 0;
  liveGeneration++;
}
function show(id) {
  for (const name of ['login','verify','dashboard','detail']) $(`#${name}`).hidden = name !== id;
  if (id !== 'dashboard' && id !== 'detail') stopDashboardPresence();
}
function alertError(value) { $('#error').textContent = value; $('#error').hidden = !value; }
async function run(task) { alertError(''); try { await task(); } catch (error) { alertError(error.message); } }
function newCourseCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(15));
  const part = Array.from(bytes, n => chars[n % chars.length]).join('');
  return `MAT-${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10)}`;
}
if (!configured) { show('login'); $('#login').hidden = true; $('#setup').hidden = false; }
else if (signedIn()) run(async () => { await loadCourses(); const target = new URLSearchParams(location.search).get('materia');
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(target || '')) await openCourse(target);
}); else show('login');
if (configured) googleAvailable().then(available => { $('#google-login').hidden = !available; }).catch(() => {});
$('#google-login').addEventListener('click', signInWithGoogle);
$('#login').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  email = event.target.elements.email.value.trim().toLowerCase(); await sendCode(email);
  show('verify'); $('#notice').textContent = 'Revisa el correo docente y abre el enlace de ingreso en este navegador.';
}); });
async function loadCourses() {
  // An older dashboard fetch must not hide a more recently opened course.
  const requestId = ++courseRequestGeneration;
  const [courses, disabled] = await Promise.all([rpc('my_courses'), rpc('teacher_disabled_courses')]);
  if (requestId !== courseRequestGeneration || !signedIn()) return;
  show('dashboard');
  $('#export-all').disabled = !courses.length && !disabled.length;
  const list = $('#courses');
  if (!courses.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = 'Todavía no tienes materias. Crea la primera para obtener su código.';
    list.replaceChildren(empty);
  } else list.replaceChildren(...courses.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(course => {
    const card = document.createElement('article');
    card.className = 'course-card teacher-course-live-card';
    card.dataset.courseId = course.id;
    const button = document.createElement('button');
    button.className = 'teacher-course-open-main';
    button.type = 'button';
    button.setAttribute('aria-label', 'Administrar ' + course.name);
    const heading = document.createElement('div'); heading.className = 'teacher-course-heading';
    const title = document.createElement('strong'); title.textContent = course.name;
    const live = document.createElement('span'); live.className = 'teacher-course-live-pill'; live.dataset.online = 'pending';
    const dot = document.createElement('span'); dot.className = 'teacher-online-dot'; dot.setAttribute('aria-hidden', 'true');
    const liveLabel = document.createElement('span'); liveLabel.dataset.liveCourseId = course.id;
    liveLabel.textContent = '— en línea';
    live.append(dot, liveLabel); heading.append(title, live);
    const meta = document.createElement('div'); meta.className = 'teacher-course-meta';
    const students = document.createElement('span');
    const studentNumber = document.createElement('b'); studentNumber.textContent = String(course.student_count);
    students.append(studentNumber, document.createTextNode(' inscritos'));
    const topics = document.createElement('span'); topics.textContent = course.topic_count + ' grupos';
    const open = document.createElement('span'); open.className = 'teacher-course-open'; open.textContent = 'Administrar materia →';
    meta.append(students, topics, open); button.append(heading, meta);
    button.addEventListener('click', () => run(() => openCourse(course.id)));

    const details = document.createElement('details');
    details.className = 'teacher-course-presence'; details.dataset.rosterCourseId = course.id;
    const summary = document.createElement('summary');
    const summaryText = document.createElement('span'); summaryText.textContent = 'Ver estudiantes conectados';
    const summaryCount = document.createElement('span'); summaryCount.className = 'teacher-presence-summary-count';
    summaryCount.dataset.rosterCountId = course.id; summaryCount.textContent = 'Comprobando…';
    summary.append(summaryText, summaryCount);
    const roster = document.createElement('div'); roster.className = 'teacher-online-list';
    const idle = document.createElement('p'); idle.className = 'teacher-online-empty'; idle.textContent = 'Comprobando conexiones…';
    roster.append(idle);
    details.append(summary, roster);
    details.addEventListener('toggle', () => {
      if (details.open) renderCourseRoster(course.id, roster);
    });
    card.append(button, details);
    return card;
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
  dashboardCourses = courses;
  liveRosterSnapshot = null;
  $('#summary-active-courses').textContent = String(courses.length);
  $('#summary-enrolled').textContent = String(courses.reduce((total, row) => total + Number(row.student_count), 0));
  $('#summary-online').textContent = courses.length ? '—' : '0';
  $('#live-monitor-status').dataset.state = courses.length ? 'pending' : 'ready';
  $('#live-updated').textContent = courses.length ? 'Comprobando conexiones…' : 'Sin materias activas';
  $('#live-error').hidden = true;
  startDashboardPresence();
}
function startDashboardPresence() {
  stopDashboardPresence();
  if (!dashboardCourses.length) return;
  const generation = liveGeneration;
  const refresh = () => { if (generation === liveGeneration) void refreshDashboardPresence(generation); };
  liveTimer = setInterval(refresh, 5000);
  refresh();
}
function onlineStudentList(students, observedAt, fetchedAt) {
  const list = document.createElement('ul'); list.className = 'teacher-online-students';
  for (const student of students) {
    const row = document.createElement('li'); row.className = 'teacher-online-student';
    const initials = document.createElement('span'); initials.className = 'teacher-student-initials';
    initials.textContent = student.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    initials.setAttribute('aria-hidden', 'true');
    const identity = document.createElement('div'); identity.className = 'teacher-student-online-identity';
    const name = document.createElement('strong'); name.textContent = student.name;
    const group = document.createElement('small'); group.textContent = student.group || 'Sin equipo';
    identity.append(name, group);
    const last = document.createElement('time'); last.dateTime = student.seen_at;
    last.textContent = presenceAgeLabel(student.seen_at, observedAt, fetchedAt);
    last.title = 'Última señal de actividad';
    row.append(initials, identity, last); list.append(row);
  }
  return list;
}
function renderCourseRoster(id, host) {
  if (!host) return;
  if (!liveRosterSnapshot) {
    const text = document.createElement('p'); text.className = 'teacher-online-empty';
    text.textContent = 'Esperando datos de presencia…'; host.replaceChildren(text); return;
  }
  const students = liveRosterSnapshot.studentsByCourse.get(id) || [];
  if (!students.length) {
    if (host.dataset.rosterSignature === 'empty') return;
    const empty = document.createElement('p'); empty.className = 'teacher-online-empty';
    empty.textContent = 'No hay estudiantes conectados en esta materia.';
    host.replaceChildren(empty);
    host.dataset.rosterSignature = 'empty';
    return;
  }
  const observedAt = liveRosterSnapshot.observedAtByCourse.get(id);
  const signature = JSON.stringify(students.map(student => [student.id, student.name, student.group]));
  if (signature === host.dataset.rosterSignature) {
    const times = host.querySelectorAll('.teacher-online-student time');
    if (times.length === students.length) {
      students.forEach((student, index) => {
        times[index].dateTime = student.seen_at;
        times[index].textContent = presenceAgeLabel(student.seen_at, observedAt, lastLiveFetch);
      });
      return;
    }
  }
  host.replaceChildren(onlineStudentList(students, observedAt, lastLiveFetch));
  host.dataset.rosterSignature = signature;
}
function updateLiveRosterViews() {
  document.querySelectorAll('[data-roster-course-id]').forEach(details => {
    if (details.open) renderCourseRoster(details.dataset.rosterCourseId, details.querySelector('.teacher-online-list'));
  });
  if (!$('#detail').hidden) {
    const active = !!overview?.course?.active;
    $('#detail-live-panel').hidden = !active;
    if (active) {
      const id = overview.course.id;
      const count = liveRosterSnapshot?.byCourse.get(id);
      $('#detail-live-count').textContent = count === undefined ? '— en línea' : count + ' en línea';
      renderCourseRoster(id, $('#detail-online-list'));
    }
  }
}
function markPresenceUnavailable() {
  liveRosterSnapshot = null;
  document.querySelectorAll('.teacher-online-list').forEach(host => { delete host.dataset.rosterSignature; });
  $('#summary-online').textContent = '—';
  $('#live-monitor-status').dataset.state = 'error';
  $('#live-updated').textContent = 'Sin conexión · reintentando';
  document.querySelectorAll('[data-live-course-id]').forEach(label => {
    label.textContent = '— en línea';
    label.parentElement.dataset.online = 'pending';
  });
  document.querySelectorAll('[data-roster-count-id]').forEach(label => {
    label.textContent = 'Sin conexión';
  });
  document.querySelectorAll('.teacher-online-list').forEach(host => {
    const notice = document.createElement('p'); notice.className = 'teacher-online-empty';
    notice.textContent = 'La presencia no está disponible. Reintentando…'; host.replaceChildren(notice);
  });
  $('#detail-live-count').textContent = '— en línea';
  $('#live-error').textContent = 'La presencia en vivo no está disponible. Reintentaremos automáticamente sin interrumpir el panel.';
  $('#live-error').hidden = false;
}
async function refreshDashboardPresence(generation = liveGeneration) {
  if (liveRefreshing || document.hidden || ($('#dashboard').hidden && $('#detail').hidden) || !dashboardCourses.length) return;
  liveRefreshing = true;
  try {
    const rows = await rpc('teacher_live_course_counts');
    if (generation !== liveGeneration || ($('#dashboard').hidden && $('#detail').hidden)) return;
    const stats = buildTeacherPresenceStats(dashboardCourses, rows);
    liveRosterSnapshot = stats;
    lastLiveFetch = Date.now();
    $('#summary-online').textContent = String(stats.online);
    document.querySelectorAll('[data-live-course-id]').forEach(label => {
      const count = stats.byCourse.get(label.dataset.liveCourseId) ?? 0;
      label.textContent = count + ' en línea';
      label.parentElement.dataset.online = count > 0 ? 'true' : 'false';
    });
    document.querySelectorAll('[data-roster-count-id]').forEach(label => {
      const count = stats.byCourse.get(label.dataset.rosterCountId) ?? 0;
      label.textContent = count ? count + ' conectados' : 'Nadie conectado';
    });
    updateLiveRosterViews();
    $('#live-monitor-status').dataset.state = 'ready';
    const clock = new Intl.DateTimeFormat('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('#live-updated').textContent = 'Actualizado: ' + clock.format(new Date());
    $('#live-error').hidden = true;
  } catch (error) {
    if (generation === liveGeneration && (!$('#dashboard').hidden || !$('#detail').hidden)) markPresenceUnavailable();
  } finally { liveRefreshing = false; }
}
if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!$('#dashboard').hidden || !$('#detail').hidden)) void refreshDashboardPresence();
});
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
async function refreshStudentRecoveryRequests(id) {
  const panel = $('#student-recovery-panel'), host = $('#student-recovery-requests');
  if (!overview?.course?.active || overview.course.id !== id) {
    panel.hidden = true; return;
  }
  panel.hidden = false;
  try {
    const requests = await rpc('teacher_student_recovery_requests', {p_course_id:id});
    if (courseId !== id || $('#detail').hidden) return;
    $('#student-recovery-count').textContent = requests.length + (requests.length === 1 ? ' pendiente' : ' pendientes');
    if (!requests.length) {
      panel.hidden = true; host.replaceChildren(); return;
    }
    host.replaceChildren(...requests.map(request => {
      const item = document.createElement('article');
      item.className = 'student-recovery-request';
      const head = document.createElement('div'); head.className = 'student-recovery-head';
      const caption = document.createElement('strong'); caption.textContent = 'Acceso solicitado por '+request.email;
      const date = document.createElement('small');
      date.textContent = 'Solicitud: '+new Intl.DateTimeFormat('es-PA', {dateStyle:'medium'}).format(new Date(request.requested_at));
      head.append(caption,date);
      const info = document.createElement('p');
      info.textContent = 'Selecciona el perfil correcto y verifica la identidad del estudiante por una vía independiente antes de aprobar.';
      const label = document.createElement('label'); label.textContent = 'Estudiante que recuperará su cuenta';
      const select = document.createElement('select'); select.className = 'student-recovery-select';
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Seleccionar estudiante…';
      select.append(empty);
      const students = [...overview.students].sort((a,b) => {
        const ma = a.email?.trim().toLowerCase() === request.email.toLowerCase();
        const mb = b.email?.trim().toLowerCase() === request.email.toLowerCase();
        return Number(mb)-Number(ma) || (a.lastName+' '+a.firstName).localeCompare(b.lastName+' '+b.firstName,'es');
      });
      for (const student of students) {
        const option = document.createElement('option'); option.value = student.id;
        option.textContent = student.firstName+' '+student.lastName +
          (student.email?.trim().toLowerCase()===request.email.toLowerCase()?' · mismo correo':' · otro correo');
        select.append(option);
      }
      const caution = document.createElement('p'); caution.className = 'student-recovery-warning';
      caution.textContent = 'No apruebes únicamente por una coincidencia de correo: puede ser compartido.';
      const confirmLabel = document.createElement('label');
      confirmLabel.textContent = 'Escribe el nombre completo del estudiante para confirmar';
      const confirmation = document.createElement('input'); confirmation.type = 'text';
      confirmation.autocomplete = 'off'; confirmation.placeholder = 'Nombre y apellido';
      const actions = document.createElement('div'); actions.className = 'student-recovery-actions';
      const approve = document.createElement('button'); approve.type = 'button';
      approve.className = 'primary'; approve.textContent = 'Aprobar recuperación'; approve.disabled = true;
      const reject = document.createElement('button'); reject.type = 'button';
      reject.className = 'secondary'; reject.textContent = 'Rechazar';
      const error = document.createElement('p'); error.className = 'field-error';
      error.hidden = true; error.setAttribute('role','alert');
      const chosen = () => students.find(student => student.id === select.value);
      const fullName = student => (student.firstName+' '+student.lastName).trim();
      const update = () => {
        const student = chosen();
        approve.disabled = !student ||
          fullName(student).toLowerCase() !== confirmation.value.trim().toLowerCase();
      };
      select.addEventListener('change', update);
      confirmation.addEventListener('input', update);
      approve.addEventListener('click', async () => {
        const student = chosen();
        if (!student || approve.disabled) return;
        if (!confirm('¿Comprobaste personalmente que '+fullName(student)+' solicitó recuperar su cuenta? Su sesión anónima anterior dejará de funcionar.'))return;
        approve.disabled = true; reject.disabled = true; error.hidden = true;
        try {
          await rpc('teacher_decide_student_recovery', {
            p_request_id:request.id,p_student_id:student.id,
            p_expected_name:fullName(student),p_approve:true
          });
          teacherSuccess('Recuperación aprobada para '+fullName(student)+'. Su equipo y avatar siguen guardados.');
          await openCourse(id);
        }catch(err){
          error.textContent = err.message; error.hidden = false;
          reject.disabled = false;update();
        }
      });
      reject.addEventListener('click', async () => {
        if (!confirm('¿Rechazar esta solicitud de recuperación?'))return;
        reject.disabled = true;approve.disabled = true;error.hidden = true;
        try {
          await rpc('teacher_decide_student_recovery', {
            p_request_id:request.id,p_student_id:null,p_expected_name:'',p_approve:false
          });
          teacherSuccess('Solicitud rechazada. No se modificó ningún perfil.');
          await refreshStudentRecoveryRequests(id);
        }catch(err){error.textContent=err.message;error.hidden=false;reject.disabled=false;update();}
      });
      actions.append(approve,reject);
      item.append(head,info,label,select,caution,confirmLabel,confirmation,actions,error);
      return item;
    }));
  } catch(err) {
    if(courseId!==id) return;
    const node = document.createElement('p'); node.className='student-recovery-warning';
    node.textContent='No se pudieron consultar las solicitudes. Intenta actualizar la materia.';
    host.replaceChildren(node);
  }
}
async function openCourse(id) {
  // Commit only the latest response: slow connections can finish out of order.
  const requestId = ++courseRequestGeneration;
  const details = await rpc('teacher_overview', { p_course_id: id });
  if (requestId !== courseRequestGeneration || !signedIn()) return;
  courseId = id;
  overview = details;
  overview.topics.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  $('#group-count').value = overview.topics.length; updateGroupPreview();
  show('detail'); $('#course-title').textContent = overview.course.name;
  $('#student-recovery-panel').hidden = !overview.course.active;
  if (overview.course.active) void refreshStudentRecoveryRequests(id);
  $('#detail-live-panel').hidden = !overview.course.active;
  if (overview.course.active) updateLiveRosterViews();
  $('#course-summary').textContent = `${overview.students.length} estudiantes · ${overview.topics.length} temas`;
  $('#detail-student-total').textContent = String(overview.students.length);
  $('#detail-group-total').textContent = String(overview.topics.length);
  $('#detail-unassigned-total').textContent = String(overview.students.filter(student => !student.topicId).length);
  renderCourseCode();
  const active = overview.course.active;
  $('#detail-status-pill').textContent = active ? 'Materia activa' : 'Materia deshabilitada';
  $('#detail-status-pill').dataset.active = String(active);
  // Inactive subjects must expose Restore without hiding it in a disclosure.
  $('#course-advanced').open = !active;
  $('.course-management').dataset.active = String(active);
  $('.course-code-panel').dataset.active = String(active);
  $('#course-state-label').textContent = active ? 'Materia activa' : 'Materia deshabilitada';
  $('#course-state-description').textContent = active
    ? 'El código permite ingresar al aula.'
    : 'No aparece entre las materias activas. El código y el acceso de estudiantes están bloqueados.';
  $('#toggle-course').textContent = active ? 'Deshabilitar materia' : 'Restaurar materia';
  $('#enter-room').hidden = !active;
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
      if (!group.id) {
        const remove = document.createElement('button'); remove.type = 'button';
        remove.className = 'danger-outline'; remove.textContent = 'Eliminar';
        remove.setAttribute('aria-label', `Eliminar de ${overview.course.name} a ${student.firstName} ${student.lastName}`);
        remove.addEventListener('click', () => openDeleteStudent(student));
        row.append(remove);
      } else if (active) {
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
      if (active) {
        const move = document.createElement('button'); move.type = 'button';
        move.className = 'button secondary teacher-move-student';
        move.textContent = student.topicId ? 'Cambiar de grupo' : 'Asignar a grupo';
        move.setAttribute('aria-label', move.textContent + ' a ' + student.firstName + ' ' + student.lastName);
        move.addEventListener('click', () => openMoveStudent(student));
        row.append(move);
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
    const blob = new Blob([allCoursesXlsx(overviews)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'Estudiantes_todas_las_materias.xlsx';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    teacherSuccess(`Listo: ${total} estudiantes de ${courses.length} materias en un solo archivo.`);
  } finally { button.disabled = false; button.textContent = '↓ Descargar listado'; }
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
$('#enter-room').addEventListener('click', () => {
  if (overview?.course?.active) location.assign('./docente-sala.html?materia=' + encodeURIComponent(overview.course.id));
});
$('#back').addEventListener('click', () => run(loadCourses));
$('#logout').addEventListener('click', () => {
  ++courseRequestGeneration;
  courseId = ''; overview = null;
  signOut(); show('login');
});

let movingStudentTarget = null, movingStudent = false;
function openMoveStudent(student) {
  if (!overview?.course?.active || !overview.students.some(row => row.id === student.id)) return;
  movingStudentTarget = { courseId, id: student.id, name: student.firstName + ' ' + student.lastName };
  $('#move-student-title').textContent = student.topicId ? 'Cambiar estudiante de grupo' : 'Asignar estudiante a un grupo';
  $('#move-student-name').textContent = movingStudentTarget.name;
  const previous = overview.topics.find(topic => topic.id === student.topicId);
  $('#move-student-current').textContent = 'Grupo actual: ' + (previous?.name || 'Sin equipo');
  const choice = $('#move-student-destination');
  const available = overview.topics.filter(topic => topic.id !== student.topicId).map(topic => ({
    ...topic, remaining: topic.capacity - overview.students.filter(member => member.topicId === topic.id).length
  }));
  const options = available.map(topic => {
    const item = document.createElement('option');
    item.value = topic.id;
    item.textContent = topic.name + ' · ' + topic.remaining + ' de ' + topic.capacity + ' cupos libres';
    item.disabled = topic.remaining <= 0;
    return item;
  });
  choice.replaceChildren(...options);
  const first = available.find(topic => topic.remaining > 0);
  choice.value = first?.id || '';
  choice.disabled = !first;
  $('#move-student-help').textContent = first
    ? 'Se conservarán el perfil y el avatar. El historial del chat anterior seguirá en su grupo de origen; el estudiante accederá al chat del equipo nuevo.'
    : 'No hay otro grupo con cupos disponibles. Puedes crear una mesa o ampliar los cupos de una existente.';
  $('#confirm-student-move').textContent = student.topicId ? 'Confirmar cambio de grupo' : 'Asignar estudiante';
  $('#confirm-student-move').disabled = !first;
  $('#move-student-error').hidden = true;
  $('#move-student-error').textContent = '';
  $('#move-student-dialog').showModal();
  if(first)choice.focus();
}
function closeMoveStudent() {
  if(movingStudent)return;
  $('#move-student-dialog').close();
  movingStudentTarget = null;
}
$('#cancel-student-move').addEventListener('click', closeMoveStudent);
$('#move-student-dialog').addEventListener('cancel', event => {
  if(movingStudent)event.preventDefault();
  else movingStudentTarget=null;
});
$('#move-student-destination').addEventListener('change', () => {
  $('#confirm-student-move').disabled = movingStudent || !$('#move-student-destination').value;
});
$('#move-student-form').addEventListener('submit', async event => {
  event.preventDefault();
  if(movingStudent || !movingStudentTarget)return;
  const destination = $('#move-student-destination').value;
  if(!destination)return;
  const target = movingStudentTarget;
  const submit = $('#confirm-student-move');
  const cancel = $('#cancel-student-move');
  const select = $('#move-student-destination');
  movingStudent = true; submit.disabled = true; cancel.disabled = true; select.disabled = true;
  $('#move-student-error').hidden = true;
  try {
    await rpc('teacher_move_student', {
      p_course_id: target.courseId, p_student_id: target.id, p_topic_id: destination
    });
    $('#move-student-dialog').close();
    movingStudentTarget = null;
    await openCourse(target.courseId);
    teacherSuccess('Equipo actualizado para ' + target.name + '. Su perfil y avatar se conservan; el cambio aparecerá en el aula automáticamente.');
  } catch (error) {
    $('#move-student-error').textContent = error.message || 'No se pudo cambiar el equipo. Inténtalo de nuevo.';
    $('#move-student-error').hidden = false;
  } finally {
    movingStudent = false;cancel.disabled = false;select.disabled = !movingStudentTarget;
    submit.disabled = !movingStudentTarget || !select.value;
  }
});

let deleteStudentTarget = null, deletingStudent = false;
function openDeleteStudent(student) {
  deleteStudentTarget = { id: student.id, courseId, courseName: overview.course.name };
  $('#delete-student-name').textContent = `${student.firstName} ${student.lastName}`;
  $('#delete-student-course').textContent = overview.course.name;
  $('#delete-student-details').textContent = [student.email || 'Sin correo', student.phone || 'Sin teléfono'].join(' · ');
  $('#delete-student-progress').textContent = '';
  $('#delete-student-error').hidden = true;
  $('#delete-student-dialog').showModal();
}
$('#delete-student-dialog').addEventListener('cancel', event => { if (deletingStudent) event.preventDefault(); });
$('#cancel-delete-student').addEventListener('click', () => {
  if (deletingStudent) return;
  $('#delete-student-dialog').close(); deleteStudentTarget = null;
});
$('#confirm-delete-student').addEventListener('click', async () => {
  const target = deleteStudentTarget;
  if (!target || deletingStudent) return;
  deletingStudent = true;
  const submit = $('#confirm-delete-student'); submit.disabled = true;
  $('#cancel-delete-student').disabled = true;
  $('#delete-student-error').hidden = true;
  const progress = $('#delete-student-progress');
  try {
    progress.textContent = 'Revisando archivos del estudiante…';
    const args = { p_course_id: target.courseId, p_student_id: target.id };
    const paths = await rpc('teacher_unassigned_student_file_paths', args);
    progress.textContent = paths.length ? 'Retirando sus archivos…' : 'Eliminando su registro…';
    await deleteTeacherCourseFiles(target.courseId, paths);
    progress.textContent = 'Eliminando su registro…';
    await rpc('teacher_delete_unassigned_student', args);
    $('#delete-student-dialog').close(); deleteStudentTarget = null;
    try {
      await openCourse(target.courseId);
      teacherSuccess('Estudiante eliminado de esta materia. Ya no aparece en el listado general.');
    } catch { alertError('El estudiante fue eliminado, pero no se pudo actualizar la lista. Recarga el panel.'); }
  } catch (error) {
    progress.textContent = '';
    $('#delete-student-error').textContent = error.message;
    $('#delete-student-error').hidden = false;
  } finally {
    deletingStudent = false; submit.disabled = false; $('#cancel-delete-student').disabled = false;
  }
});

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
