import { createStudentGradeCalculator } from './grade-calculator.js?v=0.30.1';
import { DEFAULT_GRADE_ACTIVITIES, normalizeGradeDraft, parseGrade, validateGradeActivities } from './grade-calculator-model.js?v=0.30.1';

// The only remote operation is the owner's existing, read-only scheme lookup.
// Student drafts and saves stay in this instance's memory, never in the database.
export function createTeacherGradePreviewData({ rpc, signedIn, onSource = () => {} }) {
  let courseId = '', epoch = 0, scheme = null, draft = null;
  function reset() { epoch++; scheme = draft = null; }
  function check(id, token = epoch) {
    if (!courseId || id !== courseId || token !== epoch || !signedIn())
      throw new Error('Vuelve a abrir la calculadora desde tu sala docente.');
  }
  function conflict() {
    return Object.assign(new Error('La prueba cambió. Recarga los datos antes de guardar.'), { code: 'PT409' });
  }
  return {
    setContext(id) { if (id !== courseId) { reset(); courseId = id; } },
    reset,
    async request(name, args) {
      const id = args?.p_course_id, token = epoch;
      check(id, token);
      if (name === 'student_grade_calculator') {
        const published = await rpc('teacher_grade_scheme', { p_course_id: id });
        check(id, token);
        const next = published ?? { activities: DEFAULT_GRADE_ACTIVITIES, referenceGrade: 71, revision: 1 };
        scheme = { ...next, activities: validateGradeActivities(next.activities) };
        onSource(published !== null && published !== undefined);
        return structuredClone({ scheme, draft });
      }
      if (name === 'student_save_grade_simulation') {
        if (!scheme || args.p_scheme_revision !== scheme.revision || args.p_draft_revision !== (draft?.revision ?? 0)) throw conflict();
        draft = { grades: normalizeGradeDraft(scheme.activities, args.p_grades),
          goal: parseGrade(args.p_goal, { label: 'La meta' }), schemeRevision: scheme.revision, revision: (draft?.revision ?? 0) + 1 };
        return { revision: draft.revision };
      }
      throw new Error('Esta operación no forma parte de la calculadora de prueba.');
    }
  };
}

export function createTeacherGradePreview({ host, rpc, signedIn, avatar, root = document, win = window }) {
  const note = root.createElement('p'); note.className = 'grade-preview-notice'; note.setAttribute('role', 'status');
  const panel = root.createElement('div');
  host.replaceChildren(note, panel);
  const initialNotice = 'Vista de prueba docente. Las notas se conservan solo mientras mantengas abierta esta sala o hasta reiniciar la demostración.';
  note.textContent = initialNotice;
  let courseId = '';
  const data = createTeacherGradePreviewData({ rpc, signedIn, onSource: published => {
    note.textContent = published
      ? 'Vista de prueba · Porcentajes publicados de esta materia. Tus notas de ejemplo se borran al salir o reiniciar la demostración.'
      : 'Vista de prueba · Esta materia aún no tiene porcentajes publicados. Usas una plantilla de ejemplo; probarla no activa la calculadora de los estudiantes.';
  } });
  const calculator = createStudentGradeCalculator({ host: panel, rpc: data.request, signedIn, avatar, root, win, demo: true });
  return {
    setContext(id) {
      if (id === courseId) return;
      courseId = id; data.setContext(id); calculator.setContext({ courseId: id }); note.textContent = initialNotice;
    },
    open: () => calculator.open(),
    reset() {
      data.reset(); calculator.reset(); calculator.setContext({ courseId }); note.textContent = initialNotice;
    }
  };
}
