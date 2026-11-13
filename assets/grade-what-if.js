import { projectPendingGrades } from './grade-calculator-model.js?v=0.30.0';

const number = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 6 });
const n = value => number.format(value);
const points = value => precise.format(value);
const noScore = '—';
const difference = (a, b) => (Math.round(a * 1000000) - Math.round(b * 1000000)) / 1000000;

// Moving the controls never edits the grade session or sends a request.
export function createGradeWhatIf({ root = document, onApply }) {
  let state, base, assumed = null, trial;
  function el(tag, text = '', className = '') {
    const node = root.createElement(tag); node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action, className) {
    const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
  }
  const host = el('details', '', 'grade-what-if'); host.id = 'grade-what-if';
  const summary = el('summary'), summaryHint = el('span', 'Ensaya tus pendientes', 'grade-trial-summary');
  summary.append(el('strong', '¿Qué pasa si saco…?'), summaryHint);
  const empty = el('p', 'Ya ingresaste todas las notas. Puedes seguir probando otros resultados al ajustar la tabla.', 'grade-trial-empty'); empty.id = 'grade-trial-empty'; empty.hidden = true;
  const body = el('div', '', 'grade-trial-body'); body.id = 'grade-trial-body';
  const context = el('p', '', 'grade-trial-context'); context.id = 'grade-trial-context';
  const label = el('label', 'Nota en cada actividad pendiente'); label.htmlFor = 'grade-trial-range';
  const controls = el('div', '', 'grade-trial-controls');
  const range = el('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '0.01';
  range.id = range.name = 'grade-trial-range'; range.setAttribute('aria-describedby', context.id);
  const field = el('input'); field.type = 'text'; field.inputMode = 'decimal'; field.maxLength = 6; field.autocomplete = 'off';
  field.id = field.name = 'grade-trial-grade'; field.setAttribute('aria-label', 'Nota del ensayo, de 0 a 100'); field.setAttribute('aria-describedby', context.id);
  controls.append(range, field);
  const scale = el('div', '', 'grade-trial-scale'); scale.setAttribute('aria-hidden', 'true'); scale.append(el('span', '0'), el('span', '100'));
  const score = el('p', '', 'grade-trial-score'); score.setAttribute('role', 'status'); score.setAttribute('aria-atomic', 'true');
  const scoreLabel = el('span', 'Tu nota final sería '), scoreValue = el('strong', noScore); scoreValue.id = 'grade-trial-final';
  score.append(scoreLabel, scoreValue, el('span', ' / 100'));
  const meter = el('div', '', 'grade-trial-meter'); meter.setAttribute('role', 'progressbar');
  meter.id = 'grade-trial-meter'; meter.setAttribute('aria-label', 'Nota final con el ensayo');
  meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100');
  const projectedFill = el('span', '', 'grade-trial-fill'), baseFill = el('span', '', 'grade-trial-base');
  projectedFill.setAttribute('aria-hidden', 'true'); baseFill.setAttribute('aria-hidden', 'true');
  meter.append(projectedFill, baseFill);
  const outcome = el('p', '', 'grade-trial-outcome'); outcome.id = 'grade-trial-outcome';
  const legend = el('p', '', 'grade-trial-legend');
  const error = el('p', '', 'grade-error'); error.hidden = true; error.setAttribute('role', 'alert');
  const minimum = button('Probar el mínimo necesario', () => setAssumed(String(base.required)), 'grade-text-button');
  const apply = button('Usar ensayo en las pendientes', () => {
    if (!apply.disabled && !host.hidden && trial) onApply(trial.assumedGrade);
  }, 'grade-trial-apply');
  apply.id = 'grade-trial-apply';
  const hint = el('p', 'Usar el ensayo llena las casillas pendientes. Después puedes guardar tu simulación.', 'grade-muted');
  hint.id = 'grade-trial-apply-hint'; apply.setAttribute('aria-describedby', hint.id);
  body.append(context, label, controls, scale, score, meter, legend, outcome, error, minimum, apply, hint);
  host.append(summary, empty, body);
  function setAssumed(value) { assumed = value; field.value = value; refresh(); }
  range.addEventListener('input', () => setAssumed(range.value));
  field.addEventListener('input', () => { assumed = field.value; refresh(); });
  function refresh() {
    trial = null;
    const complete = !!base && !base.pending.length;
    empty.hidden = !complete; body.hidden = complete;
    summaryHint.textContent = complete ? 'Todas las notas ingresadas' : 'Ensaya tus pendientes';
    const unavailable = !base || complete || state.saving || state.conflict;
    range.disabled = field.disabled = minimum.disabled = unavailable;
    minimum.hidden = !base || base.required === null || base.required > 100;
    context.textContent = base?.pending.length
      ? `Prueba la misma nota en ${base.pending.length === 1 ? 'la actividad pendiente' : `las ${n(base.pending.length)} actividades pendientes`}.`
      : 'Corrige las notas de la tabla y la meta para ensayar.';
    apply.disabled = true; meter.hidden = true; error.hidden = true;
    if (!base || complete) {
      scoreValue.textContent = noScore; outcome.textContent = ''; legend.textContent = '';
      meter.removeAttribute('aria-valuenow'); meter.removeAttribute('aria-valuetext'); return;
    }
    if (assumed === null) {
      assumed = String(Math.max(0, Math.min(100, base.required ?? base.target)));
      field.value = assumed;
    }
    try {
      trial = projectPendingGrades(state.scheme.activities, state.values, state.goal, assumed);
      field.removeAttribute('aria-invalid'); range.value = String(trial.assumedGrade);
      range.setAttribute('aria-valuetext', `${n(trial.assumedGrade)} sobre 100 en cada actividad pendiente`);
      scoreValue.textContent = points(trial.projected.earned);
      meter.hidden = false; meter.setAttribute('aria-valuenow', String(trial.projected.earned));
      meter.setAttribute('aria-valuetext', `${points(base.earned)} puntos acumulados. Con el ensayo: ${points(trial.projected.earned)} de 100. Meta: ${n(base.target)}.`);
      projectedFill.style.transform = `scaleX(${trial.projected.earned / 100})`;
      baseFill.style.transform = `scaleX(${base.earned / 100})`;
      legend.textContent = `Acumulado: ${points(base.earned)} · Las pendientes sumarían ${points(difference(trial.projected.earned, base.earned))} puntos.`;
      const met = trial.projected.earned >= base.target;
      body.dataset.met = String(met);
      outcome.textContent = met ? `Este ensayo alcanza tu meta de ${n(base.target)}.`
        : `Con este ensayo te faltarían ${points(trial.projected.missing)} puntos para alcanzar ${n(base.target)}.`;
      apply.disabled = unavailable;
    } catch (failure) {
      field.setAttribute('aria-invalid', 'true'); scoreValue.textContent = noScore;
      error.textContent = failure.message; error.hidden = false; outcome.textContent = ''; legend.textContent = '';
      meter.removeAttribute('aria-valuenow'); meter.removeAttribute('aria-valuetext');
    }
  }
  return { host, update(nextState, result) { state = nextState; base = result; refresh(); } };
}
