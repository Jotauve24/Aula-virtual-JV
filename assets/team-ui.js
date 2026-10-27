export function normalizeTeamName(value) {
  const name = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if ([...name].length < 2 || [...name].length > 80)
    throw new Error('Escribe un nombre de entre 2 y 80 caracteres.');
  return name;
}

export function teamLockIcon() {
  const icon = document.createElement('span');
  icon.className = 'team-lock-icon'; icon.setAttribute('aria-hidden','true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M12 14v3"/></svg>';
  return icon;
}

// The light follows the room, while the canvas and its hit targets stay intact.
export function renderTeamLight(node, layout, index) {
  const room = layout.rooms[index];
  node.hidden = !room;
  if (!room) return;
  for (const [property, value, total] of [
    ['left', room.x, layout.width], ['top', room.y, layout.height],
    ['width', room.w, layout.width], ['height', room.h, layout.height]
  ]) node.style[property] = value / total * 100 + '%';
}

let editorCount = 0;
export function createTeamNameControl({ name, onSave }) {
  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag);
    node.textContent = text; node.className = className;
    return node;
  };
  let currentName = name, expectedName = name, busy = false;
  const root = el('div', '', 'team-name-control');
  const row = el('div', '', 'team-name-row');
  const title = el('h3', name);
  const edit = el('button', '', 'button secondary team-name-edit');
  edit.type = 'button'; edit.title = 'Cambiar nombre del equipo';
  edit.setAttribute('aria-label', 'Cambiar el nombre de mi equipo');
  edit.setAttribute('aria-expanded', 'false');
  edit.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-13 13H3v-5L16 3Z"/><path d="m14 5 5 5"/></svg>';
  row.append(title, edit);
  const form = el('form', '', 'team-name-form'); form.hidden = true; form.noValidate = true;
  form.id = 'team-name-form-' + (++editorCount);
  edit.setAttribute('aria-controls', form.id);
  const label = el('label', 'Nombre del equipo');
  const input = document.createElement('input'); input.type = 'text'; input.name = 'teamName';
  input.id = 'team-name-input-' + editorCount; label.htmlFor = input.id;
  input.required = true; input.minLength = 2; input.maxLength = 80;
  input.autocomplete = 'off'; input.value = name;
  const hint = el('p', 'Acuerden el nombre entre todos. Lo verán tus compañeros y el docente.', 'field-hint');
  hint.id = 'team-name-hint-' + editorCount;
  const error = el('p', '', 'field-error'); error.hidden = true;
  error.id = 'team-name-error-' + editorCount; error.setAttribute('role', 'alert');
  input.setAttribute('aria-describedby', hint.id + ' ' + error.id);
  const actions = el('div', '', 'team-name-actions');
  const save = el('button', 'Guardar nombre', 'button primary'); save.type = 'submit';
  const cancel = el('button', 'Cancelar', 'button secondary'); cancel.type = 'button';
  actions.append(save, cancel); form.append(label, input, hint, error, actions);
  root.append(row, form);
  function close() {
    form.hidden = true; row.hidden = false; error.hidden = true;
    input.removeAttribute('aria-invalid'); edit.setAttribute('aria-expanded', 'false');
    if (root.isConnected) edit.focus({ preventScroll: true });
  }
  edit.addEventListener('click', () => {
    expectedName = currentName; input.value = currentName;
    row.hidden = true; form.hidden = false; error.hidden = true;
    edit.setAttribute('aria-expanded', 'true'); input.focus(); input.select();
  });
  cancel.addEventListener('click', () => { if (!busy) close(); });
  form.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); if (!busy) close(); }
  });
  const update = value => { currentName = value; title.textContent = value; };
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    error.hidden = true; input.removeAttribute('aria-invalid');
    try {
      const value = normalizeTeamName(input.value);
      if (value === currentName && expectedName === currentName) { close(); return; }
      busy = true; input.disabled = save.disabled = cancel.disabled = true;
      form.setAttribute('aria-busy', 'true'); save.textContent = 'Guardando…';
      const saved = await onSave(value, expectedName);
      if (typeof saved === 'string') { update(saved); close(); }
    } catch (failure) {
      error.textContent = failure.message || 'No se pudo guardar el nombre. Inténtalo otra vez.';
      error.hidden = false; input.setAttribute('aria-invalid', 'true');
    } finally {
      busy = false; input.disabled = save.disabled = cancel.disabled = false;
      form.removeAttribute('aria-busy'); save.textContent = 'Guardar nombre';
      if (!form.hidden && root.isConnected) input.focus({ preventScroll: true });
    }
  });
  return { element: root, update };
}
