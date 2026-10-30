import './video-guide.js?v=0.27.4';
import './embed.js?v=0.27.4';
import { rpc, signedIn, deleteTeacherCourseFiles } from './supabase-client.js?v=0.27.4';
import { initTeacherAuth } from './teacher-auth.js?v=0.27.4';
import { allCoursesXlsx } from './teacher-export.js?v=0.27.4';
import { buildTeacherPresenceStats, presenceAgeLabel } from './teacher-live-model.js?v=0.27.4';
import { enrollmentReviewIcon, enrollmentReviewBadge, enrollmentReviewCount, enrollmentReviewSummary } from './team-ui.js?v=0.27.4';
const $ = selector => document.querySelector(selector);
let courseId = '', overview = null;
let courseRequestGeneration = 0, accountGeneration = 0;
let renamingCourseTarget = null;
let editingTopic = null;
let movingStudentTarget = null, movingStudent = false;
const pendingEnrollmentReviews = new Map();
const pendingWorkGroups = new Map();
let courseDetailRevision = 0;
const courseIsCurrent = (id,generation) => id === courseId && generation === courseRequestGeneration && signedIn();
let dashboardCourses = [], liveTimer = 0, liveGeneration = 0, liveRefreshing = false;
let liveRosterSnapshot = null, lastLiveFetch = 0;
let courseFollowUpSnapshot = new Map();
function stopDashboardPresence() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = 0;
  liveGeneration++;
}
function show(id) {
  for (const name of ['login','verify','password','dashboard','detail']) $(`#${name}`).hidden = name !== id;
  if (id !== 'dashboard' && id !== 'detail') stopDashboardPresence();
}
function alertError(value) { $('#error').textContent = value; $('#error').hidden = !value; }
async function run(task) { alertError(''); try { await task(); } catch (error) { alertError(error.message); } }
function newCourseCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(15));
  const part = Array.from(bytes, n => chars[n % chars.length]).join('');
  return `MAT-${part.slice(0,5)}-${part.slice(5,10)}-${part.slice(10)}`;
}
const teacherAccess = initTeacherAuth({ show, onNotice: teacherSuccess, onSignedIn: async () => {
  const generation = ++accountGeneration;
  await loadCourses();
  if (generation !== accountGeneration || !signedIn()) return;
  const target = new URLSearchParams(location.search).get('materia');
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(target || '')) await openCourse(target);
} });
async function loadCourses() {
  clearCourseRename();
  clearStudentMove();
  clearTopicEdit();
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
    studentNumber.id = 'course-student-total-' + course.id;
    students.append(studentNumber, document.createTextNode(' inscritos'));
    const topics = document.createElement('span'); topics.textContent = course.topic_count + (Number(course.topic_count) === 1 ? ' grupo' : ' grupos');
    topics.id = 'course-topic-total-' + course.id;
    const open = document.createElement('span'); open.className = 'teacher-course-open'; open.textContent = 'Administrar materia →';
    meta.append(students, topics, open); button.append(heading, meta);
    const followUp = document.createElement('div'); followUp.className = 'teacher-course-follow-up';
    followUp.id = 'course-follow-up-' + course.id; followUp.dataset.state = 'pending';
    followUp.setAttribute('role', 'status'); followUp.setAttribute('aria-atomic', 'true');
    followUp.textContent = 'Comprobando pendientes…';
    button.setAttribute('aria-describedby', followUp.id); button.append(followUp);
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
      const generation = courseRequestGeneration;
      try { await rpc('teacher_set_course_active', { p_course_id: course.id, p_active: true });
        if(generation !== courseRequestGeneration || !signedIn())return;
        await loadCourses(); teacherSuccess('Materia restaurada. Su código vuelve a funcionar.'); }
      finally { restore.disabled = false; }
    }));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-outline';
    remove.textContent = 'Eliminar'; remove.addEventListener('click', () => openDeleteCourse({ ...course, active: false }));
    actions.append(restore, remove); card.append(open, actions); return card;
  }));
  dashboardCourses = courses;
  liveRosterSnapshot = null;
  courseFollowUpSnapshot = new Map();
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
function renderCourseFollowUp(id, counts, stale = false) {
  const host = $('#course-follow-up-' + id);
  if (!host) return;
  const state = counts ? stale ? 'stale' : 'ready' : 'unavailable';
  const signature = JSON.stringify([counts, state]);
  if (host.dataset.signature === signature) return;
  host.dataset.signature = signature; host.dataset.state = state;
  if (!counts) {
    host.replaceChildren();
    host.textContent = 'Pendientes no disponibles · reintentando…';
    return;
  }
  const pending = document.createElement('span'); pending.className = 'teacher-course-pending-groups';
  pending.title = 'Grupos sin el check de grupo de trabajo creado en tu plataforma.';
  pending.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>';
  const number = new Intl.NumberFormat('es-PA').format(counts.pendingWorkGroupCount);
  pending.append(document.createTextNode(number + (counts.pendingWorkGroupCount === 1 ? ' grupo pendiente' : ' grupos pendientes')));
  host.textContent = '';
  host.replaceChildren(pending);
  if (counts.readyWorkGroupCount) {
    const ready = document.createElement('span'); ready.className = 'teacher-course-ready-groups';
    ready.title = 'Grupos completos o con cupo superado que todavía no tienen el check de grupo de trabajo creado.';
    ready.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
    const readyNumber = new Intl.NumberFormat('es-PA').format(counts.readyWorkGroupCount);
    ready.append(document.createTextNode(readyNumber + (counts.readyWorkGroupCount === 1 ? ' grupo listo para check' : ' grupos listos para check')));
    host.append(document.createTextNode(' '), ready);
  }
  if (counts.enrollmentReviewCount) {
    const reviewNumber = new Intl.NumberFormat('es-PA').format(counts.enrollmentReviewCount);
    host.append(document.createTextNode(' '), enrollmentReviewBadge(reviewNumber + (counts.enrollmentReviewCount === 1 ? ' matrícula por verificar' : ' matrículas por verificar')));
  }
  if (stale) {
    const note = document.createElement('span'); note.className = 'teacher-course-follow-up-stale';
    note.textContent = 'Sin actualizar · reintentando…'; host.append(note);
  }
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
  const students = liveRosterSnapshot.studentsByCourse.get(id);
  if (!Array.isArray(students)) {
    if (host.dataset.rosterSignature === 'unavailable') return;
    const unavailable = document.createElement('p'); unavailable.className = 'teacher-online-empty';
    unavailable.textContent = 'No se pudo comprobar esta lista. Reintentando…';
    host.replaceChildren(unavailable); host.dataset.rosterSignature = 'unavailable'; return;
  }
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
      $('#detail-live-count').textContent = count == null ? '— en línea' : count + ' en línea';
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
  dashboardCourses.forEach(course => renderCourseFollowUp(course.id, courseFollowUpSnapshot.get(course.id), true));
  $('#live-error').textContent = 'No se pudo actualizar la presencia ni los pendientes. Reintentaremos automáticamente.';
  $('#live-error').hidden = false;
}
async function refreshDashboardPresence(generation = liveGeneration) {
  if (liveRefreshing || document.hidden || ($('#dashboard').hidden && $('#detail').hidden) || !dashboardCourses.length) return;
  liveRefreshing = true;
  const revision = courseDetailRevision;
  try {
    const rows = await rpc('teacher_live_course_counts');
    if (generation !== liveGeneration || ($('#dashboard').hidden && $('#detail').hidden)) return;
    if (revision !== courseDetailRevision) return; // A confirmed check/review is newer than this read.
    const stats = buildTeacherPresenceStats(dashboardCourses, rows);
    liveRosterSnapshot = stats;
    courseFollowUpSnapshot = stats.followUpByCourse;
    dashboardCourses = dashboardCourses.map(course => {
      const counts = stats.followUpByCourse.get(course.id);
      renderCourseFollowUp(course.id, counts);
      if (!counts) return course;
      $('#course-student-total-' + course.id).textContent = String(counts.studentCount);
      $('#course-topic-total-' + course.id).textContent = counts.topicCount + (counts.topicCount === 1 ? ' grupo' : ' grupos');
      return { ...course, student_count: counts.studentCount, topic_count: counts.topicCount };
    });
    $('#summary-enrolled').textContent = String(dashboardCourses.reduce((total, course) => total + Number(course.student_count), 0));
    lastLiveFetch = Date.now();
    $('#summary-online').textContent = stats.online === null ? '—' : String(stats.online);
    document.querySelectorAll('[data-live-course-id]').forEach(label => {
      const count = stats.byCourse.get(label.dataset.liveCourseId);
      label.textContent = count == null ? '— en línea' : count + ' en línea';
      label.parentElement.dataset.online = count == null ? 'pending' : count > 0 ? 'true' : 'false';
    });
    document.querySelectorAll('[data-roster-count-id]').forEach(label => {
      const count = stats.byCourse.get(label.dataset.rosterCountId);
      label.textContent = count == null ? 'Sin datos · reintentando…' : count ? count + (count === 1 ? ' conectado' : ' conectados') : 'Nadie conectado';
    });
    updateLiveRosterViews();
    $('#live-monitor-status').dataset.state = stats.online === null ? 'pending' : 'ready';
    const clock = new Intl.DateTimeFormat('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('#live-updated').textContent = (stats.online === null ? 'Actualización parcial: ' : 'Actualizado: ') + clock.format(new Date());
    $('#live-error').textContent = stats.online === null ? 'Algunas materias no devolvieron datos de presencia. Reintentaremos automáticamente.' : '';
    $('#live-error').hidden = stats.online !== null;
  } catch (error) {
    if (generation === liveGeneration && (!$('#dashboard').hidden || !$('#detail').hidden)) markPresenceUnavailable();
  } finally { liveRefreshing = false; }
}
if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!$('#dashboard').hidden || !$('#detail').hidden)) void refreshDashboardPresence();
});
$('#new-course').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const submit = event.target.querySelector('button[type="submit"]'); submit.disabled = true;
  const generation = accountGeneration, navigation = courseRequestGeneration;
  try {
    const code = newCourseCode();
    await rpc('create_course_with_groups', { p_name: event.target.elements.namedItem('name').value.trim(), p_code: code,
      p_count: Number(event.target.elements.namedItem('groups').value), p_capacity: Number(event.target.elements.namedItem('capacity').value) });
    if(generation !== accountGeneration || navigation !== courseRequestGeneration || !signedIn())return;
    event.target.reset(); await loadCourses();
    $('#new-code').textContent = `Código de la materia: ${code}. Puedes volver a consultarlo al abrir la materia.`;
    $('#new-code').hidden = false;
  } finally { submit.disabled = false; }
}); });
async function refreshStudentRecoveryRequests(id) {
  const generation = courseRequestGeneration;
  const panel = $('#student-recovery-panel'), host = $('#student-recovery-requests');
  if (!overview?.course?.active || overview.course.id !== id) {
    panel.hidden = true; return;
  }
  // Do not expose a recovery panel until the server confirms an actionable,
  // genuinely manual request. Avoid showing stale requests from another course
  // or briefly flashing an empty recovery panel while the network responds.
  panel.hidden = true;
  host.replaceChildren();
  try {
    const requests = await rpc('teacher_student_recovery_requests', {p_course_id:id});
    if (!courseIsCurrent(id,generation) || $('#detail').hidden || overview?.course?.id !== id) return;
    $('#student-recovery-count').textContent = requests.length + (requests.length === 1 ? ' pendiente' : ' pendientes');
    if (!requests.length) return;
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
      select.id = 'recovery-student-' + request.id; select.name = 'student'; label.htmlFor = select.id;
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
      confirmation.id = 'recovery-name-' + request.id; confirmation.name = 'confirmation'; confirmLabel.htmlFor = confirmation.id;
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
        const generation = courseRequestGeneration;
        approve.disabled = true; reject.disabled = true; error.hidden = true;
        try {
          await rpc('teacher_decide_student_recovery', {
            p_request_id:request.id,p_student_id:student.id,
            p_expected_name:fullName(student),p_approve:true
          });
          if(!courseIsCurrent(id,generation))return;
          teacherSuccess('Recuperación aprobada para '+fullName(student)+'. Su equipo y avatar siguen guardados.');
          await openCourse(id);
        }catch(err){
          error.textContent = err.message; error.hidden = false;
          reject.disabled = false;update();
        }
      });
      reject.addEventListener('click', async () => {
        if (!confirm('¿Rechazar esta solicitud de recuperación?'))return;
        const generation = courseRequestGeneration;
        reject.disabled = true;approve.disabled = true;error.hidden = true;
        try {
          await rpc('teacher_decide_student_recovery', {
            p_request_id:request.id,p_student_id:null,p_expected_name:'',p_approve:false
          });
          if(!courseIsCurrent(id,generation))return;
          teacherSuccess('Solicitud rechazada. No se modificó ningún perfil.');
          await refreshStudentRecoveryRequests(id);
        }catch(err){error.textContent=err.message;error.hidden=false;reject.disabled=false;update();}
      });
      actions.append(approve,reject);
      item.append(head,info,label,select,caution,confirmLabel,confirmation,actions,error);
      return item;
    }));
    panel.hidden = false;
  } catch(err) {
    // An error reading the inbox must never display an unverified/stale queue.
    if (!courseIsCurrent(id,generation)) return;
    panel.hidden = true;
    host.replaceChildren();
    console.warn('No se pudieron consultar las solicitudes de recuperación del curso.');
  }
}
async function openCourse(id) {
  clearCourseRename();
  clearStudentMove();
  clearTopicEdit();
  const keepToolsOpen = id === courseId && $('#course-tools').open;
  // Commit only the latest response: slow connections can finish out of order.
  const requestId = ++courseRequestGeneration;
  let details, reviewRevision;
  do {
    reviewRevision = courseDetailRevision;
    details = await rpc('teacher_overview', { p_course_id: id });
    if (requestId !== courseRequestGeneration || !signedIn()) return;
  } while (reviewRevision !== courseDetailRevision);
  if (requestId !== courseRequestGeneration || !signedIn()) return;
  courseId = id;
  overview = details;
  overview.topics.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  $('#group-count').value = overview.topics.length; updateGroupPreview();
  show('detail'); $('#course-title').textContent = overview.course.name;
  $('#student-recovery-panel').hidden = true;
  $('#student-recovery-requests').replaceChildren();
  if (overview.course.active) void refreshStudentRecoveryRequests(id);
  $('#detail-live-panel').hidden = !overview.course.active;
  if (overview.course.active) updateLiveRosterViews();
  renderCourseSummary();
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
  $('#course-tools').hidden = !active;
  $('#course-tools').open = active && (keepToolsOpen || !overview.topics.length);
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
    card.dataset.workGroupId = topic.id;
    const title = document.createElement('h3'); title.textContent = topic.name;
    const used = overview.students.filter(student => student.topicId === topic.id).length;
    const capacity = document.createElement('small');
    capacity.textContent = `${used} de ${topic.capacity} integrantes` + (topic.locked ? ' · Ingreso bloqueado' : '');
    const instructions = document.createElement('p'); instructions.textContent = topic.instructions || 'Sin indicaciones todavía.';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary teacher-icon-button topic-edit-trigger';
    edit.setAttribute('aria-label', 'Editar tema y cupos de ' + topic.name);
    edit.setAttribute('title', 'Editar tema y cupos'); edit.setAttribute('aria-haspopup', 'dialog');
    edit.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m16 3 5 5-13 13H3v-5L16 3Z"/><path d="m14 5 5 5"/></svg>';
    edit.addEventListener('click', () => editTopic(topic));
    edit.hidden = !active;
    const lock = document.createElement('button'); lock.type = 'button';
    lock.id = 'topic-lock-' + topic.id; lock.className = 'secondary teacher-icon-button topic-lock-trigger';
    const action = topic.locked ? 'Desbloquear ingreso' : 'Bloquear ingreso';
    lock.setAttribute('aria-label', action + ' a ' + topic.name);
    lock.setAttribute('title', action); lock.setAttribute('aria-pressed', String(!!topic.locked));
    lock.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (topic.locked ? '<path d="M7 10V7a5 5 0 0 1 10 0v3"/>' : '<path d="M7 10V7a5 5 0 0 1 9-3"/>') +
      '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M12 14v3"/></svg>';
    lock.hidden = !active;
    lock.addEventListener('click', async () => {
      if (lock.disabled) return;
      let generation = courseRequestGeneration;
      lock.disabled = true; lock.setAttribute('aria-busy', 'true');
      try {
        const saved = await rpc('teacher_set_topic_locked', {p_course_id:id,p_topic_id:topic.id,p_locked:!topic.locked});
        if (!courseIsCurrent(id,generation)) return;
        if (saved?.id !== topic.id || saved.locked !== !topic.locked)
          throw new Error('No se pudo verificar el bloqueo. Vuelve a abrir la materia.');
        const refresh = openCourse(id); generation = courseRequestGeneration;
        await refresh;
        if (!courseIsCurrent(id,generation)) return;
        $('#topic-lock-' + topic.id)?.focus();
        teacherSuccess(saved.locked ? 'Ingreso bloqueado a ' + topic.name + '. Sus integrantes conservan su lugar y tú puedes asignar estudiantes.'
          : 'Ingreso desbloqueado a ' + topic.name + '. Podrán elegirlo si quedan cupos y la elección está abierta.');
      } catch (error) { if (courseIsCurrent(id,generation)) alertError(error.message); }
      finally { lock.disabled = false; lock.setAttribute('aria-busy', 'false'); }
    });
    card.append(title, capacity, instructions, edit, lock); return card;
  }));
  renderStudentGroups();
  renderRegistrationControl();
}
function renderCourseSummary() {
  const pending = enrollmentReviewCount(overview.students);
  $('#course-summary').textContent = `${overview.students.length} estudiantes · ${overview.topics.length} temas` +
    (pending ? ' · ' + enrollmentReviewSummary(overview.students) : '');
}
function renderStudentGroups() {
  const id = overview.course.id, active = overview.course.active;
  const groups = [...overview.topics.map(topic => ({ id: topic.id, name: topic.name, capacity: topic.capacity, locked: topic.locked, workGroupCreated: topic.workGroupCreated })),
    { id: null, name: 'Sin equipo', capacity: null }];
  $('#student-list').replaceChildren(...groups.map(group => {
    const students = overview.students.filter(student => student.topicId === group.id)
      .sort((a, b) => (a.lastName + ' ' + a.firstName).localeCompare(b.lastName + ' ' + b.firstName, 'es'));
    const card = document.createElement('section'); card.className = 'teacher-group';
    if (group.id) card.dataset.workGroupId = group.id;
    const heading = document.createElement('div'); heading.className = 'teacher-group-heading';
    const title = document.createElement('h4'); title.textContent = group.name;
    const count = document.createElement('span'); count.textContent = group.capacity === null
      ? `${students.length} pendiente${students.length === 1 ? '' : 's'}` : `${students.length} de ${group.capacity} integrantes` + (group.locked ? ' · Ingreso bloqueado' : '');
    heading.append(title, count);
    if (group.id) { heading.className += ' has-work-group-check'; heading.append(workGroupControl(id, group, active)); }
    card.append(heading);
    if (enrollmentReviewCount(students)) card.append(enrollmentReviewBadge(enrollmentReviewSummary(students)));
    if (!students.length) {
      const empty = document.createElement('p'); empty.textContent = group.id ? 'Aún no hay estudiantes en este grupo.' : 'Todos eligieron un equipo.';
      card.append(empty);
    }
    for (const student of students) {
      const row = document.createElement('div'); row.className = 'teacher-student';
      const name = document.createElement('strong'); name.textContent = `${student.lastName}, ${student.firstName}`;
      if (active) name.className = 'teacher-student-name has-review-control';
      if (student.enrollmentReview === true) {
        row.dataset.enrollmentReview = 'true'; name.append(enrollmentReviewBadge());
      }
      const contact = document.createElement('span'); contact.textContent = [student.email || 'Sin correo', student.phone || 'Sin teléfono'].join(' · ');
      row.append(name, contact);
      if (!group.id) {
        const remove = document.createElement('button'); remove.type = 'button';
        remove.className = 'danger-outline'; remove.textContent = 'Eliminar';
        remove.setAttribute('aria-label', `Eliminar de esta materia a ${student.firstName} ${student.lastName}`);
        remove.addEventListener('click', () => openDeleteStudent(student));
        row.append(remove);
      } else if (active) {
        const release = document.createElement('button'); release.type = 'button';
        release.className = 'button secondary'; release.textContent = 'Liberar del grupo';
        release.addEventListener('click', () => {
          if (!confirm(`¿Liberar a ${student.firstName} ${student.lastName} de ${group.name}? Podrá elegir otro equipo.`)) return;
          run(async () => { release.disabled = true;
            try { const generation = courseRequestGeneration;
              await rpc('teacher_release_student', { p_course_id: id, p_student_id: student.id });
              if(courseIsCurrent(id,generation))await openCourse(id); }
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
      if (active) name.append(enrollmentReviewControl(id, student));
      card.append(row);
    }
    return card;
  }));
  updateWorkGroupStates();
}
function updateWorkGroupStates() {
  const groups = new Map(overview.topics.map(group => [group.id, group]));
  const counts = new Map();
  for (const student of overview.students)
    counts.set(student.topicId, (counts.get(student.topicId) || 0) + 1);
  for (const card of document.querySelectorAll('#detail [data-work-group-id]')) {
    const group = groups.get(card.dataset.workGroupId);
    if (!group) continue;
    const complete = Number.isInteger(group.capacity) && group.capacity > 0 &&
      (counts.get(group.id) || 0) >= group.capacity;
    const state = group.workGroupCreated === true ? 'created' : complete ? 'ready' : 'pending';
    card.dataset.workState = state;
    let label = card.querySelector('.work-group-state-label');
    if (!label) {
      label = document.createElement('small'); label.className = 'work-group-state-label';
      (card.querySelector('.teacher-group-heading') || card).append(label);
    }
    label.textContent = state === 'created' ? 'Grupo creado'
      : state === 'ready' ? 'Completo · por crear' : 'Pendiente de crear';
  }
}
function enrollmentReviewControl(id, student) {
  const button = document.createElement('button'); button.type = 'button';
  const key = id + '/' + student.id, review = student.enrollmentReview === true;
  button.id = 'enrollment-review-' + student.id;
  button.className = 'secondary teacher-icon-button teacher-enrollment-toggle';
  const action = review ? 'Quitar aviso de matrícula' : 'Marcar matrícula por verificar';
  button.title = action; button.setAttribute('aria-label', action + ' de ' + student.firstName + ' ' + student.lastName);
  button.setAttribute('aria-pressed', String(review));
  button.disabled = pendingEnrollmentReviews.has(key);
  button.setAttribute('aria-busy', String(button.disabled));
  button.append(enrollmentReviewIcon());
  button.addEventListener('click', async () => {
    const generation = courseRequestGeneration, account = accountGeneration;
    if (button.disabled || pendingEnrollmentReviews.has(key) || !courseIsCurrent(id, generation)) return;
    const target = { generation }; pendingEnrollmentReviews.set(key, target);
    button.disabled = true; button.setAttribute('aria-busy', 'true'); alertError('');
    try {
      const saved = await rpc('teacher_set_enrollment_review', {
        p_course_id: id, p_student_id: student.id, p_review: !review
      });
      if (saved?.id !== student.id || saved.enrollmentReview !== !review)
        throw new Error('No se pudo verificar la marca. Vuelve a abrir la materia para comprobarla.');
      if (account !== accountGeneration || !signedIn()) return;
      courseDetailRevision++;
      if (id !== courseId || overview?.course?.id !== id) return;
      const currentStudent = overview.students.find(row => row.id === student.id);
      if (!currentStudent) return;
      currentStudent.enrollmentReview = saved.enrollmentReview;
      renderStudentGroups(); renderCourseSummary();
      if (!courseIsCurrent(id, generation)) return;
      teacherSuccess(saved.enrollmentReview
        ? 'Matrícula por verificar: ' + student.firstName + ' ' + student.lastName + '. Su equipo verá el aviso; conserva su lugar y su chat.'
        : 'Aviso de matrícula retirado de ' + student.firstName + ' ' + student.lastName + '.');
    } catch (error) { if (courseIsCurrent(id, generation)) alertError(error.message); }
    finally {
      if (pendingEnrollmentReviews.get(key) === target) pendingEnrollmentReviews.delete(key);
      if (id === courseId && signedIn()) {
        const current = $('#enrollment-review-' + student.id);
        if (current) {
          current.disabled = pendingEnrollmentReviews.has(key); current.setAttribute('aria-busy', String(current.disabled));
          if (courseIsCurrent(id, generation)) current.focus();
        }
      }
    }
  });
  return button;
}
function workGroupControl(id, group, active) {
  const button = document.createElement('button'); button.type = 'button';
  const key = id + '/' + group.id, created = group.workGroupCreated === true;
  const action = created ? 'Quitar marca de grupo de trabajo creado' : 'Marcar grupo de trabajo como creado';
  button.id = 'work-group-created-' + group.id;
  button.className = 'secondary teacher-icon-button work-group-check';
  button.title = active ? action : created ? 'Grupo de trabajo creado' : 'Grupo de trabajo pendiente';
  button.setAttribute('aria-label', button.title + ': ' + group.name);
  button.setAttribute('aria-pressed', String(created));
  button.disabled = !active || pendingWorkGroups.has(key);
  button.setAttribute('aria-busy', String(pendingWorkGroups.has(key)));
  button.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="3"/>' +
    (created ? '<path d="m7 12 3 3 7-7"/>' : '') + '</svg>';
  button.addEventListener('click', async () => {
    const generation = courseRequestGeneration, account = accountGeneration;
    if (button.disabled || pendingWorkGroups.has(key) || !courseIsCurrent(id, generation)) return;
    const target = {}; pendingWorkGroups.set(key, target);
    button.disabled = true; button.setAttribute('aria-busy', 'true'); alertError('');
    try {
      const saved = await rpc('teacher_set_work_group_created', { p_course_id: id, p_topic_id: group.id, p_created: !created });
      if (saved?.id !== group.id || saved.workGroupCreated !== !created)
        throw new Error('No se pudo verificar el check. Vuelve a abrir la materia para comprobarlo.');
      if (account !== accountGeneration || !signedIn()) return;
      courseDetailRevision++;
      if (id !== courseId || overview?.course?.id !== id) return;
      const currentGroup = overview.topics.find(topic => topic.id === group.id);
      if (!currentGroup) return;
      currentGroup.workGroupCreated = saved.workGroupCreated;
      renderStudentGroups();
      if (!courseIsCurrent(id, generation)) return;
      teacherSuccess(saved.workGroupCreated ? 'Grupo de trabajo marcado como creado: ' + currentGroup.name + '.'
        : 'Marca de grupo de trabajo creado retirada de ' + currentGroup.name + '.');
    } catch (error) { if (courseIsCurrent(id, generation)) alertError(error.message); }
    finally {
      if (pendingWorkGroups.get(key) === target) pendingWorkGroups.delete(key);
      if (id === courseId && signedIn()) {
        const current = $('#work-group-created-' + group.id);
        if (current) {
          current.disabled = !overview?.course?.active || pendingWorkGroups.has(key);
          current.setAttribute('aria-busy', String(pendingWorkGroups.has(key)));
          if (courseIsCurrent(id, generation)) current.focus();
        }
      }
    }
  });
  return button;
}
function renderRegistrationControl() {
  $('#registration').textContent = overview.course.registrationOpen ? 'Cerrar inscripciones' : 'Abrir inscripciones';
  $('#detail-registration-status').textContent = overview.course.registrationOpen ? 'Inscripciones abiertas' : 'Inscripciones cerradas';
  $('#detail-registration-status').hidden = !overview.course.active;
  $('#registration').setAttribute('aria-label', (overview.course.registrationOpen ? 'Inscripciones abiertas. Cerrar' : 'Inscripciones cerradas. Abrir') + ' para ' + overview.course.name);
}
$('#export-all').addEventListener('click', () => run(async () => {
  const button = $('#export-all'), generation = accountGeneration;
  const currentExport = () => generation === accountGeneration && signedIn();
  button.disabled = true; button.textContent = 'Preparando todas las materias…';
  try {
    // Refresh both lists so newly created, disabled or restored courses are included.
    const [active, disabled] = await Promise.all([rpc('my_courses'), rpc('teacher_disabled_courses')]);
    if(!currentExport())return;
    const courses = [...new Map([...active, ...disabled].map(course => [course.id, course])).values()];
    if (!courses.length) { teacherSuccess('Todavía no hay materias para descargar.'); return; }
    const overviews = [];
    for (let start = 0; start < courses.length; start += 4) {
      const batch = await Promise.all(courses.slice(start, start + 4).map(course =>
        rpc('teacher_overview', { p_course_id: course.id })));
      if(!currentExport())return;
      if (batch.some(item => !item?.course || !Array.isArray(item.students) || !Array.isArray(item.topics)))
        throw new Error('No se pudo preparar el listado completo. Inténtalo de nuevo.');
      overviews.push(...batch);
    }
    const total = overviews.reduce((count, item) => count + item.students.length, 0);
    if (!total) { teacherSuccess('Tus materias todavía no tienen estudiantes registrados.'); return; }
    if(!currentExport())return;
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
  const id = courseId, generation = courseRequestGeneration;
  try {
    const f = event.target.elements;
    await rpc('teacher_add_topic', { p_course_id: id, p_name: f.namedItem('name').value.trim(),
      p_instructions: f.namedItem('instructions').value.trim(), p_capacity: Number(f.namedItem('capacity').value) });
    if(!courseIsCurrent(id,generation))return;
    event.target.reset(); await openCourse(id);
  } finally { submit.disabled = false; }
}); });
$('#registration').addEventListener('click', () => run(async () => {
  const button = $('#registration'), id = courseId, generation = courseRequestGeneration; button.disabled = true;
  try { await rpc('teacher_set_registration', { p_course_id: id, p_open: !overview.course.registrationOpen });
    if(courseIsCurrent(id,generation))await openCourse(id); }
  finally { button.disabled = false; }
}));
$('#toggle-course').addEventListener('click', () => run(async () => {
  const active = overview.course.active;
  if (active && !confirm('¿Deshabilitar esta materia? Desaparecerá de las materias activas y sus estudiantes no podrán entrar con el código ni usar el aula. Puedes restaurarla después.')) return;
  const button = $('#toggle-course'), id = courseId, generation = courseRequestGeneration; button.disabled = true;
  try {
    await rpc('teacher_set_course_active', { p_course_id: id, p_active: !active });
    if(!courseIsCurrent(id,generation))return;
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
  ++courseRequestGeneration; ++accountGeneration;
  clearCourseRename();
  clearStudentMove();
  clearTopicEdit();
  for(const id of ['#edit-topic-dialog','#move-student-dialog','#delete-student-dialog','#delete-course-dialog']) { if($(id).open)$(id).close(); }
  courseId = ''; overview = null;
  teacherAccess.signOut(); show('login');
});

function clearCourseRename() {
  renamingCourseTarget = null;
  if ($('#rename-course-dialog').open) $('#rename-course-dialog').close();
}
function cancelCourseRename() {
  if (renamingCourseTarget?.pending) return;
  clearCourseRename();
  $('#edit-course-name').focus();
}
$('#edit-course-name').addEventListener('click', () => {
  if (!overview?.course || !signedIn()) return;
  renamingCourseTarget = { id: courseId, generation: courseRequestGeneration,
    account: accountGeneration, name: overview.course.name, pending: false };
  $('#rename-course-name').value = overview.course.name;
  $('#rename-course-name').disabled = false;
  $('#rename-course-error').hidden = true;
  $('#rename-course-form').setAttribute('aria-busy', 'false');
  $('#save-course-name').disabled = false;
  $('#save-course-name').textContent = 'Guardar nombre';
  $('#cancel-course-rename').disabled = false;
  $('#rename-course-dialog').showModal();
  $('#rename-course-name').focus();
  $('#rename-course-name').select?.();
});
$('#cancel-course-rename').addEventListener('click', cancelCourseRename);
$('#rename-course-dialog').addEventListener('cancel', event => {
  event.preventDefault(); cancelCourseRename();
});
$('#rename-course-name').addEventListener('input', () => { $('#rename-course-error').hidden = true; });
$('#rename-course-form').addEventListener('submit', async event => {
  event.preventDefault();
  const target = renamingCourseTarget;
  const current = () => renamingCourseTarget === target && target.account === accountGeneration &&
    courseIsCurrent(target.id, target.generation);
  if (!target || target.pending || !current()) return;
  const name = $('#rename-course-name').value.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 120) {
    $('#rename-course-error').textContent = 'Escribe un nombre de entre 2 y 120 caracteres.';
    $('#rename-course-error').hidden = false; $('#rename-course-name').focus(); return;
  }
  if (name === target.name) { cancelCourseRename(); return; }
  target.pending = true;
  $('#rename-course-error').hidden = true;
  $('#rename-course-form').setAttribute('aria-busy', 'true');
  $('#rename-course-name').disabled = true;
  $('#save-course-name').disabled = true;
  $('#save-course-name').textContent = 'Guardando…';
  $('#cancel-course-rename').disabled = true;
  try {
    const saved = await rpc('teacher_rename_course', { p_course_id: target.id, p_name: name });
    if (!current()) return;
    if (saved?.id !== target.id || typeof saved.name !== 'string')
      throw new Error('No se pudo verificar el nombre guardado. Vuelve a abrir la materia.');
    overview.course.name = saved.name;
    $('#course-title').textContent = saved.name;
    renderRegistrationControl();
    dashboardCourses = dashboardCourses.map(course => course.id === target.id ? { ...course, name: saved.name } : course);
    clearCourseRename();
    $('#edit-course-name').focus();
    teacherSuccess('Nombre actualizado. El código de la materia sigue siendo el mismo.');
  } catch (error) {
    if (!current()) return;
    $('#rename-course-error').textContent = error.message;
    $('#rename-course-error').hidden = false;
  } finally {
    if (current()) {
      target.pending = false;
      $('#rename-course-form').setAttribute('aria-busy', 'false');
      $('#rename-course-name').disabled = false;
      $('#save-course-name').disabled = false;
      $('#save-course-name').textContent = 'Guardar nombre';
      $('#cancel-course-rename').disabled = false;
    }
  }
});

function clearStudentMove() {
  movingStudentTarget = null;
  if ($('#move-student-dialog').open) $('#move-student-dialog').close();
}
function moveDestination() {
  return movingStudentTarget?.destinations.find(topic => topic.id === $('#move-student-destination').value);
}
function updateMoveDestination(resetPermission = false) {
  if (resetPermission) $('#move-over-capacity').checked = false;
  const topic = moveDestination(), full = topic && topic.used >= topic.capacity;
  $('#move-capacity-exception').hidden = !full;
  $('#move-over-capacity').required = !!full;
  $('#move-capacity-summary').textContent = full
    ? 'El grupo tiene ' + topic.used + ' de ' + topic.capacity + ' integrantes. Con esta asignación quedará en ' + (topic.used + 1) + ' de ' + topic.capacity + '. El cupo establecido se conserva.' : '';
  $('#move-student-help').textContent = topic
    ? (topic.locked ? 'El ingreso a este grupo está bloqueado para estudiantes. Como docente puedes asignarlo aquí. ' : '') +
      'Se conservarán el perfil y el avatar. Los mensajes del equipo anterior permanecen en su grupo de origen; el estudiante accederá al chat del equipo nuevo.'
    : 'No hay otro grupo. Añade un grupo para poder asignar o trasladar al estudiante.';
  $('#confirm-student-move').disabled = movingStudent || !topic || (full && !$('#move-over-capacity').checked);
}
function renderMoveDestinations(preferredId = '') {
  const destinations = movingStudentTarget.destinations, choice = $('#move-student-destination');
  choice.replaceChildren(...destinations.map(topic => {
    const item = document.createElement('option'); item.value = topic.id;
    item.textContent = topic.name + ' · ' + topic.used + ' de ' + topic.capacity + ' integrantes' +
      (topic.used >= topic.capacity ? ' · Completo' : '') + (topic.locked ? ' · Ingreso bloqueado' : '');
    return item;
  }));
  choice.value = (destinations.find(topic => topic.id === preferredId) || destinations.find(topic => !topic.locked && topic.used < topic.capacity) || destinations[0])?.id || '';
  choice.disabled = !destinations.length;
}
function openMoveStudent(student) {
  if (movingStudent || !overview?.course?.active || !overview.students.some(row => row.id === student.id)) return;
  const destinations = overview.topics.filter(topic => topic.id !== student.topicId).map(topic => ({
    ...topic, used: overview.students.filter(member => member.topicId === topic.id).length
  }));
  movingStudentTarget = { courseId, generation:courseRequestGeneration, id:student.id,
    name:student.firstName + ' ' + student.lastName, destinations };
  $('#move-student-title').textContent = student.topicId ? 'Cambiar estudiante de grupo' : 'Asignar estudiante a un grupo';
  $('#move-student-name').textContent = movingStudentTarget.name;
  const previous = overview.topics.find(topic => topic.id === student.topicId);
  $('#move-student-current').textContent = 'Grupo actual: ' + (previous?.name || 'Sin equipo');
  renderMoveDestinations();
  const choice = $('#move-student-destination');
  $('#confirm-student-move').textContent = student.topicId ? 'Confirmar cambio de grupo' : 'Asignar estudiante';
  $('#cancel-student-move').disabled = false;
  $('#move-over-capacity').disabled = false;
  $('#move-student-form').setAttribute('aria-busy','false');
  $('#move-student-error').hidden = true; $('#move-student-error').textContent = '';
  updateMoveDestination(true);
  $('#move-student-dialog').showModal();
  if (destinations.length) choice.focus();
}
function closeMoveStudent() {
  if (movingStudent) return;
  clearStudentMove();
}
$('#cancel-student-move').addEventListener('click', closeMoveStudent);
$('#move-student-dialog').addEventListener('cancel', event => {
  if (movingStudent) event.preventDefault();
  else movingStudentTarget = null;
});
$('#move-student-destination').addEventListener('change', () => updateMoveDestination(true));
$('#move-over-capacity').addEventListener('change', () => updateMoveDestination());
$('#move-student-form').addEventListener('submit', async event => {
  event.preventDefault();
  const target = movingStudentTarget, topic = moveDestination();
  if (movingStudent || !target || !topic || !courseIsCurrent(target.courseId,target.generation)) return;
  const allowOverCapacity = topic.used >= topic.capacity && $('#move-over-capacity').checked;
  if (topic.used >= topic.capacity && !allowOverCapacity) {
    $('#move-student-error').textContent = 'Marca la autorización para asignar a este estudiante aunque se supere el cupo.';
    $('#move-student-error').hidden = false; $('#move-over-capacity').focus(); return;
  }
  const current = () => movingStudentTarget === target && courseIsCurrent(target.courseId,target.generation);
  const submit = $('#confirm-student-move'), cancel = $('#cancel-student-move');
  const select = $('#move-student-destination'), permission = $('#move-over-capacity');
  movingStudent = true; submit.disabled = true; cancel.disabled = true; select.disabled = true; permission.disabled = true;
  $('#move-student-form').setAttribute('aria-busy','true');
  const submitLabel = submit.textContent; submit.textContent = 'Guardando…';
  $('#move-student-error').hidden = true;
  try {
    await rpc('teacher_assign_student', {
      p_course_id:target.courseId,p_student_id:target.id,p_topic_id:topic.id,
      p_allow_over_capacity:!!allowOverCapacity
    });
    if (!current()) return;
    clearStudentMove();
    const refresh = openCourse(target.courseId), generation = courseRequestGeneration;
    try { await refresh; } catch {
      if (courseIsCurrent(target.courseId,generation)) alertError('La asignación se guardó. No se pudo actualizar el listado; vuelve a abrir la materia para verlo.');
      return;
    }
    if (!courseIsCurrent(target.courseId,generation)) return;
    teacherSuccess('Equipo actualizado para ' + target.name + '. Su perfil y avatar se conservan; el cambio aparecerá en el aula automáticamente.');
  } catch (error) {
    if (!current()) return;
    if (/equipo está completo/i.test(error.message || '')) {
      // Another assignment may have taken the last seat while this dialog was open.
      // Refresh the counts and expose the permission instead of leaving it hidden.
      try {
        const fresh = await rpc('teacher_overview',{p_course_id:target.courseId});
        if (!current()) return;
        const student = fresh.students.find(row => row.id === target.id);
        if (student) {
          target.destinations = fresh.topics.filter(row => row.id !== student.topicId).map(row => ({
            ...row,used:fresh.students.filter(member => member.topicId === row.id).length
          }));
          const previous = fresh.topics.find(row => row.id === student.topicId);
          $('#move-student-current').textContent = 'Grupo actual: ' + (previous?.name || 'Sin equipo');
          renderMoveDestinations(topic.id); updateMoveDestination(true);
        }
      } catch { /* Keep the original server error, with a way to reload below. */ }
    }
    if (!current()) return;
    $('#move-student-error').textContent = (error.message || 'No se pudo cambiar el equipo. Inténtalo de nuevo.') +
      ' Si los datos cambiaron, cancela y vuelve a abrir la asignación.';
    $('#move-student-error').hidden = false;
  } finally {
    movingStudent = false;
    if (movingStudentTarget === target) {
      cancel.disabled = false; select.disabled = !target.destinations.length; permission.disabled = false;
      submit.textContent = submitLabel; $('#move-student-form').setAttribute('aria-busy','false');
      updateMoveDestination();
    }
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
  const target = deleteStudentTarget, generation = courseRequestGeneration;
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
    if(!courseIsCurrent(target.courseId,generation))return;
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
  const course = deleteTarget, generation = courseRequestGeneration;
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
    if(generation !== courseRequestGeneration || !signedIn())return;
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
    const button = $('#generate-course-code'), id = courseId, generation = courseRequestGeneration;
    button.disabled = true;
    try {
      const code = await rpc('teacher_generate_course_code', { p_course_id:id, p_code:newCourseCode() });
      if (!courseIsCurrent(id,generation)) return;
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
  const button = event.target.querySelector('button'), id = courseId, generation = courseRequestGeneration; button.disabled = true;
  try { await rpc('teacher_set_group_count', { p_course_id: id,
    p_count: Number($('#group-count').value), p_capacity: Number($('#new-group-capacity').value) });
    if(!courseIsCurrent(id,generation))return;
    await openCourse(id); teacherSuccess('La cantidad de mesas quedó guardada.');
  } finally { button.disabled = false; }
}); });
function clearTopicEdit() {
  editingTopic = null;
  if ($('#edit-topic-dialog').open) $('#edit-topic-dialog').close();
}
function editTopic(topic) {
  if (editingTopic?.pending) return;
  editingTopic = {id:topic.id,courseId,generation:courseRequestGeneration,pending:false};
  const form = $('#edit-topic-form');
  form.setAttribute('aria-busy','false');
  for (const name of ['name','instructions','capacity']) form.elements.namedItem(name).disabled = false;
  form.querySelector('[type="submit"]').disabled = false;
  form.querySelector('[type="submit"]').textContent = 'Guardar cambios';
  $('#cancel-topic-edit').disabled = false;
  form.elements.namedItem('name').value = topic.name;
  form.elements.namedItem('instructions').value = topic.instructions || '';
  form.elements.namedItem('capacity').value = topic.capacity;
  $('#edit-topic-error').hidden = true; $('#edit-topic-dialog').showModal();
}
$('#cancel-topic-edit').addEventListener('click', () => { if (!editingTopic?.pending) clearTopicEdit(); });
$('#edit-topic-dialog').addEventListener('cancel', event => {
  if (editingTopic?.pending) event.preventDefault();
  else editingTopic = null;
});
$('#edit-topic-form').addEventListener('submit', async event => {
  event.preventDefault(); const f = event.target.elements, button = event.target.querySelector('[type="submit"]');
  const target = editingTopic;
  if (!target || target.pending || !courseIsCurrent(target.courseId,target.generation)) return;
  const current = () => editingTopic === target && courseIsCurrent(target.courseId,target.generation);
  const {courseId:id} = target;
  const details = {
    p_name: f.namedItem('name').value.trim(), p_instructions: f.namedItem('instructions').value.trim(),
    p_capacity: Number(f.namedItem('capacity').value) };
  target.pending = true; button.disabled = true; button.textContent = 'Guardando…';
  $('#cancel-topic-edit').disabled = true; $('#edit-topic-error').hidden = true;
  event.target.setAttribute('aria-busy','true');
  for (const name of ['name','instructions','capacity']) f.namedItem(name).disabled = true;
  try {
    await rpc('teacher_edit_topic', { p_course_id: id, p_topic_id: target.id, ...details });
    if (!current()) return;
    clearTopicEdit();
    const refresh = openCourse(id), generation = courseRequestGeneration;
    try { await refresh; }
    catch { if (courseIsCurrent(id,generation)) alertError('Los cambios se guardaron. Vuelve a abrir la materia para actualizar el listado.'); return; }
    if (courseIsCurrent(id,generation)) teacherSuccess('Tema y cupos actualizados.');
  } catch(error) {
    if (current()) { $('#edit-topic-error').textContent = error.message; $('#edit-topic-error').hidden = false; }
  } finally {
    if (editingTopic === target) {
      target.pending = false; button.disabled = false; button.textContent = 'Guardar cambios';
      $('#cancel-topic-edit').disabled = false; event.target.setAttribute('aria-busy','false');
      for (const name of ['name','instructions','capacity']) f.namedItem(name).disabled = false;
    }
  }
});
function teacherSuccess(text) {
  $('#teacher-success').textContent = text; $('#teacher-success').hidden = false;
  setTimeout(() => { $('#teacher-success').hidden = true; }, 6000);
}
