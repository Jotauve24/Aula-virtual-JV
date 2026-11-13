import { normalizeGradeDraft, parseGrade, projectPendingGrades, validateGradeActivities } from './grade-calculator-model.js?v=0.30.1';

// A simulation belongs to a verified student/course, never to localStorage.
export function createGradeSession({ rpc, signedIn, onChange = () => {} }) {
  let epoch = 0, state = fresh();
  function fresh(courseId = '') {
    return { courseId, phase: 'idle', scheme: null, values: {}, goal: '', revision: 0,
      dirty: false, saving: false, conflict: false, error: '', notice: '' };
  }
  const emit = kind => onChange(kind, state);
  const current = (token, id) => token === epoch && state.courseId === id && signedIn();
  function setContext(courseId) {
    if (state.courseId === courseId) return;
    epoch++; state = fresh(courseId); emit('reset');
  }
  async function load() {
    if (!state.courseId || !signedIn() || state.saving || state.phase === 'loading') return;
    const token = ++epoch, id = state.courseId;
    state.phase = 'loading'; state.error = ''; emit('loading');
    try {
      const data = await rpc('student_grade_calculator', { p_course_id: id });
      if (!current(token, id)) return;
      const scheme = data.scheme;
      if (scheme) scheme.activities = validateGradeActivities(scheme.activities);
      const values = scheme ? normalizeGradeDraft(scheme.activities, data.draft?.grades) : {};
      state = { ...fresh(id), phase: 'ready', scheme, values,
        goal: data.draft?.goal ?? scheme?.referenceGrade ?? '', revision: data.draft?.revision ?? 0,
        notice: data.draft && scheme && data.draft.schemeRevision !== scheme.revision
          ? 'El docente actualizó los porcentajes. Conservamos las notas de las actividades que siguen vigentes; revisa el nuevo cálculo.' : '' };
      emit('loaded');
    } catch (error) {
      if (!current(token, id)) return;
      state.phase = state.scheme ? 'ready' : 'error'; state.error = error.message || 'No se pudo cargar la calculadora. Reintenta.'; emit('error');
    }
  }
  function edit({ id, value, goal }) {
    if (!state.scheme || state.phase !== 'ready') return;
    if (goal !== undefined) state.goal = goal;
    if (id && state.scheme.activities.some(row => row.id === id)) state.values[id] = value;
    state.dirty = true; state.error = ''; emit('edit');
  }
  function fillPending(assumed) {
    if (!signedIn() || state.phase !== 'ready' || !state.scheme || state.saving || state.conflict) return false;
    let trial;
    try { trial = projectPendingGrades(state.scheme.activities, state.values, state.goal, assumed); }
    catch (error) { state.error = error.message; emit('error'); return false; }
    if (!trial.base.pending.length) return false;
    const values = { ...state.values };
    for (const activity of trial.base.pending) values[activity.id] = trial.assumedGrade;
    state.values = values; state.dirty = true; state.error = ''; emit('edit');
    return true;
  }
  async function save() {
    if (state.saving || state.conflict || !state.scheme || !state.dirty || !signedIn()) return;
    let grades, goal;
    try {
      grades = normalizeGradeDraft(state.scheme.activities, state.values);
      goal = parseGrade(state.goal, { label: 'La meta' });
    } catch (error) { state.error = error.message; emit('error'); return; }
    const token = epoch, id = state.courseId;
    const sentValues = JSON.stringify(state.values), sentGoal = String(state.goal);
    state.saving = true; state.error = ''; emit('saving');
    try {
      const saved = await rpc('student_save_grade_simulation', { p_course_id: id,
        p_scheme_revision: state.scheme.revision, p_draft_revision: state.revision, p_grades: grades, p_goal: goal });
      if (!current(token, id)) return;
      state.revision = saved.revision;
      state.dirty = JSON.stringify(state.values) !== sentValues || String(state.goal) !== sentGoal;
      state.notice = '';
    } catch (error) {
      if (!current(token, id)) return;
      state.conflict = error.code === 'PT409';
      state.error = error.message || 'No se pudo guardar. Tus cambios siguen aquí; reintenta.';
    } finally {
      if (current(token, id)) { state.saving = false; emit('saved'); }
    }
  }
  return { setContext, load, save, edit, fillPending, snapshot: () => state, reset: () => { epoch++; state = fresh(); emit('reset'); } };
}
