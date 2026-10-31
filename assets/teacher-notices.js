export function createNoticeId(random = crypto) {
  if (typeof random.randomUUID === 'function') return random.randomUUID();
  const bytes = random.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes,byte => byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function createTeacherNotices({ rpc, signedIn, root = document, makeId = createNoticeId }) {
  const get = id => root.querySelector('#' + id);
  const dialog = get('teacher-notices-dialog'), form = get('teacher-notice-form');
  const title = get('teacher-notice-title'), body = get('teacher-notice-body'), target = get('teacher-notice-target');
  const list = get('teacher-notice-list'), status = get('teacher-notice-status'), error = get('teacher-notice-error');
  const publish = get('publish-course-notice'), close = get('close-teacher-notices'), refresh = get('refresh-teacher-notices');
  const multi = get('teacher-notice-multi'), choices = get('teacher-notice-courses'), destination = get('teacher-notice-destinations');
  let catalog = [], extraChecks = new Map();
  let context = null, generation = 0, revision = 0, sending = false, retiring = false, draftId = null;
  const current = epoch => generation === epoch && context && signedIn();
  const node = (tag, text, className = '') => {
    const element = root.createElement(tag); if (text !== undefined) element.textContent = text;
    element.className = className; return element;
  };
  const date = value => {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? '' : new Intl.DateTimeFormat('es-PA', { dateStyle: 'medium', timeStyle: 'short' }).format(instant);
  };
  function message(text = '') { error.textContent = text; error.hidden = !text; }
  const selectedCourses = () => context ? [context.id,...[...extraChecks].filter(([,box])=>box.checked && !target.value).map(([id])=>id)] : [];
  function controls() {
    title.disabled = body.disabled = target.disabled = publish.disabled = sending || !context?.active;
    const count = selectedCourses().length;
    publish.textContent = sending ? 'Publicando…' : count > 1 ? `Publicar en ${count} materias` : 'Publicar aviso';
    close.disabled = sending || retiring;
    choices.disabled = sending || !!target.value || !context?.active;
    for (const box of extraChecks.values()) box.disabled = choices.disabled || count >= 30 && !box.checked;
    get('teacher-notice-multi-hint').hidden = !target.value;
    destination.textContent = !context ? '' : count > 1
      ? `Se enviará a ${count} materias: ${[context,...catalog.filter(course=>extraChecks.get(course.id)?.checked)].map(course=>course.name).join(' · ')}`
      : target.value ? 'Se enviará solo al equipo seleccionado de esta materia.' : 'Se enviará a todos los estudiantes de esta materia.';
    get('teacher-notice-multi-count').textContent = count > 1 ? `(${count} materias)` : '';
  }
  function renderCourses() {
    const selected = new Set([...extraChecks].filter(([,box])=>box.checked).map(([id])=>id));
    extraChecks = new Map();
    const others = catalog.filter(course=>course.id!==context?.id);
    choices.replaceChildren(...others.map(course=>{
      const label = node('label',undefined,'notice-course-choice');
      const box = node('input'); box.type = 'checkbox'; box.name = 'extra_courses'; box.value = course.id; box.checked = selected.has(course.id);
      box.addEventListener('change',()=>{draftId=null;message();controls();});
      extraChecks.set(course.id,box); label.append(box,node('span',course.name)); return label;
    }));
    multi.hidden = !others.length; controls();
  }
  async function readers(notice, host, epoch) {
    host.textContent = 'Consultando lecturas…';
    try {
      const rows = await rpc('teacher_course_notice_readers', { p_course_id: context.id, p_notice_id: notice.id });
      if (!current(epoch) || !host.isConnected) return;
      if (!Array.isArray(rows)) throw new Error('Respuesta no disponible');
      host.replaceChildren(...rows.map(row => {
        const item = node('li', undefined, 'notice-reader');
        item.append(node('span',row.name), node('small',row.confirmedAt ? 'Confirmó · ' + date(row.confirmedAt) : 'Pendiente'));
        return item;
      }));
      if (!rows.length) host.append(node('li','Todavía no hay estudiantes entre los destinatarios.'));
    } catch (failure) {
      if (!current(epoch) || !host.isConnected) return;
      const again = node('button','Reintentar'); again.type = 'button';
      again.addEventListener('click', () => { void readers(notice,host,epoch); });
      host.replaceChildren(node('li','No pudimos consultar las lecturas.'), again);
    }
  }
  function render(rows, epoch) {
    dialog.setAttribute('data-empty',String(!rows.length));
    list.replaceChildren(...rows.map(notice => {
      const article = node('article', undefined, 'teacher-notice-item');
      const heading = node('h3',notice.title);
      const scope = node('p', (notice.topicId ? notice.topicName || 'Equipo' : 'Toda la materia') + ' · ' + date(notice.createdAt), 'notice-meta');
      const content = node('p',notice.body,'notice-message');
      const counts = node('p', notice.retiredAt ? 'Retirado · ' + date(notice.retiredAt)
        : `${notice.confirmedCount} de ${notice.recipientCount} confirmaron · ${notice.pendingCount} ${notice.pendingCount === 1 ? 'pendiente' : 'pendientes'}`, 'notice-confirmations');
      const details = node('details',undefined,'notice-readers');
      details.append(node('summary','Ver quiénes confirmaron'));
      const roster = node('ul'); details.append(roster);
      details.addEventListener('toggle', () => { if (details.open) void readers(notice,roster,epoch); });
      article.append(heading,scope,content,counts,details);
      if (!notice.retiredAt) {
        const actions = node('div',undefined,'notice-retire-actions');
        const remove = node('button','Retirar aviso','notice-text-button'); remove.type = 'button';
        const ask = node('div',undefined,'notice-retire-confirm'); ask.hidden = true;
        const yes = node('button','Sí, retirar','secondary'); yes.type = 'button';
        const no = node('button','Cancelar','notice-text-button'); no.type = 'button';
        ask.append(node('p','Dejará de aparecer a los estudiantes. Las confirmaciones guardadas se conservan.'),yes,no);
        remove.addEventListener('click', () => { remove.hidden = true; ask.hidden = false; yes.focus(); });
        no.addEventListener('click', () => { ask.hidden = true; remove.hidden = false; remove.focus(); });
        yes.addEventListener('click', async () => {
          if (!current(epoch) || retiring || sending) return;
          retiring = true; yes.disabled = no.disabled = true; controls(); message();
          try {
            await rpc('teacher_retire_course_notice', { p_course_id: context.id, p_notice_id: notice.id });
            if (!current(epoch)) return;
            revision++; status.textContent = 'Aviso retirado. Ya no se mostrará al entrar.';
            await load();
          } catch (failure) { if (current(epoch)) message(failure.message || 'No se pudo retirar el aviso. Reintenta.'); }
          finally { if (current(epoch)) { retiring = false; yes.disabled = no.disabled = false; controls(); } }
        });
        actions.append(remove,ask); article.append(actions);
      }
      return article;
    }));
    if (!rows.length) list.append(node('p','Todavía no has publicado avisos en esta materia.','notice-empty'));
  }
  async function load() {
    if (!context || !signedIn()) return;
    const epoch = generation, version = ++revision, id = context.id;
    refresh.disabled = true;
    try {
      const rows = await rpc('teacher_course_notices', { p_course_id: id });
      if (!current(epoch) || version !== revision) return;
      if (!Array.isArray(rows)) throw new Error('No pudimos consultar los avisos. Pulsa Actualizar lecturas.');
      render(rows,epoch);
    } catch (failure) {
      if (!current(epoch) || version !== revision) return;
      message(failure.message || 'No pudimos consultar los avisos. Pulsa Actualizar lecturas.');
    } finally { if (current(epoch) && version === revision) refresh.disabled = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!context?.active || !signedIn() || sending || retiring) return;
    const heading = title.value.trim(), text = body.value.trim();
    if (heading.length < 2 || heading.length > 120 || !text || text.length > 4000) {
      message('Escribe un título de 2 a 120 caracteres y un mensaje de hasta 4000.');
      (heading.length < 2 || heading.length > 120 ? title : body).focus(); return;
    }
    const epoch = generation;
    const destinations = selectedCourses();
    const payload = { p_course_id: context.id,
      p_title: heading, p_body: text, p_topic_id: target.value || null };
    sending = true; message(); status.textContent = ''; controls();
    try {
      payload.p_notice_id = draftId || (draftId = makeId());
      if (destinations.length > 1) await rpc('teacher_publish_notice_to_courses', {
        p_course_ids:destinations,p_batch_id:payload.p_notice_id,p_title:heading,p_body:text
      });
      else await rpc('teacher_publish_course_notice',payload);
      if (!current(epoch)) return;
      form.reset(); draftId = null;
      for (const box of extraChecks.values()) box.checked=false;
      multi.open=false;
      status.textContent = destinations.length > 1
        ? `Aviso publicado en ${destinations.length} materias. Cada estudiante confirmará la lectura en su materia.`
        : 'Aviso publicado. Aparecerá al entrar y pedirá confirmar la lectura.';
      await load();
    } catch (failure) { if (current(epoch)) message(failure.message || 'No se pudo publicar. Reintenta.'); }
    finally { if (current(epoch)) { sending = false; controls(); } }
  });
  // A retry of an unchanged draft reuses its ID, including an ambiguous network failure.
  for (const field of [title,body,target]) field.addEventListener('input', () => { if (!sending) draftId = null; message(); });
  target.addEventListener('change',()=>{
    draftId=null;
    if (target.value) for (const box of extraChecks.values()) box.checked=false;
    controls();
  });
  refresh.addEventListener('click', () => { message(); void load(); });
  close.addEventListener('click', () => { if (!sending && !retiring) { dialog.close(); get('open-course-notices').focus(); } });
  dialog.addEventListener('cancel', event => { if (sending || retiring) event.preventDefault(); });
  function reset(forgetCourses = true) {
    generation++; revision++; context = null; sending = retiring = false; draftId = null;
    if (dialog.open) dialog.close();
    dialog.setAttribute('data-empty','true');
    form.reset(); list.replaceChildren(); status.textContent = ''; message(); controls();
    if (forgetCourses) catalog=[];
    extraChecks=new Map();choices.replaceChildren();multi.open=false;multi.hidden=true;
    controls();
  }
  reset();
  return {
    reset,
    setCourses(courses) {
      catalog = courses.filter(course=>course.active!==false).map(course=>({id:course.id,name:course.name})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
      renderCourses();
    },
    setCourse(course, topics) {
      const selected = context?.id === course.id ? target.value : '';
      if (context?.id !== course.id) reset(false);
      context = { ...course };
      get('teacher-notices-course').textContent = course.name;
      target.replaceChildren(node('option','Toda la materia'), ...topics.map(topic => {
        const option = node('option',topic.name); option.value = topic.id; return option;
      }));
      target.children[0].value = ''; target.value = topics.some(topic => topic.id === selected) ? selected : '';
      get('teacher-notice-inactive').hidden = course.active;
      renderCourses();
    },
    open() {
      if (!context || !signedIn()) return;
      if (!dialog.open) dialog.showModal();
      get('teacher-notices-heading').focus({ preventScroll: true });
      if (!list.children.length) list.textContent = 'Consultando avisos…';
      void load();
    }
  };
}
