import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeacherGradePreviewData } from '../assets/teacher-grade-preview.js';
import { DEFAULT_GRADE_ACTIVITIES } from '../assets/grade-calculator-model.js';

const scheme = { activities: [{ id: 'unit', name: 'Proyecto', weight: 95 }, { id: 'forum', name: 'Foro', weight: 5 }], referenceGrade: 71, revision: 3 };
const load = data => data.request('student_grade_calculator', { p_course_id: 'c1' });
const save = (data, changes = {}) => data.request('student_save_grade_simulation', {
  p_course_id: 'c1', p_scheme_revision: 3, p_draft_revision: 0, p_grades: { unit: 0, forum: '80,25' }, p_goal: 71, ...changes
});

test('zombie preview reads only the owned scheme and keeps saved zero and decimal grades in memory', async () => {
  const calls = [], source = structuredClone(scheme), notices = [];
  const data = createTeacherGradePreviewData({ signedIn: () => true, rpc: async (name, args) => {
    calls.push({ name, args }); return source;
  }, onSource: value => notices.push(value) });
  data.setContext('c1'); assert.equal(calls.length, 0);
  const first = await load(data); assert.deepEqual(first, { scheme, draft: null });
  first.scheme.activities[0].name = 'Local change'; assert.equal(source.activities[0].name, 'Proyecto');
  assert.deepEqual(await save(data), { revision: 1 });
  assert.equal(calls.length, 1);
  const saved = await load(data);
  assert.deepEqual(saved.draft, { grades: { unit: 0, forum: 80.25 }, goal: 71, schemeRevision: 3, revision: 1 });
  saved.draft.grades.unit = 100; assert.equal((await load(data)).draft.grades.unit, 0);
  assert.ok(calls.every(call => call.name === 'teacher_grade_scheme'));
  assert.ok(calls.every(call => call.args.p_course_id === 'c1')); assert.ok(notices.every(Boolean));
});

test('an unpublished course gets an explicit sample without activating a real calculator', async () => {
  const calls = [], notices = [], baseline = structuredClone(DEFAULT_GRADE_ACTIVITIES);
  const data = createTeacherGradePreviewData({ signedIn: () => true, rpc: async name => { calls.push(name); return null; }, onSource: value => notices.push(value) });
  data.setContext('c1'); const first = await load(data);
  assert.deepEqual(first.scheme.activities, baseline); assert.equal(first.draft, null); assert.deepEqual(notices, [false]);
  await save(data, { p_scheme_revision: 1, p_grades: { u1: 50 } });
  first.scheme.activities[0].weight = 99;
  const next = await load(data); assert.deepEqual(next.draft.grades, { u1: 50 }); assert.deepEqual(DEFAULT_GRADE_ACTIVITIES, baseline);
  assert.ok(calls.every(name => name === 'teacher_grade_scheme'));
});

test('restart, another room and a new instance never reuse a previous demonstration draft', async () => {
  const options = { signedIn: () => true, rpc: async () => structuredClone(scheme) };
  const data = createTeacherGradePreviewData(options); data.setContext('c1'); await load(data); await save(data);
  data.setContext('c1'); assert.ok((await load(data)).draft);
  data.reset(); assert.equal((await load(data)).draft, null);
  await save(data); data.setContext('c2');
  assert.equal((await data.request('student_grade_calculator', { p_course_id: 'c2' })).draft, null);
  data.setContext('c1'); assert.equal((await load(data)).draft, null);
  const other = createTeacherGradePreviewData(options); other.setContext('c1'); assert.equal((await load(other)).draft, null);
});

test('errors never masquerade as an unpublished course and late reads cannot leak across rooms or reset', async () => {
  let resolve, error = true; const notices = [];
  const data = createTeacherGradePreviewData({ signedIn: () => true, onSource: value => notices.push(value), rpc: () => {
    if (error) throw new Error('Acceso denegado'); return new Promise(done => { resolve = done; });
  } });
  data.setContext('c1'); await assert.rejects(load(data), /Acceso denegado/); assert.deepEqual(notices, []);
  error = false; const pending = load(data); data.setContext('c2'); resolve(scheme);
  await assert.rejects(pending, /Vuelve a abrir/); assert.deepEqual(notices, []);
  data.setContext('c1'); const pendingReset = load(data); data.reset(); resolve(scheme);
  await assert.rejects(pendingReset, /Vuelve a abrir/); assert.deepEqual(notices, []);
});

test('invalid, stale, unsigned and unsupported operations cannot write or replace the local draft', async () => {
  let signedIn = true; const calls = [];
  const data = createTeacherGradePreviewData({ signedIn: () => signedIn, rpc: async name => { calls.push(name); return scheme; } });
  data.setContext('c1'); await assert.rejects(save(data), { code: 'PT409' }); await load(data); await save(data);
  await assert.rejects(save(data), { code: 'PT409' });
  await assert.rejects(save(data, { p_draft_revision: 1, p_scheme_revision: 2 }), { code: 'PT409' });
  await assert.rejects(save(data, { p_draft_revision: 1, p_grades: { unit: 101 } }), /entre 0 y 100/);
  await assert.rejects(data.request('teacher_save_grade_scheme', { p_course_id: 'c1' }), /no forma parte/);
  await assert.rejects(data.request('student_grade_calculator', { p_course_id: 'c2' }), /Vuelve a abrir/);
  signedIn = false; await assert.rejects(load(data), /Vuelve a abrir/); signedIn = true;
  assert.deepEqual((await load(data)).draft.grades, { unit: 0, forum: 80.25 });
  assert.ok(calls.every(name => name === 'teacher_grade_scheme'));
});
