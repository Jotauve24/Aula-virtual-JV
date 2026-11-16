import { ATTACHMENT_ACCEPT, fileSizeLabel } from './attachments.js?v=0.31.0';
import { BOARD_KINDS, BOARD_FILE_HINT, boardDraft, boardLinkLabel, boardPostRights } from './content-board-model.js?v=0.31.0';
import { createContentBoardSession } from './content-board-session.js?v=0.31.0';

export function createContentBoard({ host, rpc, files, signedIn, demo = false, root = document, win = window }) {
  let courseId = '', epoch = 0, nodes = null, searchTimer = 0, observer = null;
  let composer = null, reader = null, selectedFile = null, pending = null, attachment = null;
  let draftDirty = false, configDirty = false, configRevision = 0, busy = false;
  const urls = new Set(), pictureURLs = new Set();
  const session = createContentBoardSession({ rpc, signedIn, onChange });
  const el = (tag, text = '', css = '') => { const node = root.createElement(tag); node.textContent = text; if (css) node.className = css; return node; };
  function button(text, handler, css = 'button secondary') { const node = el('button', text, css); node.type = 'button'; node.addEventListener('click', handler); return node; }
  function field(name, label, tag = 'input') {
    const wrap = el('div', '', 'cb-field'), input = el(tag), caption = el('label', label);
    input.id = name; input.name = name; input.autocomplete = 'off'; caption.htmlFor = name; wrap.append(caption, input); return { wrap, input };
  }
  function option(value, label) { const node = el('option', label); node.value = value; return node; }
  function message(error) { return error.message || 'No se pudo completar la operación. Vuelve a intentarlo.'; }
  function disposePictures() { observer?.disconnect(); observer = null; for (const url of pictureURLs) { win.URL.revokeObjectURL(url); urls.delete(url); } pictureURLs.clear(); }
  function localURL(blob, picture = false) { const url = win.URL.createObjectURL(blob); urls.add(url); if (picture) pictureURLs.add(url); return url; }
  function cleanupPending() { if (pending) { const path = pending.path; pending = null; void files.cancel(path).catch(() => {}); } }
  function dispose() {
    clearTimeout(searchTimer); disposePictures(); cleanupPending(); composer?.dialog.remove(); reader?.remove();
    for (const url of urls) win.URL.revokeObjectURL(url); urls.clear();
    composer = reader = nodes = selectedFile = attachment = null; draftDirty = configDirty = busy = false;
    host.replaceChildren();
  }
  function build() {
    const heading = el('div', '', 'cb-heading'), title = el('h2'); title.append(el('span', 'Tablero de '), el('em', 'contenidos'));
    const intro = el('div'); intro.append(title, el('p', 'Comparte lo que crea tu equipo. Descubre las ideas de los demás.'));
    const actions = el('div', '', 'cb-main-actions');
    const publish = button('Publicar contenido', () => openComposer(), 'button primary');
    const refresh = button('↻', () => void session.load(), 'cb-refresh'); refresh.setAttribute('aria-label', 'Actualizar tablero'); refresh.title = 'Actualizar tablero';
    actions.append(publish, refresh); heading.append(intro, actions);
    const audience = el('p', demo ? 'Vista de prueba docente · Las publicaciones y los archivos de esta demostración son ficticios.'
      : 'Compartido con todos los equipos de esta materia.', 'cb-audience');
    const settings = el('details', '', 'cb-settings'); settings.append(el('summary', 'Indicaciones y permisos'));
    const configForm = el('form', '', 'cb-settings-form'), instructionsField = field('cb-instructions', '¿Qué deben compartir los estudiantes?', 'textarea');
    instructionsField.input.rows = 4; instructionsField.input.maxLength = 4000; instructionsField.input.placeholder = 'Ej.: Cada equipo debe publicar su infografía de la Unidad II…';
    const openLabel = el('label', '', 'cb-check'), postingOpen = el('input'); postingOpen.type = 'checkbox'; postingOpen.name = 'cb-posting-open';
    openLabel.append(postingOpen, el('span', 'Permitir publicaciones de estudiantes'));
    const configSave = el('button', 'Guardar indicaciones', 'button primary'); configSave.type = 'submit';
    const configReload = button('Recargar indicaciones', () => {
      if (configDirty && !win.confirm('¿Descartar tus cambios sin guardar en las indicaciones?')) return;
      configDirty = false; applySettings(session.snapshot()); void session.load();
    }, 'cb-text-button');
    const configStatus = el('p', '', 'cb-muted'); configStatus.setAttribute('role', 'status');
    configForm.append(instructionsField.wrap, openLabel, configSave, configReload, configStatus); settings.append(configForm); settings.hidden = true;
    const instruction = el('section', '', 'cb-instruction'); instruction.append(el('h3', 'Indicaciones del docente'));
    const instructionBody = el('p'); instruction.append(instructionBody); instruction.hidden = true;
    const closed = el('p', 'El docente cerró las publicaciones. Puedes seguir explorando el mural.', 'cb-closed'); closed.hidden = true;
    const toolbar = el('div', '', 'cb-toolbar'), search = field('cb-search', 'Buscar contenido'); search.input.type = 'search'; search.input.maxLength = 120;
    search.input.placeholder = 'Título, texto o autor…';
    const kind = field('cb-kind', 'Tipo de contenido', 'select'); kind.input.append(option('', 'Todos los tipos'));
    for (const [value, label] of Object.entries(BOARD_KINDS)) kind.input.append(option(value, label));
    const filters = el('details', '', 'cb-filters'); filters.append(el('summary', 'Más filtros'));
    const scope = field('cb-scope', 'Publicaciones', 'select'); scope.input.append(option('all', 'Todas'), option('mine', 'Mis publicaciones'), option('hidden', 'Ocultas o retiradas'));
    const topic = field('cb-topic', 'Equipo', 'select'); topic.input.append(option('', 'Todos los equipos'));
    const filterFields = el('div', '', 'cb-filter-fields'); filterFields.append(scope.wrap, topic.wrap); filters.append(filterFields);
    toolbar.append(search.wrap, kind.wrap, filters);
    const summary = el('p', '', 'cb-list-summary'); summary.setAttribute('role', 'status');
    const errorBox = el('div', '', 'cb-error'); errorBox.hidden = true; errorBox.setAttribute('role', 'alert');
    const errorText = el('p'), retry = button('Reintentar', () => void session.load(), 'cb-text-button'); errorBox.append(errorText, retry);
    const notice = el('p', '', 'cb-notice'); notice.setAttribute('role', 'status'); notice.hidden = true;
    const surface = el('div', '', 'cb-surface'), feed = el('div', '', 'cb-feed'); surface.append(feed);
    const more = button('Ver más publicaciones', () => void session.load(true), 'button secondary'); more.hidden = true;
    host.className = 'content-board'; host.replaceChildren(heading, audience, settings, instruction, closed, toolbar, summary, notice, errorBox, surface, more);
    nodes = { publish, refresh, settings, instructionsField: instructionsField.input, postingOpen, configSave, configStatus, configReload,
      instruction, instructionBody, closed, search: search.input, kind: kind.input, scope: scope.input, topic: topic.input, summary, errorBox, errorText, notice, surface, feed, more };
    search.input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => session.filter({ search: search.input.value }), 250); });
    for (const [input, key] of [[kind.input, 'kind'], [scope.input, 'scope'], [topic.input, 'topicId']]) input.addEventListener('change', () => session.filter({ [key]: input.value }));
    instructionsField.input.addEventListener('input', () => { configDirty = true; configStatus.textContent = 'Cambios sin guardar'; });
    postingOpen.addEventListener('change', () => { configDirty = true; configStatus.textContent = 'Cambios sin guardar'; });
    configForm.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || session.snapshot().saving) return;
      try {
        const result = await session.saveSettings(instructionsField.input.value, postingOpen.checked, configRevision);
        if (result) { configDirty = false; configRevision = result.revision; configStatus.textContent = 'Indicaciones guardadas.'; }
      } catch (error) { configStatus.textContent = message(error); }
    });
  }
  function applySettings(state) {
    if (!nodes || !state.actor || !state.settings) return;
    nodes.settings.hidden = !state.actor.isTeacher;
    nodes.instruction.hidden = !state.settings.instructions; nodes.instructionBody.textContent = state.settings.instructions;
    nodes.closed.hidden = state.actor.isTeacher || state.settings.postingOpen;
    if (!configDirty) { nodes.instructionsField.value = state.settings.instructions; nodes.postingOpen.checked = state.settings.postingOpen; configRevision = state.settings.revision; }
    const previous = nodes.topic.value;
    nodes.topic.replaceChildren(option('', 'Todos los equipos'), ...state.groups.map(group => option(group.id, group.name)));
    nodes.topic.value = state.groups.some(group => group.id === previous) ? previous : '';
  }
  function onChange(kind, state) {
    if (kind === 'reset') { dispose(); return; }
    if (!nodes) return;
    const hasActor = !!state.actor;
    nodes.publish.disabled = busy || state.saving || !hasActor || !state.actor.isTeacher && !state.settings?.postingOpen;
    nodes.refresh.disabled = state.loading; nodes.more.disabled = state.loading; nodes.configSave.disabled = state.saving;
    nodes.more.hidden = !state.hasMore; nodes.more.textContent = state.loading ? 'Cargando…' : 'Ver más publicaciones';
    nodes.errorBox.hidden = !state.error || composer?.dialog.open === true; nodes.errorText.textContent = state.error;
    nodes.notice.hidden = !state.notice; nodes.notice.textContent = demo && state.notice ? 'Prueba actualizada solo en esta demostración.' : state.notice;
    nodes.summary.textContent = state.loading ? (hasActor ? 'Actualizando publicaciones…' : 'Cargando tablero…')
      : state.phase === 'error' && !hasActor ? 'Publicaciones no disponibles'
      : `${state.total} ${state.total === 1 ? 'publicación' : 'publicaciones'}${state.hasMore ? ` · ${state.posts.length} cargadas` : ''}`;
    host.setAttribute('aria-busy', String(state.loading));
    if (kind === 'loaded') { applySettings(state); renderPosts(state); }
    if (kind === 'error' && !state.actor) {
      disposePictures(); nodes.feed.replaceChildren(); nodes.settings.hidden = nodes.instruction.hidden = nodes.closed.hidden = true;
      nodes.topic.replaceChildren(option('', 'Todos los equipos'));
    }
    for (const control of nodes.feed.querySelectorAll('[data-post-action]')) control.disabled = state.saving || busy;
  }
  function renderPosts(state) {
    disposePictures();
    if (!state.posts.length) {
      const empty = el('div', '', 'cb-empty');
      const filtered = state.filters.kind || state.filters.scope !== 'all' || state.filters.topicId || state.filters.search;
      empty.append(el('h3', filtered ? 'No hay publicaciones con estos filtros' : 'El mural empieza con una idea'),
        el('p', filtered ? 'Prueba otro tipo de contenido o busca con menos palabras.' : 'Comparte una nota, una infografía o un recurso para que los demás equipos puedan consultarlo.'));
      if (filtered) empty.append(button('Quitar filtros', () => {
        nodes.search.value = nodes.kind.value = nodes.topic.value = ''; nodes.scope.value = 'all';
        session.filter({ kind: '', scope: 'all', topicId: '', search: '' });
      }, 'cb-text-button'));
      nodes.feed.replaceChildren(empty); nodes.surface.dataset.empty = 'true'; return;
    }
    nodes.surface.dataset.empty = 'false';
    if (typeof win.IntersectionObserver === 'function') observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void loadPicture(entry.target); }
    }, { rootMargin: '180px' });
    nodes.feed.replaceChildren(...state.posts.map(post => card(post, state.actor)));
  }
  function card(post, actor) {
    const card = el('article', '', 'cb-card'); card.id = 'board-post-' + post.id; card.dataset.kind = post.kind; card.dataset.state = post.state;
    const pin = el('span', '', 'cb-paper-pin'); pin.setAttribute('aria-hidden', 'true'); card.append(pin);
    const top = el('div', '', 'cb-card-meta'); top.append(el('span', BOARD_KINDS[post.kind], 'cb-kind-label'));
    if (post.pinned) top.append(el('span', 'Destacado', 'cb-featured'));
    card.append(top);
    if (post.attachment?.type.startsWith('image/') || demo && post.demoImage === 'teamwork') {
      const picture = el('div', '', 'cb-picture'), image = root.createElement('img');
      image.alt = post.title; image.width = 560; image.height = 360; image.loading = 'lazy'; image.decoding = 'async'; image.dataset.path = post.attachment?.path || '';
      picture.append(image); card.append(picture);
      if (demo && post.demoImage === 'teamwork') image.src = new URL('./board-example.svg', import.meta.url).href;
      else if (observer) observer.observe(image); else queueMicrotask(() => void loadPicture(image));
    }
    const title = el('h3'); title.append(button(post.title, () => openReader(post), 'cb-post-title')); card.append(title);
    if (post.body) card.append(el('p', post.body.length > 320 ? post.body.slice(0, 320) + '…' : post.body, 'cb-post-body'));
    if (post.body.length > 320) card.append(button('Leer publicación completa', () => openReader(post), 'cb-text-button'));
    appendResources(card, post);
    const by = el('p', '', 'cb-byline'); by.append(el('strong', post.authorName), el('span', post.authorIsTeacher ? 'Docente' : post.topicName || 'Estudiante · sin equipo'));
    const time = el('time', new Intl.DateTimeFormat('es-PA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(post.createdAt)));
    time.dateTime = post.createdAt; by.append(time); card.append(by);
    if (post.state !== 'visible') card.append(el('p', post.state === 'hidden' ? 'Oculta por el docente' : 'Retirada por su autor', 'cb-visibility'));
    const rights = boardPostRights(post, actor);
    if (rights.edit || rights.remove || rights.restore || rights.moderate) {
      const actions = el('details', '', 'cb-post-actions'), summary = el('summary', '•••'); summary.setAttribute('aria-label', `Opciones de ${post.title}`); summary.title = 'Opciones de la publicación';
      actions.append(summary);
      function action(text, handler) { const control = button(text, handler, 'cb-text-button'); control.dataset.postAction = ''; actions.append(control); }
      if (rights.edit) action('Editar', () => openComposer(post));
      if (rights.moderate && post.state === 'visible') action(post.pinned ? 'Quitar destacado' : 'Destacar', () => void act(post, post.pinned ? 'unpin' : 'pin'));
      if (rights.moderate && post.state === 'visible') action('Ocultar', () => void act(post, 'hide'));
      if (rights.remove && post.state === 'visible') action('Retirar', () => void act(post, 'remove'));
      if (rights.restore) action('Restaurar', () => void act(post, 'restore'));
      card.append(actions);
    }
    return card;
  }
  async function loadPicture(image) {
    const token = epoch;
    try {
      const blob = await files.blob({ path: image.dataset.path });
      if (token !== epoch || !image.isConnected) return;
      image.src = localURL(blob, true);
      image.addEventListener('error', () => { image.hidden = true; }, { once: true });
    } catch { if (image.isConnected) image.hidden = true; }
  }
  function appendResources(parent, post) {
    if (post.attachment) {
      const file = button('Descargar ' + post.attachment.name, () => void download(post.attachment), 'cb-file');
      file.append(el('small', fileSizeLabel(post.attachment.size))); parent.append(file);
    }
    if (post.url) {
      const link = el('a', post.kind === 'video' ? 'Ver video ↗' : 'Abrir recurso ↗', 'cb-link'); link.href = post.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.append(el('small', boardLinkLabel(post.url))); parent.append(link);
    }
  }
  async function download(attachment) {
    const token = epoch;
    try {
      const blob = await files.blob(attachment); if (token !== epoch) return;
      const url = localURL(blob), link = el('a'); link.href = url; link.download = attachment.name; root.body.append(link); link.click(); link.remove();
      setTimeout(() => { win.URL.revokeObjectURL(url); urls.delete(url); }, 30000);
    } catch (error) { if (token === epoch) { nodes.errorText.textContent = message(error); nodes.errorBox.hidden = false; } }
  }
  function openReader(post) {
    reader?.remove(); reader = el('dialog', '', 'cb-dialog cb-reader');
    reader.setAttribute('aria-labelledby', 'cb-reader-title');
    const close = button('Cerrar', () => { reader.close(); root.getElementById('board-post-' + post.id)?.querySelector('.cb-post-title')?.focus(); }, 'button secondary');
    const title = el('h2', post.title); title.id = 'cb-reader-title';
    reader.append(el('p', BOARD_KINDS[post.kind], 'cb-muted'), title, el('p', post.body, 'cb-reader-body'));
    appendResources(reader, post); reader.append(close); root.body.append(reader); reader.showModal();
  }
  async function act(post, action) {
    if (['hide', 'remove'].includes(action) && !win.confirm(action === 'hide'
      ? `¿Ocultar “${post.title}” a los demás estudiantes? Podrás restaurarla desde los filtros.`
      : `¿Retirar “${post.title}” del mural? Podrás restaurarla desde tus publicaciones.`)) return;
    try { await session.action(post, action); } catch { /* The board displays the error and preserves the current rows. */ }
  }
  function openComposer(post = null) {
    if (busy || !session.snapshot().actor) return;
    composer?.dialog.remove(); cleanupPending(); selectedFile = null; attachment = post?.attachment ?? null;
    const dialog = el('dialog', '', 'cb-dialog'), form = el('form'); form.noValidate = true;
    const heading = el('h2', post ? 'Editar publicación' : 'Una idea para el mural'); heading.id = 'cb-composer-heading'; dialog.setAttribute('aria-labelledby', heading.id);
    const title = field('cb-title', 'Título'), kind = field('cb-post-kind', 'Tipo de contenido', 'select'), body = field('cb-body', 'Texto o descripción', 'textarea'), url = field('cb-url', 'Enlace del recurso o video (opcional)');
    title.input.maxLength = 120; title.input.value = post?.title ?? ''; title.input.placeholder = 'Ej.: Nuestra infografía de la Unidad II…';
    for (const [value, label] of Object.entries(BOARD_KINDS)) kind.input.append(option(value, label)); kind.input.value = post?.kind ?? 'note';
    body.input.rows = 5; body.input.maxLength = 3000; body.input.value = post?.body ?? ''; body.input.placeholder = 'Comparte una idea o explica qué encontrará tu equipo…';
    url.input.type = 'url'; url.input.inputMode = 'url'; url.input.spellcheck = false; url.input.maxLength = 2000; url.input.placeholder = 'https://…'; url.input.value = post?.url ?? '';
    const file = field('cb-file', 'Archivo (opcional)'); file.input.type = 'file'; file.input.accept = ATTACHMENT_ACCEPT;
    const selected = el('p', attachment ? attachment.name + ' · ' + fileSizeLabel(attachment.size) : BOARD_FILE_HINT, 'cb-muted');
    const removeFile = button('Quitar archivo', () => { cleanupPending(); selectedFile = attachment = null; file.input.value = ''; selected.textContent = BOARD_FILE_HINT; removeFile.hidden = true; draftDirty = true; }, 'cb-text-button'); removeFile.hidden = !attachment;
    const error = el('p', '', 'cb-error'); error.hidden = true; error.setAttribute('role', 'alert');
    const save = el('button', demo ? 'Publicar prueba' : post ? 'Guardar cambios' : 'Publicar contenido', 'button primary'); save.type = 'submit';
    const cancel = button('Cancelar', () => closeComposer(), 'button secondary'), status = el('p', '', 'cb-muted'); status.setAttribute('role', 'status');
    const actions = el('div', '', 'cb-composer-actions'); actions.append(cancel, save);
    form.append(heading, el('p', demo ? 'Publicación ficticia. Solo cambia esta demostración.' : 'La verán los equipos de esta materia.', 'cb-muted'),
      title.wrap, kind.wrap, body.wrap, url.wrap, file.wrap, selected, removeFile, error, status, actions); dialog.append(form); root.body.append(dialog);
    composer = { dialog, form, title: title.input, kind: kind.input, body: body.input, url: url.input, file: file.input, save, cancel, error, status, removeFile };
    draftDirty = false; const draftId = post?.id ?? win.crypto.randomUUID(), token = epoch, id = courseId;
    for (const input of [title.input, kind.input, body.input, url.input]) input.addEventListener('input', () => { draftDirty = true; error.hidden = true; });
    file.input.addEventListener('change', () => { cleanupPending(); selectedFile = file.input.files[0] ?? null; draftDirty = true; removeFile.hidden = !selectedFile && !attachment;
      selected.textContent = selectedFile ? selectedFile.name + ' · ' + fileSizeLabel(selectedFile.size) : attachment?.name ?? BOARD_FILE_HINT; });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeComposer(); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || session.snapshot().saving) return;
      let draft;
      try { draft = boardDraft({ title: title.input.value, body: body.input.value, kind: kind.input.value, url: url.input.value, attachment }, { file: selectedFile }); }
      catch (failure) { error.textContent = message(failure); error.hidden = false; (title.input.value.trim() ? ['video', 'link'].includes(kind.input.value) ? url.input : body.input : title.input).focus(); return; }
      busy = true; error.hidden = true; status.textContent = selectedFile ? 'Subiendo archivo y publicando…' : 'Publicando…';
      for (const control of form.querySelectorAll('input,textarea,select,button')) control.disabled = true;
      try {
        if (selectedFile && !pending) {
          const path = await files.upload(id, selectedFile, draft.info);
          if (token !== epoch || id !== courseId) { void files.cancel(path).catch(() => {}); return; }
          pending = { path, name: draft.info.name };
        }
        draft.data.attachment = pending ?? attachment;
        const saved = await session.save(draftId, post?.revision ?? 0, draft.data);
        if (token !== epoch || id !== courseId || !saved) return;
        const replaced = attachment?.path; pending = null; draftDirty = false; busy = false; closeComposer(true);
        if (replaced && replaced !== saved.attachment?.path) void files.cancel(replaced).catch(() => {});
      } catch (failure) { if (token === epoch) { error.textContent = message(failure); error.hidden = false; status.textContent = 'Tus cambios siguen aquí. Puedes reintentar.'; } }
      finally { if (token === epoch) { busy = false; for (const control of form.querySelectorAll('input,textarea,select,button')) control.disabled = false; onChange('settled', session.snapshot()); } }
    });
    dialog.showModal();
  }
  function closeComposer(force = false) {
    if (!composer || busy) return;
    if (!force && draftDirty && !win.confirm('¿Descartar esta publicación sin guardar?')) return;
    cleanupPending(); composer.dialog.close(); composer.dialog.remove(); composer = null; draftDirty = false;
    selectedFile = attachment = null; nodes?.publish.focus();
  }
  win.addEventListener('beforeunload', event => { if (draftDirty || configDirty) { event.preventDefault(); event.returnValue = ''; } });
  return {
    setContext(id) { if (id === courseId) return; epoch++; courseId = id; session.setContext(id); },
    open() { if (!courseId || !signedIn()) return; if (!nodes) build(); if (['idle', 'error'].includes(session.snapshot().phase)) void session.load(); },
    reset() { epoch++; courseId = ''; session.reset(); },
    hasUnsaved: () => draftDirty || configDirty,
    snapshot: () => session.snapshot()
  };
}
