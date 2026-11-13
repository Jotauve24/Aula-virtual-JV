import { calculateGrades } from './grade-calculator-model.js?v=0.29.0';
import { createGradeSession } from './grade-calculator-session.js?v=0.29.0';

const format = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 2 });
const n = value => format.format(value);
const pointFormat = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 6 });
const points = value => pointFormat.format(value);
export function createStudentGradeCalculator({ host, rpc, signedIn, root = document, win = window }) {
  let fields = new Map(), goalInput, results, quickResult, errorBox, saveButton, saveStatus, reloadButton, noticeBox;
  let activityRows = new Map(), activityCount, progress;
  let pendingListExpanded = null;
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
    if (kind === 'reset') { host.replaceChildren(); host.removeAttribute('aria-busy'); fields.clear(); activityRows.clear(); progress = null; saveButton = null; pendingListExpanded = null; return; }
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
    fields = new Map(); activityRows = new Map(); progress = null;
    goalInput = results = errorBox = saveButton = saveStatus = reloadButton = noticeBox = null;
    const heading = el('div', '', 'grade-heading');
    const headingTitle = el('h2'); headingTitle.append(el('span', 'Calculadora de nota '), el('em', 'final', 'grade-title-accent'));
    heading.append(headingTitle, el('p', 'Prueba tus notas y descubre qué necesitas para llegar a tu meta.'));
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
    for (const text of ['Actividad', 'Porcentaje', 'Tu nota']) {
      const th = el('th', text); th.scope = 'col';
      if (text === 'Porcentaje') {
        const short = el('span', '%', 'grade-percentage-short'); short.setAttribute('aria-hidden', 'true');
        th.setAttribute('aria-label', 'Porcentaje'); th.replaceChildren(el('span', text, 'grade-percentage-label'), short);
      }
      headRow.append(th);
    }
    head.append(headRow); const body = el('tbody');
    for (const activity of state.scheme.activities) {
      const row = el('tr'), name = el('th'); name.scope = 'row';
      const activityLabel = el('span', '', 'grade-activity-label'), dot = el('span', '', 'grade-row-dot');
      dot.setAttribute('aria-hidden', 'true'); activityLabel.append(dot, el('span', activity.name)); name.append(activityLabel);
      const cell = el('td'), field = input(`grade-${activity.id}`, state.values[activity.id], `Nota de ${activity.name}, de 0 a 100`, 'grade-input-hint');
      field.placeholder = 'Pendiente…'; field.addEventListener('input', () => session.edit({ id: activity.id, value: field.value }));
      const percentage = el('td'); percentage.append(el('span', `${n(activity.weight)} %`, 'grade-percentage-chip'));
      fields.set(activity.id, field); activityRows.set(activity.id, { row, dot }); cell.append(field); row.append(name, percentage, cell); body.append(row);
    }
    quickResult = el('p', '', 'grade-quick-result');
    const entryHeading = el('div', '', 'grade-entry-heading');
    activityCount = el('span', '', 'grade-entry-count'); entryHeading.append(el('h3', 'Tus actividades'), activityCount);
    table.append(caption, head, body); editor.append(target, quickResult, entryHeading, hint, table);
    const insights = el('aside', '', 'grade-insights'); insights.setAttribute('aria-label', 'Tu progreso y las notas que necesitas');
    progress = createProgress();
    results = el('section', '', 'grade-results'); results.id = 'grade-results'; results.setAttribute('aria-label', 'Resultado de la simulación');
    insights.append(progress.host, results); grid.append(editor, insights);
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
  function createProgress() {
    const host = el('section', '', 'grade-progress'); host.id = 'grade-progress'; host.setAttribute('aria-label', 'Avance de tu nota final');
    const top = el('div', '', 'grade-progress-top'), status = el('span', '', 'grade-progress-status');
    top.append(el('h3', 'Tu avance'), status);
    const valueLine = el('p', '', 'grade-progress-value'), value = el('strong', '—'); value.id = 'grade-progress-value';
    valueLine.setAttribute('aria-hidden', 'true'); valueLine.append(value, el('span', ' / 100 puntos'));
    const count = el('p', '', 'grade-progress-count');
    const meter = el('div', '', 'grade-progress-meter'), track = el('div', '', 'grade-progress-track'); track.id = 'grade-progress-track';
    track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', 'Puntos acumulados en la nota final');
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
    const fill = el('span', '', 'grade-progress-fill'); fill.setAttribute('aria-hidden', 'true'); track.append(fill);
    const marker = el('div', '', 'grade-goal-marker'), goal = el('span', '', 'grade-goal-label'); marker.id = 'grade-goal-marker';
    marker.setAttribute('aria-hidden', 'true'); marker.append(goal); meter.append(track, marker);
    const scale = el('div', '', 'grade-progress-scale'); scale.setAttribute('aria-hidden', 'true'); scale.append(el('span', '0'), el('span', '100'));
    host.append(top, valueLine, count, meter, scale);
    return { host, status, value, count, track, fill, marker, goal };
  }
  function updateProgress(result, total) {
    progress.host.dataset.state = result?.status ?? 'invalid';
    progress.track.hidden = progress.marker.hidden = !result;
    if (!result) {
      progress.value.textContent = '—'; progress.status.textContent = 'Revisa los datos';
      progress.count.textContent = 'Corrige las notas para actualizar tu avance.';
      progress.track.removeAttribute('aria-valuenow'); progress.track.removeAttribute('aria-valuetext');
      activityCount.textContent = 'Revisa los datos'; return;
    }
    const recorded = Object.keys(result.grades).length;
    const achieved = result.status === 'covered' || result.status === 'complete-met';
    progress.value.textContent = points(result.earned);
    progress.status.textContent = achieved ? 'Meta alcanzada' : !recorded ? 'Empieza aquí'
      : result.status === 'unreachable' || result.status === 'complete-missed' ? 'Meta por revisar' : 'En camino';
    progress.count.textContent = `${n(recorded)} de ${n(total)} actividades con nota`;
    activityCount.textContent = `${n(recorded)} con nota · ${n(result.pending.length)} ${result.pending.length === 1 ? 'pendiente' : 'pendientes'}`;
    progress.track.setAttribute('aria-valuenow', String(result.earned));
    progress.track.setAttribute('aria-valuetext', `${points(result.earned)} puntos de 100. Tu meta es ${n(result.target)}.`);
    progress.fill.style.transform = `scaleX(${result.earned / 100})`;
    progress.marker.style.left = `${result.target}%`;
    progress.marker.dataset.edge = result.target < 15 ? 'start' : result.target > 85 ? 'end' : 'middle';
    progress.goal.textContent = `Meta ${n(result.target)}`;
  }
  function update(state) {
    let result, validation = '';
    goalInput.disabled = false;
    for (const [id, field] of fields) {
      field.disabled = false;
      const { row, dot } = activityRows.get(id);
      try {
        const single = calculateGrades(state.scheme.activities, { [id]: field.value }, 0);
        const recorded = Object.hasOwn(single.grades, id);
        row.dataset.gradeState = recorded ? 'recorded' : 'pending'; dot.title = recorded ? 'Nota ingresada' : 'Pendiente';
        field.removeAttribute('aria-invalid');
      } catch { row.dataset.gradeState = 'invalid'; dot.title = 'Revisa esta nota'; field.setAttribute('aria-invalid', 'true'); }
    }
    try { result = calculateGrades(state.scheme.activities, state.values, state.goal); goalInput.removeAttribute('aria-invalid'); }
    catch (error) {
      validation = error.message;
      try { calculateGrades(state.scheme.activities, {}, state.goal); goalInput.removeAttribute('aria-invalid'); }
      catch { goalInput.setAttribute('aria-invalid', 'true'); }
    }
    updateProgress(result, state.scheme.activities.length);
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
    const title = el('h3', `Tu meta: ${n(result.target)} de 100`);
    const score = el('p', '', 'grade-answer'), explanation = el('p');
    score.setAttribute('role', 'status'); score.setAttribute('aria-atomic', 'true');
    if (result.status.startsWith('complete')) {
      title.textContent = 'Tu nota final estimada'; score.textContent = `${points(result.earned)} / 100`;
      explanation.textContent = result.status === 'complete-met' ? 'Con estas notas alcanzas tu meta.' : `Con estas notas no alcanzas la meta de ${n(result.target)}. Revisa con tu docente las opciones de mejora.`;
    } else if (result.status === 'covered') {
      score.textContent = 'Ya alcanzas tu meta'; explanation.textContent = `Ya acumulas ${points(result.earned)} puntos de la nota final. Aun con 0 en lo pendiente, esta simulación alcanza tu meta de ${n(result.target)}. Completa tus actividades.`;
    } else if (result.status === 'unreachable') {
      score.textContent = 'La meta supera el máximo'; explanation.textContent = `Incluso con 100 en todas las actividades pendientes, tu nota final llegaría a ${points(result.maximum)} sobre 100. Tu meta es ${n(result.target)}. Revisa las notas introducidas o consulta las opciones de mejora con tu docente.`;
    } else {
      const context = result.pending.length === 1 ? 'sobre 100 en la actividad pendiente.'
        : `sobre 100 en cada una de las ${n(result.pending.length)} actividades pendientes.`;
      score.append(el('span', 'Necesitas al menos ', 'grade-answer-kicker'), el('strong', n(result.required)),
        el('span', ' ' + context, 'grade-answer-label'));
      explanation.textContent = result.completedWeight
        ? `Ya acumulas ${points(result.earned)} puntos de la nota final. Te ${result.missing === 1 ? 'falta 1 punto' : `faltan ${points(result.missing)} puntos`} para alcanzar ${n(result.target)}.`
        : 'Todavía no has introducido notas. Este cálculo te muestra qué necesitarías si obtuvieras la misma nota en todas las actividades.';
    }
    const stats = el('dl', '', 'grade-stats');
    for (const [label, value] of [['Acumulado en la nota final', `${points(result.earned)} / 100`], ['Porcentaje con nota', `${n(result.completedWeight)} %`], ['Porcentaje pendiente', `${n(result.remainingWeight)} %`], ['Máximo posible', `${points(result.maximum)} / 100`]]) {
      const item = el('div'); item.append(el('dt', label), el('dd', value)); stats.append(item);
    }
    results.dataset.state = result.status;
    quickResult.replaceChildren(el('strong', result.status === 'pending' ? `Necesitas ${n(result.required)} sobre 100 en cada actividad pendiente para alcanzar una nota final de ${n(result.target)}.`
      : result.status.startsWith('complete') ? `Nota final estimada: ${points(result.earned)} / 100.` : score.textContent + '.'));
    const detailLink = el('a', 'Ver detalle ↓'); detailLink.href = '#grade-progress'; quickResult.append(detailLink);
    if (result.status === 'pending') results.append(title, explanation, score, stats);
    else results.append(title, score, explanation, stats);
    if (result.status === 'pending') {
      const details = el('details', '', 'grade-minimums'); details.append(el('summary', result.pending.length === 1 ? 'Ver la actividad pendiente' : `Ver las ${n(result.pending.length)} actividades pendientes`),
        el('p', 'Una opción es obtener al menos esta nota en cada actividad de la lista. Si pruebas otra nota en la tabla, recalcularemos lo que necesitas en las demás.'));
      details.open = pendingListExpanded ?? result.pending.length <= 3;
      details.addEventListener('toggle', () => { pendingListExpanded = details.open; });
      const list = el('dl');
      for (const activity of result.pending) {
        const row = el('div'); row.append(el('dt', activity.name), el('dd', `${n(result.required)} / 100`)); list.append(row);
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
