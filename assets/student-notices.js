// Read confirmations belong to the server's student profile, never this browser.
export function createStudentNotices({ rpc, signedIn, root = document, beforeOpen = () => {}, onReady = () => {}, onUpdate = () => {} }) {
  const get = id => root.querySelector('#' + id);
  const dialog = get('student-notices-dialog'), trigger = get('student-notices-button');
  const title = get('student-notice-title'), course = get('student-notice-course');
  const content = get('student-notice-content'), progress = get('student-notice-progress');
  const error = get('student-notice-error'), confirm = get('student-notice-confirm');
  const close = get('student-notice-close'), retry = get('student-notice-retry');
  const hint = get('student-notice-hint'), home = get('student-notice-home');
  let context = null, generation = 0, rows = [], checking = false, required = false;
  let browsing = false, confirming = '', request = null, signature = '', revision = 0;
  let feedState = 'hidden', returnFocus = trigger;
  const restoreFocus = () => (returnFocus?.isConnected === false ? trigger : returnFocus).focus({ preventScroll: true });
  const current = (epoch, id) => generation === epoch && context?.courseId === id && signedIn();
  const pending = () => rows.filter(row => !row.confirmedAt);
  function message(value = '') { error.textContent = value; error.hidden = !value; }
  function openDialog(force = false) {
    if (dialog.open) return;
    if (!force && root.querySelector('dialog[open]')) return;
    beforeOpen(); dialog.showModal(); title.focus({ preventScroll: true });
  }
  function closeDialog() { if (dialog.open) dialog.close(); browsing = false; }
  function updateTrigger() {
    trigger.hidden = !context;
    const count = pending().length;
    get('student-notices-count').textContent = String(count);
    get('student-notices-count').hidden = !count;
    trigger.setAttribute('aria-label', count ? `Avisos del docente: ${count} sin confirmar` : 'Ver avisos del docente');
    onUpdate({state:feedState,pendingCount:count,rows:rows.map(row=>({...row}))});
  }
  function render({ focus = false } = {}) {
    updateTrigger();
    const unread = pending(); required = unread.length > 0;
    dialog.setAttribute('closedby', required || checking ? 'none' : 'closerequest');
    course.textContent = context?.courseName || '';
    close.hidden = required || checking;
    confirm.hidden = !required; retry.hidden = true; home.hidden = !required;
    hint.hidden = !required;
    if (required) {
      const row = unread[0];
      const next = JSON.stringify([row.id,row.title,row.body,unread.length]);
      if (next !== signature) {
        title.textContent = row.title; content.textContent = row.body;
        content.className = 'student-notice-content'; content.scrollTop = 0;
        progress.textContent = unread.length === 1 ? 'Aviso del docente' : `${unread.length} avisos pendientes`;
        signature = next;
      }
      confirm.disabled = !!confirming;
      confirm.textContent = confirming ? 'Guardando lectura…' : 'Entendido';
      openDialog();
      if (focus && dialog.open) title.focus({ preventScroll: true });
    } else if (browsing) {
      title.textContent = 'Avisos del docente'; progress.textContent = 'Avisos de tu materia';
      content.className = 'student-notice-history';
      content.replaceChildren(...rows.map(row => {
        const article = root.createElement('article');
        const heading = root.createElement('h3'); heading.textContent = row.title;
        const body = root.createElement('p'); body.textContent = row.body;
        const read = root.createElement('small'); read.textContent = 'Lectura confirmada';
        article.append(heading, body, read); return article;
      }));
      if (!rows.length) content.textContent = 'Tu docente todavía no ha publicado avisos para ti.';
      openDialog();
    } else {
      closeDialog(); signature = ''; onReady();
    }
  }
  async function refresh() {
    if (!context || !signedIn() || confirming) return;
    if (request) return request;
    const epoch = generation, id = context.courseId, version = revision;
    request = (async () => {
      try {
        const next = await rpc('student_course_notices', { p_course_id: id });
        if (!current(epoch,id) || version !== revision) return;
        if (!Array.isArray(next)) throw new Error('No pudimos comprobar los avisos. Pulsa Reintentar.');
        const changed = JSON.stringify(rows) !== JSON.stringify(next);
        rows = next; checking = false; feedState = 'ready'; message();
        if (changed || !signature || required) render();
        else updateTrigger();
      } catch (failure) {
        if (!current(epoch,id) || version !== revision) return;
        feedState = 'unavailable'; updateTrigger();
        message('No pudimos comprobar los avisos. Revisa tu conexión y pulsa Reintentar.');
        retry.hidden = false;
        if (checking) {
          title.textContent = 'Revisa los avisos'; content.textContent = 'Necesitamos comprobar si tu docente dejó un mensaje antes de continuar.';
          close.hidden = true; home.hidden = false; confirm.hidden = true;
          openDialog(true);
        }
      } finally { if (generation === epoch) request = null; }
    })();
    return request;
  }
  async function acknowledge() {
    const row = pending()[0];
    if (!row || confirming || checking || !context || !signedIn()) return;
    const epoch = generation, id = context.courseId;
    revision++; confirming = row.id; message(); confirm.disabled = true; confirm.textContent = 'Guardando lectura…';
    try {
      const result = await rpc('student_confirm_course_notice', { p_course_id: id, p_notice_id: row.id });
      if (!current(epoch,id)) return;
      if (!result?.retired && !result?.confirmedAt) throw new Error('La lectura no quedó guardada.');
      rows = result.retired ? rows.filter(item => item.id !== row.id)
        : rows.map(item => item.id === row.id ? { ...item, confirmedAt: result.confirmedAt } : item);
      confirming = ''; browsing = false; render({ focus: true });
      if (!required) restoreFocus();
    } catch (failure) {
      if (!current(epoch,id)) return;
      confirming = ''; confirm.disabled = false; confirm.textContent = 'Entendido';
      message('No se guardó tu lectura. Revisa tu conexión y vuelve a pulsar Entendido.');
    }
  }
  function reset() {
    generation++; context = null; rows = []; checking = required = browsing = false;
    feedState = 'hidden'; returnFocus = trigger;
    confirming = ''; request = null; signature = ''; message(); closeDialog(); updateTrigger();
  }
  function open({ opener = trigger } = {}) {
    if (!context || !signedIn()) return;
    returnFocus = opener;
    browsing = !pending().length;
    if (checking) { openDialog(true); void refresh(); return; }
    render(); void refresh();
  }
  trigger.addEventListener('click', open);
  confirm.addEventListener('click', () => { void acknowledge(); });
  retry.addEventListener('click', () => { retry.hidden = true; message(); void refresh(); });
  close.addEventListener('click', () => {
    if (required || checking) return;
    closeDialog(); restoreFocus();
  });
  dialog.addEventListener('cancel', event => {
    if (required || checking) { event.preventDefault(); return; }
    browsing = false;
  });
  // App shortcuts must not walk the avatar or close another view behind the notice.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  reset();
  return {
    reset, refresh, open, isBlocking: () => !!context && (required || checking),
    async enter(next) {
      reset(); context = { ...next }; checking = true; required = true; feedState = 'loading';
      dialog.setAttribute('closedby','none');
      title.textContent = 'Avisos del docente'; course.textContent = context.courseName;
      progress.textContent = 'Antes de entrar'; content.className = 'student-notice-content';
      content.textContent = 'Comprobando los avisos de tu materia…';
      confirm.hidden = close.hidden = retry.hidden = hint.hidden = true; home.hidden = false;
      updateTrigger(); openDialog(true);
      await refresh();
    }
  };
}
