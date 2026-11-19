import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLibrarySession, libraryRole, normalizeLibraryCourses } from '../assets/library-session.js';
const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002';
const teacher = [{ id: a, name: 'Informática II' }, { id: b, name: 'Sistemas II' }];

test('library selects only an available account scope', () => {
  assert.equal(libraryRole('teacher', ['student']), 'student');
  assert.equal(libraryRole('student', ['student', 'teacher']), 'student');
  assert.equal(libraryRole('', ['teacher']), 'teacher');
  assert.equal(libraryRole('teacher', []), '');
});
test('the shared library is the initial view without granting enrollment in another course', async () => {
  const library = createLibrarySession({ shared: true, signedIn: () => true, request: async () => [{ course_id: a, course_name: 'Informática II' }] });
  await library.load('student');
  assert.equal(library.snapshot().selected, 'all');
  assert.equal(library.select(b), false);
  assert.equal(library.select(a), true);
  assert.equal(library.select('all'), true);
});
test('teacher and student catalogs normalize their existing authorized responses without using remembered codes', () => {
  assert.deepEqual(normalizeLibraryCourses(teacher, 'teacher'), teacher);
  assert.deepEqual(normalizeLibraryCourses([{ course_id: a, course_name: ' Informática II ', topic_id: b }], 'student'), [teacher[0]]);
  assert.deepEqual(normalizeLibraryCourses([], 'student'), []);
  for (const bad of [null, {}, [{ id: 'untrusted', name: 'Otra' }], [...teacher, teacher[0]], [{ id: a, name: '' }]])
    assert.throws(() => normalizeLibraryCourses(bad, 'teacher'));
});
test('a subject supplied in the URL never opens unless the account catalog authorizes it', async () => {
  const library = createLibrarySession({ signedIn: () => true, request: async () => [teacher[0]] });
  await library.load('teacher', b);
  assert.equal(library.snapshot().selected, ''); assert.equal(library.snapshot().unavailable, true);
  assert.equal(library.select(b), false); assert.equal(library.select(a), true);
  assert.equal(library.snapshot().selected, a);
});
test('a late teacher catalog cannot replace the active student library', async () => {
  const pending = [];
  const library = createLibrarySession({ signedIn: () => true, request: role => new Promise(resolve => pending.push({ role, resolve })) });
  const first = library.load('teacher'); const next = library.load('student');
  pending[1].resolve([{ course_id: b, course_name: 'Mi materia' }]); await next;
  pending[0].resolve(teacher); await first;
  assert.equal(library.snapshot().role, 'student'); assert.equal(library.snapshot().selected, b);
});
test('signout and page reset discard in-flight catalogs and leave no previous subject selected', async () => {
  let resolve, signed = true;
  const library = createLibrarySession({ signedIn: () => signed, request: () => new Promise(done => { resolve = done; }) });
  const pending = library.load('teacher'); signed = false; resolve(teacher); await pending;
  assert.equal(library.snapshot().phase, 'idle'); assert.equal(library.snapshot().courses.length, 0);
  signed = true; const other = library.load('teacher'); library.reset(); resolve(teacher); await other;
  assert.equal(library.snapshot().selected, '');
});
test('a library load failure is separate from an authorized empty catalog and can be retried', async () => {
  let fail = true;
  const library = createLibrarySession({ signedIn: () => true, request: async () => { if (fail) throw Error('Sin conexión'); return []; } });
  await library.load('teacher'); assert.equal(library.snapshot().phase, 'error'); assert.equal(library.snapshot().error, 'Sin conexión');
  fail = false; await library.load('teacher'); assert.equal(library.snapshot().phase, 'ready'); assert.equal(library.snapshot().courses.length, 0);
});

test('a different account of the same role cannot receive a previous account catalog', async () => {
  let user = a, resolve;
  const library = createLibrarySession({ signedIn: () => true, identity: () => user, request: () => new Promise(done => { resolve = done; }) });
  const pending = library.load('teacher'); user = b; resolve(teacher); await pending;
  assert.equal(library.snapshot().phase, 'idle'); assert.equal(library.snapshot().selected, '');
});
test('library has its own entry point, and classrooms and teacher panel no longer embed its board', () => {
  const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(read('index.html'), /href="\.\/biblioteca\.html"/);
  for (const file of ['live.html', 'docente-sala.html']) {
    assert.doesNotMatch(read(file), /id="(?:tab-tablero|panel-tablero)"/);
    assert.match(read(file), /href="\.\/biblioteca\.html/);
    assert.match(read(file), /id="tab-calculadora"/);
  }
  assert.doesNotMatch(read('docente.html'), /id="teacher-content-board/);
  assert.match(read('biblioteca.html'), /id="library-content"/);
});
