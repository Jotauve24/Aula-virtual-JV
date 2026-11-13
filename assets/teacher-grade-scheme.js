import { DEFAULT_GRADE_ACTIVITIES, GRADE_ACTIVITY_LIMIT, parseGrade, validateGradeActivities } from './grade-calculator-model.js?v=0.29.0';

const number = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 2 });
export function createTeacherGradeScheme({ host, rpc, signedIn, root = document, win = window }) {
  let courseId = '', epoch = 0, revision = 0, loaded = false, busy = false, dirty = false, conflict = false;
  let rows = [], reference, list, total, error, status, save, reload, add;
  function el(tag, text = '', className = '') {
    const node = root.createElement(tag); node.textContent = text; if (className) node.className = className; return node;
  }
  function button(text, handler, className = 'button secondary') {
    const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', handler); return node;
  }
  function field(name, value, label, decimal = false) {
    const node = el('input'); node.type = 'text'; node.name = name; node.id = name; node.value = value;
    node.autocomplete = 'off'; node.maxLength = decimal ? 6 : 100;
    node.setAttribute('aria-label', label); if (decimal) node.inputMode = 'decimal'; return node;
  }
  function reset() {
    epoch++; courseId = ''; revision = 0; loaded = busy = dirty = conflict = false; rows = [];
    reference = list = total = error = status = save = reload = add = null;
    host.removeAttribute('aria-busy');
    host.open = false; host.replaceChildren(el('summary', 'Calculadora de notas'));
  }
  function setContext(id) {
    if (id === courseId) return;
    reset(); courseId = id;
  }
  function current(token, id) { return token === epoch && courseId === id && signedIn(); }
  async function load() {
    if (!courseId || busy || !signedIn()) return;
    const id = courseId, token = ++epoch; busy = true;
    host.setAttribute('aria-busy', 'true');
    if (save) setBusy(true, true);
    else {
      host.replaceChildren(el('summary', 'Calculadora de notas'), el('p', 'Cargando configuración…', 'grade-settings-content'));
    }
    try {
      const scheme = await rpc('teacher_grade_scheme', { p_course_id: id });
      if (!current(token, id)) return;
      revision = scheme?.revision ?? 0; conflict = false; dirty = false; loaded = true;
      render(scheme);
    } catch (failure) {
      if (!current(token, id)) return;
      if (loaded) { error.textContent = failure.message; error.hidden = false; }
      else {
        const message = el('p', failure.message || 'No se pudo cargar la configuración.', 'grade-error'); message.setAttribute('role', 'alert');
        const content = el('div', '', 'grade-settings-content'); content.append(message, button('Reintentar', () => load()));
        host.replaceChildren(el('summary', 'Calculadora de notas'), content);
      }
    } finally {
      if (current(token, id)) { busy = false; host.removeAttribute('aria-busy'); if (loaded) setBusy(false); }
    }
  }
  function setBusy(value, loading = false) {
    save.disabled = value || conflict; save.textContent = value ? (loading ? 'Cargando…' : 'Guardando…') : revision ? 'Guardar cambios' : 'Activar calculadora';
    reload.disabled = value; add.disabled = value || rows.length >= GRADE_ACTIVITY_LIMIT; reference.disabled = value;
    for (const row of rows) { row.name.disabled = row.weight.disabled = row.remove.disabled = value; }
    updateRowControls();
  }
  function updateRowControls() {
    rows.forEach((row, index) => {
      const name = row.name.value.trim() || 'actividad';
      row.up.disabled = busy || index === 0;
      row.down.disabled = busy || index === rows.length - 1;
      row.up.setAttribute('aria-label', `Subir ${name}`); row.up.title = `Subir ${name}`;
      row.down.setAttribute('aria-label', `Bajar ${name}`); row.down.title = `Bajar ${name}`;
      row.controls.setAttribute('aria-label', `Ordenar o quitar ${name}`);
    });
  }
  function moveRow(id, step, trigger) {
    if (busy) return;
    const from = rows.findIndex(row => row.id === id), to = from + step;
    if (from < 0 || to < 0 || to >= rows.length) return;
    const [row] = rows.splice(from, 1); rows.splice(to, 0, row);
    // Move the existing nodes: edited values, IDs and linked student notes stay intact.
    list.insertBefore(row.item, rows[to + 1]?.item ?? null);
    changed();
    status.textContent = `${row.name.value.trim() || 'Actividad'}: posición ${number.format(to + 1)} de ${number.format(rows.length)}. Cambios sin guardar.`;
    (trigger.disabled ? row.name : trigger).focus();
  }
  function changed() {
    dirty = true; error.hidden = true; status.textContent = 'Cambios sin guardar'; updateTotal();
  }
  function updateTotal() {
    let units = 0, valid = true;
    for (const row of rows) {
      try {
        const value = parseGrade(row.weight.value); units += Math.round(value * 100);
        if (!value) { valid = false; row.weight.setAttribute('aria-invalid', 'true'); }
        else row.weight.removeAttribute('aria-invalid');
      }
      catch { valid = false; row.weight.setAttribute('aria-invalid', 'true'); }
    }
    total.textContent = valid ? `Total: ${number.format(units / 100)} % de 100 %` : 'Revisa los porcentajes; deben ser mayores que 0.';
    total.dataset.valid = String(valid && units === 10000); add.disabled = busy || rows.length >= GRADE_ACTIVITY_LIMIT;
    updateRowControls();
  }
  function addRow(activity, focus = false) {
    const item = el('div', '', 'grade-setting-row');
    const name = field(`scheme-name-${activity.id}`, activity.name, 'Nombre de la actividad');
    const weight = field(`scheme-weight-${activity.id}`, activity.weight, `Porcentaje de ${activity.name || 'la actividad'}`, true);
    name.placeholder = 'Ej.: Proyecto final…'; weight.placeholder = 'Ej.: 20…';
    const weightBox = el('div', '', 'grade-row-weight'), percent = el('span', '%');
    percent.setAttribute('aria-hidden', 'true'); weightBox.append(weight, percent);
    const controls = el('div', '', 'grade-row-controls'); controls.setAttribute('role', 'group');
    const up = button('↑', () => moveRow(activity.id, -1, up), 'grade-row-button');
    const down = button('↓', () => moveRow(activity.id, 1, down), 'grade-row-button');
    const remove = button('×', () => {
      if (busy) return;
      rows = rows.filter(row => row.id !== activity.id); item.remove(); changed(); add.focus();
    }, 'grade-row-button grade-remove');
    remove.setAttribute('aria-label', `Quitar ${activity.name || 'actividad'}`); remove.title = 'Quitar actividad';
    name.addEventListener('input', () => {
      weight.setAttribute('aria-label', `Porcentaje de ${name.value || 'la actividad'}`);
      remove.setAttribute('aria-label', `Quitar ${name.value || 'actividad'}`); changed();
    });
    weight.addEventListener('input', changed); controls.append(up, down, remove); item.append(name, weightBox, controls); list.append(item);
    rows.push({ id: activity.id, item, name, weight, controls, up, down, remove }); updateRowControls(); if (focus) name.focus();
  }
  function render(scheme) {
    rows = [];
    const summary = el('summary', 'Calculadora de notas');
    const content = el('div', '', 'grade-settings-content');
    content.append(el('h2', 'Actividades y porcentajes'),
      el('p', 'Configura esta materia para que tus estudiantes calculen su nota final y lo que necesitan en las actividades pendientes. Sus simulaciones son privadas.'));
    if (!scheme) content.append(el('p', 'Plantilla sugerida. Revisa los nombres y porcentajes según tu programa; se publicará cuando pulses Activar calculadora.', 'grade-notice'));
    else content.append(el('p', 'Los porcentajes nuevos se aplican al recargar la calculadora. Renombrar conserva las notas; para sustituir una actividad, quítala y añade otra.', 'grade-muted'));
    content.append(el('p', 'Usa ↑ y ↓ para cambiar el orden. Puedes colocar un foro justo después de su unidad.', 'grade-muted'));
    const heading = el('div', '', 'grade-setting-labels'); heading.append(el('span', 'Actividad'), el('span', 'Porcentaje'), el('span', 'Orden'));
    list = el('div', '', 'grade-setting-list');
    add = button('Añadir actividad', () => {
      if (rows.length >= GRADE_ACTIVITY_LIMIT || busy) return;
      addRow({ id: 'a-' + crypto.randomUUID(), name: '', weight: '' }, true); changed();
    });
    total = el('p', '', 'grade-weight-total'); total.setAttribute('role', 'status');
    const activityActions = el('div', '', 'grade-setting-actions'); activityActions.append(add, total);
    const target = el('div', '', 'grade-target');
    const label = el('label', 'Meta de referencia'); label.htmlFor = 'scheme-reference';
    reference = field('scheme-reference', scheme?.referenceGrade ?? 71, 'Meta de referencia, de 0 a 100', true);
    reference.addEventListener('input', changed);
    target.append(label, reference, el('span', '/ 100 · Cada estudiante puede probar otra meta.', 'grade-muted'));
    error = el('p', '', 'grade-error'); error.hidden = true; error.setAttribute('role', 'alert');
    status = el('span', scheme ? 'Configuración publicada' : 'Aún sin publicar', 'grade-muted'); status.setAttribute('role', 'status');
    save = button(scheme ? 'Guardar cambios' : 'Activar calculadora', () => void saveScheme(), 'button primary');
    reload = button('Recargar configuración', () => {
      if (dirty && !win.confirm('Se reemplazarán tus cambios sin guardar por la configuración publicada. ¿Recargar?')) return;
      void load();
    }, 'grade-text-button');
    const footer = el('div', '', 'grade-save-row'); footer.append(save, status, reload);
    content.append(heading, list, activityActions, target, error, footer); host.replaceChildren(summary, content);
    for (const activity of scheme?.activities ?? DEFAULT_GRADE_ACTIVITIES) addRow(activity);
    updateTotal();
  }
  async function saveScheme() {
    if (busy || conflict || !signedIn()) return;
    let activities, referenceGrade;
    try {
      activities = validateGradeActivities(rows.map(row => ({ id: row.id, name: row.name.value, weight: row.weight.value })));
      referenceGrade = parseGrade(reference.value, { label: 'La meta de referencia' });
    } catch (failure) {
      error.textContent = failure.message; error.hidden = false;
      const missingName = rows.find(row => !row.name.value.trim());
      const invalidWeight = rows.find(row => row.weight.getAttribute('aria-invalid') === 'true');
      let focus = missingName?.name ?? invalidWeight?.weight ?? rows[0]?.weight ?? reference;
      try { parseGrade(reference.value); } catch { focus = reference; }
      focus.focus(); return;
    }
    const id = courseId, token = epoch; busy = true; setBusy(true); error.hidden = true; status.textContent = 'Guardando configuración…';
    try {
      const scheme = await rpc('teacher_save_grade_scheme', { p_course_id: id, p_activities: activities,
        p_reference_grade: referenceGrade, p_expected_revision: revision });
      if (!current(token, id)) return;
      revision = scheme.revision; dirty = false;
      status.textContent = 'Configuración publicada. Ya está disponible en esta materia.';
    } catch (failure) {
      if (!current(token, id)) return;
      conflict = failure.code === 'PT409'; error.textContent = failure.message || 'No se pudo guardar. Reintenta.'; error.hidden = false;
      status.textContent = conflict ? 'Recarga la configuración antes de guardar.' : 'Tus cambios siguen aquí.';
    } finally { if (current(token, id)) { busy = false; setBusy(false); } }
  }
  host.className = 'grade-settings'; reset();
  host.addEventListener('toggle', () => { if (host.open && !loaded && !busy) void load(); });
  win.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  return { setContext, reset, hasUnsaved: () => dirty };
}
