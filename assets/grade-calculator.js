import { calculateGrades } from './grade-calculator-model.js?v=0.28.1';
import { createGradeSession } from './grade-calculator-session.js?v=0.28.1';

const format = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 2 });
const n = value => format.format(value);
const pointFormat = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 6 });
const points = value => pointFormat.format(value);
export function createStudentGradeCalculator({ host, rpc, signedIn, root = document, win = window }) {
  let fields = new Map(), goalInput, results, quickResult, errorBox, saveButton, saveStatus, reloadButton, noticeBox;
  const session = createGradeSession({ rpc, signedIn, onChange });
  function el(tag, text = '', className = '') {
    const node = root.createElement(tag); node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, handler, className = 'button secondary') {
    const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', handler); return node;
  }
  function input(name, value, label, hint) {
    const node = el('input'); node.type = 'text'; node.inputMode = 'decimal'; node.name = name;
    node.id = name; node.autocomplete = 'off'; node.maxLength = 6; node.value = value ?? '';
    node.setAttribute('aria-label', label); if (hint) node.setAttribute('aria-describedby', hint);
    return node;
  }
  function onChange(kind, state) {
    if (kind === 'reset') { host.replaceChildren(); host.removeAttribute('aria-busy'); fields.clear(); saveButton = null; return; }
    if (kind === 'loading') {
      host.setAttribute('aria-busy', 'true');
      for (const field of fields.values()) field.disabled = true;
      if (goalInput) goalInput.disabled = true;
      if (saveButton) saveButton.disabled = true;
      if (reloadButton) reloadButton.disabled = true;
      return;
    }
    host.removeAttribute('aria-busy');
    if (kind === 'loaded' || (state.phase === 'error' && !saveButton)) render(state);
    if (state.phase === 'ready' && state.scheme) update(state);
  }
  function render(state) {
    fields = new Map(); goalInput = results = errorBox = saveButton = saveStatus = reloadButton = noticeBox = null;
    const heading = el('div', '', 'grade-heading');
    heading.append(el('h2', 'Calculadora de nota final'), el('p', 'Prueba tus notas y descubre qué necesitas para llegar a tu meta.'));
    host.className = 'grade-calculator'; host.replaceChildren(heading);
    if (state.phase === 'error') {
      const error = el('p', state.error, 'grade-error'); error.setAttribute('role', 'alert');
      host.append(error, button('Reintentar', () => session.load())); return;
    }
    if (!state.scheme) {
      host.append(el('p', 'Tu docente todavía no ha configurado las actividades y sus porcentajes para esta materia.', 'grade-empty'),
        button('Comprobar configuración', () => session.load())); return;
    }
    const personal = el('p', 'Simulación personal · Escala de 0 a 100. Estas cifras no son calificaciones oficiales.', 'grade-personal');
    const grid = el('div', '', 'grade-workspace');
    const editor = el('div', '', 'grade-input-panel');
    const target = el('div', '', 'grade-target');
    const label = el('label', 'Tu meta final'); label.htmlFor = 'grade-goal';
    goalInput = input('grade-goal', state.goal, 'Tu meta final, de 0 a 100');
    goalInput.addEventListener('input', () => session.edit({ goal: goalInput.value }));
    target.append(label, goalInput, el('span', `/ 100 · Referencia del docente: ${n(state.scheme.referenceGrade)}`, 'grade-muted'));
    const hint = el('p', 'Escribe cada nota sobre 100. Deja vacías las que siguen pendientes; escribe 0 si esa fue la nota.', 'grade-muted'); hint.id = 'grade-input-hint';
    const table = el('table', '', 'grade-table');
    const caption = el('caption', 'Actividades y porcentajes de esta materia', 'sr-only');
    const head = el('thead'), headRow = el('tr');
    for (const text of ['Actividad', 'Peso', 'Tu nota']) { const th = el('th', text); th.scope = 'col'; headRow.append(th); }
    head.append(headRow); const body = el('tbody');
    for (const activity of state.scheme.activities) {
      const row = el('tr'), name = el('th', activity.name); name.scope = 'row';
      const cell = el('td'), field = input(`grade-${activity.id}`, state.values[activity.id], `Nota de ${activity.name}, de 0 a 100`, 'grade-input-hint');
      field.placeholder = 'Pendiente…'; field.addEventListener('input', () => session.edit({ id: activity.id, value: field.value }));
      fields.set(activity.id, field); cell.append(field); row.append(name, el('td', `${n(activity.weight)} %`), cell); body.append(row);
    }
    quickResult = el('p', '', 'grade-quick-result');
    table.append(caption, head, body); editor.append(target, quickResult, hint, table);
    results = el('section', '', 'grade-results'); results.id = 'grade-results'; results.setAttribute('aria-label', 'Resultado de la simulación');
    grid.append(editor, results);
    noticeBox = el('p', state.notice, 'grade-notice'); noticeBox.hidden = !state.notice; noticeBox.setAttribute('role', 'status');
    errorBox = el('p', '', 'grade-error'); errorBox.hidden = true; errorBox.setAttribute('role', 'alert');
    const footer = el('div', '', 'grade-save-row');
    saveButton = button('Guardar simulación', () => {
      const bad = [...fields.values(), goalInput].find(field => field.getAttribute('aria-invalid') === 'true');
      if (bad) { bad.focus(); return; }
      void session.save();
    }, 'button primary');
    saveStatus = el('span', '', 'grade-muted'); saveStatus.setAttribute('role', 'status');
    reloadButton = button('Recargar datos guardados', () => {
      if (session.snapshot().dirty && !win.confirm('Se reemplazarán tus cambios sin guardar por la simulación guardada. ¿Recargar?')) return;
      void session.load();
    }, 'grade-text-button');
    footer.append(saveButton, saveStatus, reloadButton);
    host.append(personal, noticeBox, grid, errorBox, footer);
  }
  function update(state) {
    let result, validation = '';
    goalInput.disabled = false;
    for (const [id, field] of fields) {
      field.disabled = false;
      try { calculateGrades(state.scheme.activities, { [id]: field.value }, 0); field.removeAttribute('aria-invalid'); }
      catch { field.setAttribute('aria-invalid', 'true'); }
    }
    try { result = calculateGrades(state.scheme.activities, state.values, state.goal); goalInput.removeAttribute('aria-invalid'); }
    catch (error) {
      validation = error.message;
      try { calculateGrades(state.scheme.activities, {}, state.goal); goalInput.removeAttribute('aria-invalid'); }
      catch { goalInput.setAttribute('aria-invalid', 'true'); }
    }
    results.replaceChildren();
    if (!result) {
      quickResult.textContent = 'Corrige las notas para ver tu mínimo.';
      results.append(el('h3', 'Revisa las notas'), el('p', 'Usa valores entre 0 y 100, con hasta dos decimales. El cálculo aparecerá al corregirlos.'));
    }
    else renderResult(result);
    errorBox.textContent = state.error || validation; errorBox.hidden = !errorBox.textContent;
    noticeBox.textContent = state.notice; noticeBox.hidden = !state.notice;
    saveButton.disabled = state.saving || state.conflict;
    saveButton.textContent = state.saving ? 'Guardando…' : 'Guardar simulación';
    reloadButton.disabled = state.saving;
    saveStatus.textContent = state.saving ? 'Guardando tu simulación…' : state.conflict ? 'Recarga los datos para resolver el cambio.'
      : state.dirty ? 'Cambios sin guardar' : state.revision ? 'Simulación guardada' : 'Aún no has guardado una simulación';
  }
  function renderResult(result) {
    const title = el('h3', 'Tu plan para llegar a la meta');
    const score = el('p', '', 'grade-answer'), explanation = el('p');
    score.setAttribute('role', 'status'); score.setAttribute('aria-atomic', 'true');
    if (result.status.startsWith('complete')) {
      title.textContent = 'Tu nota final estimada'; score.textContent = `${points(result.earned)} / 100`;
      explanation.textContent = result.status === 'complete-met' ? 'Con estas notas alcanzas tu meta.' : `Con estas notas no alcanzas la meta de ${n(result.target)}. Revisa con tu docente las opciones de mejora.`;
    } else if (result.status === 'covered') {
      score.textContent = 'Meta cubierta'; explanation.textContent = `Ya acumulas ${points(result.earned)} puntos. Aun con 0 en lo pendiente, esta simulación alcanza tu meta. Completa tus actividades.`;
    } else if (result.status === 'unreachable') {
      score.textContent = 'La meta supera el máximo'; explanation.textContent = `Necesitarías ${n(result.required)} sobre 100 en todo lo pendiente. Incluso obteniendo 100, llegarías a ${points(result.maximum)}. Prueba otra meta o consulta las opciones de mejora.`;
    } else {
      score.textContent = `${n(result.required)} / 100`;
      explanation.textContent = `Necesitas al menos esta nota en cada una de las ${result.pending.length} actividades pendientes para alcanzar ${n(result.target)}. Si combinas notas distintas, su promedio ponderado debe ser al menos ${n(result.required)}.`;
    }
    const stats = el('dl', '', 'grade-stats');
    for (const [label, value] of [['Puntos acumulados', `${points(result.earned)} / 100`], ['Peso registrado', `${n(result.completedWeight)} %`], ['Peso pendiente', `${n(result.remainingWeight)} %`], ['Máximo posible', `${points(result.maximum)} / 100`]]) {
      const item = el('div'); item.append(el('dt', label), el('dd', value)); stats.append(item);
    }
    results.dataset.state = result.status;
    quickResult.replaceChildren(el('strong', result.status === 'pending' ? `Mínimo en lo pendiente: ${n(result.required)} / 100.`
      : result.status.startsWith('complete') ? `Nota final estimada: ${points(result.earned)} / 100.` : score.textContent + '.'));
    const detailLink = el('a', 'Ver detalle ↓'); detailLink.href = '#grade-results'; quickResult.append(detailLink);
    results.append(title, score, explanation, stats);
    if (result.pending.length > 1) {
      const details = el('details', '', 'grade-minimums'); details.append(el('summary', 'Ver mínimos por actividad'),
        el('p', 'Cada mínimo supone 100 en todas las demás actividades pendientes. Son escenarios independientes: no combines estos mínimos como un plan.'));
      const list = el('dl');
      for (const activity of result.pending) {
        const row = el('div'); row.append(el('dt', activity.name), el('dd', activity.minimum > 100 ? 'Supera 100' : `${n(activity.minimum)} / 100`)); list.append(row);
      }
      details.append(list); results.append(details);
    }
    results.append(el('p', 'Los mínimos se redondean hacia arriba a dos decimales. Tu docente aplica los criterios y el redondeo de la nota oficial.', 'grade-muted'));
  }
  win.addEventListener('beforeunload', event => {
    if (session.snapshot().dirty) { event.preventDefault(); event.returnValue = ''; }
  });
  return {
    setContext: ({ courseId }) => session.setContext(courseId),
    open: () => { if (session.snapshot().phase === 'idle') { host.replaceChildren(el('p', 'Cargando calculadora…')); void session.load(); } },
    reset: () => { session.reset(); saveButton = null; },
    hasUnsaved: () => session.snapshot().dirty
  };
}
