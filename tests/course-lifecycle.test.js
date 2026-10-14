import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { allCoursesXlsx } from '../assets/teacher-export.js';

const source = readFileSync(new URL('../assets/teacher.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');

class Element {
  constructor() {
    this.children = []; this.listeners = new Map(); this.hidden = false;
    this.dataset = {}; this.value = ''; this.textContent = ''; this.disabled = false;
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { this[name] = value; }
  replaceChildren(...nodes) { this.children = nodes; }
  append(...nodes) { this.children.push(...nodes); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
  dispatch(name) { return this.listeners.get(name)?.({ target: this, preventDefault() {} }); }
  click() { return this.dispatch('click'); }
}

async function boot({ files = [], fileError = null, students = [], topics = [], extraCourses = [],
  disabledCourses = [], overviewById = {}, studentFiles = {} } = {}) {
  const nodes = new Map();
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const calls = [];
  const downloads = [];
  let downloadedBlob;
  let course = { id: 'course-1', name: 'Mantenimiento', active: true,
    accessCode: 'MAT-AAAAA-BBBBB-CCCCC', registrationOpen: true };
  const courseRow = () => ({ ...course, student_count: 0, topic_count: 1 });
  const rpc = async (name, body = {}) => {
    calls.push([name, body]);
    if (name === 'my_courses') return [...(course?.active ? [courseRow()] : []), ...extraCourses];
    if (name === 'teacher_disabled_courses') return [...(course && !course.active ? [courseRow()] : []), ...disabledCourses];
    if (name === 'teacher_overview') return body.p_course_id === course?.id
      ? { course: { ...course }, topics, students: [...students] } : overviewById[body.p_course_id];
    if (name === 'teacher_unassigned_student_file_paths') {
      assert.equal(students.find(student => student.id === body.p_student_id)?.topicId, null);
      return studentFiles[body.p_student_id] || [];
    }
    if (name === 'teacher_delete_unassigned_student') {
      const index = students.findIndex(student => student.id === body.p_student_id && student.topicId === null);
      assert.notEqual(index, -1); students.splice(index, 1); return;
    }
    if (name === 'teacher_set_course_active') { course.active = body.p_active; return; }
    if (name === 'teacher_course_file_paths') return files;
    if (name === 'teacher_delete_course') { assert.equal(course.active, false); course = null; return; }
    throw new Error('RPC inesperado: ' + name);
  };
  vm.runInNewContext(source, {
    document: { querySelector: get, body: { append() {} }, createElement: tag => {
      const element = new Element();
      if (tag === 'a') element.click = () => downloads.push({ name: element.download, blob: downloadedBlob });
      return element;
    } },
    configured: true, signedIn: () => true, rpc, googleAvailable: async () => false,
    sendCode() {}, signInWithGoogle() {}, signOut() {}, confirm: () => true,
    Blob, URL: { createObjectURL(blob) { downloadedBlob = blob; return 'blob:roster'; }, revokeObjectURL() {} },
    allCoursesXlsx, TextEncoder,
    setTimeout() {},
    deleteTeacherCourseFiles: async (id, paths) => {
      calls.push(['remove_storage_files', { id, paths }]);
      if (fileError) throw new Error(fileError);
    }
  }, { filename: 'assets/teacher.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { get, calls, downloads, current: () => course };
}

test('docente descarga todas las materias, incluso las deshabilitadas, sin equipo e inscritos recientemente', async () => {
  const students = [
    { id: '1', firstName: 'Ana', lastName: 'Pérez', email: 'ana@ejemplo.com', phone: '555-1', topicId: 'g1' },
    { id: '2', firstName: 'Luis', lastName: 'Díaz', email: 'luis@ejemplo.com', phone: '555-2', topicId: null }
  ];
  const page = await boot({ students, topics: [{ id: 'g1', name: 'Equipo Sol', position: 0, capacity: 5 }],
    extraCourses: [{ id: 'course-2', name: 'Informática' }],
    disabledCourses: [{ id: 'course-3', name: 'Sistemas II' }],
    overviewById: {
      'course-2': { course: { name: 'Informática' }, topics: [], students: [
        { firstName: 'Olga', lastName: 'Ruiz', email: 'olga@ejemplo.com', phone: '555-4', topicId: null }] },
      'course-3': { course: { name: 'Sistemas II' }, topics: [], students: [
        { firstName: 'Juan', lastName: 'Mora', email: 'juan@ejemplo.com', phone: '555-5', topicId: null }] }
    } });
  students.push({ id: '3', firstName: 'Eva', lastName: 'León', email: 'eva@ejemplo.com', phone: '555-3', topicId: null });
  await page.get('#export-all').click();
  assert.deepEqual(page.calls.filter(([name]) => name === 'teacher_overview').map(([, body]) => body.p_course_id),
    ['course-1', 'course-2', 'course-3']);
  assert.equal(page.downloads.length, 1);
  assert.equal(page.downloads[0].name, 'Estudiantes_todas_las_materias.xlsx');
  const bytes = new Uint8Array(await page.downloads[0].blob.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.match(page.get('#teacher-success').textContent, /5 estudiantes de 3 materias/);
  const html = readFileSync(new URL('../docente.html', import.meta.url), 'utf8');
  assert.match(html, /<div id="courses" class="course-list"><\/div><section class="roster-export-panel"[\s\S]*id="export-all"[\s\S]*<section id="disabled-area"/);
  assert.doesNotMatch(html, /id="export-roster"/);
});

test('el docente confirma la eliminación de un estudiante sin equipo, retira sus archivos y actualiza el listado', async () => {
  const students = [
    { id: '1', firstName: 'Ana', lastName: 'Pérez', email: 'ana@ejemplo.com', phone: '555-1', topicId: 'g1' },
    { id: '2', firstName: 'Juan', lastName: 'Mora', email: 'juan@ejemplo.com', phone: '555-2', topicId: null }
  ];
  const page = await boot({ students, topics: [{ id: 'g1', name: 'Grupo 1', position: 0, capacity: 5 }],
    studentFiles: { '2': ['course-1/g1/auth-2/file.pdf'] } });
  await page.get('#courses').children[0].click();
  const [assigned, unassigned] = page.get('#student-list').children;
  assert.equal(assigned.children[1].children[2].textContent, 'Liberar del grupo');
  await unassigned.children[1].children[2].click();
  assert.equal(page.get('#delete-student-dialog').open, true);
  assert.match(page.get('#delete-student-details').textContent, /juan@ejemplo.com.*555-2/);
  assert.equal(students.length, 2);
  await page.get('#confirm-delete-student').click();
  assert.deepEqual(page.calls.filter(([name]) =>
    ['teacher_unassigned_student_file_paths', 'remove_storage_files', 'teacher_delete_unassigned_student'].includes(name))
    .map(([name]) => name),
  ['teacher_unassigned_student_file_paths', 'remove_storage_files', 'teacher_delete_unassigned_student']);
  assert.equal(students.length, 1);
  assert.equal(page.get('#delete-student-dialog').open, false);
  assert.equal(page.get('#student-list').children[1].children[1].textContent, 'Todos eligieron un equipo.');
  assert.match(page.get('#teacher-success').textContent, /Estudiante eliminado/);
});

test('un error al retirar archivos impide borrar al estudiante sin equipo', async () => {
  const students = [{ id: '2', firstName: 'Juan', lastName: 'Mora', email: 'juan@ejemplo.com',
    phone: '555-2', topicId: null }];
  const page = await boot({ students, studentFiles: { '2': ['course-1/group/auth/file.pdf'] },
    fileError: 'Storage no disponible' });
  await page.get('#courses').children[0].click();
  await page.get('#student-list').children[0].children[1].children[2].click();
  await page.get('#confirm-delete-student').click();
  assert.equal(students.length, 1);
  assert.equal(page.calls.some(([name]) => name === 'teacher_delete_unassigned_student'), false);
  assert.equal(page.get('#delete-student-dialog').open, true);
  assert.match(page.get('#delete-student-error').textContent, /Storage no disponible/);
});

test('eliminating requires the exact name, blocks entry, removes files, then deletes data', async () => {
  const page = await boot({ files: ['course-1/topic/student/file.pdf'] });
  await page.get('#courses').children[0].click();
  page.get('#delete-course').click();
  assert.equal(page.get('#delete-course-dialog').open, true);
  assert.equal(page.get('#confirm-course-delete').disabled, true);
  page.get('#delete-course-confirmation').value = 'Otra materia';
  await page.get('#delete-course-form').dispatch('submit');
  assert.equal(page.calls.some(([name]) => name === 'teacher_delete_course'), false);
  page.get('#delete-course-confirmation').value = 'Mantenimiento';
  page.get('#delete-course-confirmation').dispatch('input');
  await page.get('#delete-course-form').dispatch('submit');
  const lifecycle = page.calls.filter(([name]) =>
    ['teacher_set_course_active', 'teacher_course_file_paths', 'remove_storage_files', 'teacher_delete_course'].includes(name));
  assert.deepEqual(lifecycle.map(([name]) => name),
    ['teacher_set_course_active', 'teacher_course_file_paths', 'remove_storage_files', 'teacher_delete_course']);
  assert.equal(page.current(), null);
  assert.equal(page.get('#delete-course-dialog').open, false);
});

test('a disabled course leaves the active list and can be restored', async () => {
  const page = await boot();
  await page.get('#courses').children[0].click();
  await page.get('#toggle-course').click();
  assert.equal(page.current().active, false);
  assert.equal(page.get('#disabled-area').hidden, false);
  assert.equal(page.get('#courses').children[0].textContent.includes('Todavía'), true);
  const disabledCard = page.get('#disabled-courses').children[0];
  await disabledCard.children[1].children[0].click();
  assert.equal(page.current().active, true);
  assert.equal(page.get('#disabled-area').hidden, true);
});

test('a file removal error leaves the course disabled and prevents record deletion', async () => {
  const page = await boot({ files: ['course-1/topic/student/file.pdf'], fileError: 'Storage no disponible' });
  await page.get('#courses').children[0].click();
  page.get('#delete-course').click();
  page.get('#delete-course-confirmation').value = 'Mantenimiento';
  await page.get('#delete-course-form').dispatch('submit');
  assert.equal(page.current().active, false);
  assert.equal(page.calls.some(([name]) => name === 'teacher_delete_course'), false);
  assert.match(page.get('#delete-course-error').textContent, /Storage no disponible/);
});
