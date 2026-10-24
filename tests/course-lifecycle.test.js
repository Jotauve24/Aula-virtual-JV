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
  click() { return this.listeners.has('click') ? this.dispatch('click') : this.children[0]?.click(); }
}

async function boot({ files = [], fileError = null, students = [], topics = [], extraCourses = [],
  disabledCourses = [], overviewById = {}, studentFiles = {}, recoveryRequests = [], delays = {}, renameError = null } = {}) {
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
    if(delays[name]) await delays[name](body);
    if (name === 'my_courses') return [...(course?.active ? [courseRow()] : []), ...extraCourses];
    if (name === 'teacher_disabled_courses') return [...(course && !course.active ? [courseRow()] : []), ...disabledCourses];
    if (name === 'teacher_student_recovery_requests') return recoveryRequests;
    if (name === 'teacher_decide_student_recovery') {
      const index = recoveryRequests.findIndex(request => request.id === body.p_request_id);
      assert.notEqual(index, -1);
      recoveryRequests.splice(index, 1);
      return;
    }
    if (name === 'teacher_overview') return body.p_course_id === course?.id
      ? { course: { ...course }, topics, students: [...students] } : overviewById[body.p_course_id];
    if (name === 'teacher_rename_course') {
      assert.equal(body.p_course_id, course.id);
      const failure = typeof renameError === 'function' ? renameError() : renameError;
      if (failure) throw new Error(failure);
      course.name = body.p_name;
      return { id: course.id, name: course.name };
    }
    if (name === 'teacher_release_student') {students.find(s=>s.id===body.p_student_id).topicId=null;return;}
    if (name === 'teacher_move_student') {
      assert.equal(body.p_course_id, course.id);
      assert.equal(course.active, true);
      const student = students.find(row => row.id === body.p_student_id);
      const target = topics.find(topic => topic.id === body.p_topic_id);
      if (!student || !target) throw new Error('Estudiante o grupo no encontrado');
      if (students.filter(row => row.topicId === target.id).length >= target.capacity)
        throw new Error('El equipo está completo');
      student.topicId = target.id;
      student.sharing = false;
      return;
    }
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
  const pageActions = vm.runInNewContext(source+'\n({openCourse,loadCourses})', {
    document: { querySelector: get, querySelectorAll: () => [], hidden: false,
      createTextNode: text => { const node = new Element(); node.textContent = text; return node; },
      body: { append() {} }, createElement: tag => {
      const element = new Element();
      if (tag === 'a') element.click = () => downloads.push({ name: element.download, blob: downloadedBlob });
      return element;
    } },
    configured: true, signedIn: () => true, rpc, googleAvailable: async () => false,
    sendCode() {}, signInWithGoogle() {}, signOut() {}, confirm: () => true,
    Blob, URL: { createObjectURL(blob) { downloadedBlob = blob; return 'blob:roster'; }, revokeObjectURL() {} },
    allCoursesXlsx, TextEncoder,
    setTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    deleteTeacherCourseFiles: async (id, paths) => {
      calls.push(['remove_storage_files', { id, paths }]);
      if (fileError) throw new Error(fileError);
    }
  }, { filename: 'assets/teacher.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { get, calls, downloads, current: () => course, openCourse: pageActions.openCourse, loadCourses: pageActions.loadCourses };
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
  assert.match(html, /<div id="courses" class="course-list"><\/div>[\s\S]*<section class="roster-export-panel"[\s\S]*id="export-all"[\s\S]*<section id="disabled-area"/);
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

test('an old course response cannot replace the most recently selected subject',async()=>{
  let release;
  const slow=new Promise(resolve=>{release=resolve;});
  const page=await boot({extraCourses:[{id:'course-2',name:'Sistemas II',student_count:1,topic_count:0}],
    overviewById:{'course-2':slow}});
  const older=page.openCourse('course-2');
  await page.openCourse('course-1');
  assert.equal(page.get('#course-title').textContent,'Mantenimiento');
  release({course:{id:'course-2',name:'Sistemas II',active:true,registrationOpen:true},
    students:[],topics:[]});
  await older;
  assert.equal(page.get('#course-title').textContent,'Mantenimiento');
  assert.equal(page.get('#detail').hidden,false);
});
test('logging out invalidates in-flight course details',async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const page=await boot({extraCourses:[{id:'course-2',name:'Sistemas II',student_count:1,topic_count:0}],
    overviewById:{'course-2':pending}});
  const request=page.openCourse('course-2');
  page.get('#logout').click();
  release({course:{id:'course-2',name:'Sistemas II',active:true,registrationOpen:true},
    students:[],topics:[]});
  await request;
  assert.equal(page.get('#login').hidden,false);
  assert.equal(page.get('#detail').hidden,true);
});

test('docente no ve solicitudes de recuperación automática como pendientes de aprobación', async () => {
  // Supabase returns [] for verified, unique and inactive accounts that recover
  // themselves; no teacher review controls should appear.
  const page = await boot({recoveryRequests:[]});
  await page.get('#courses').children[0].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.get('#student-recovery-panel').hidden,true);
  assert.equal(page.get('#student-recovery-requests').children.length,0);
  const html=readFileSync(new URL('../docente.html',import.meta.url),'utf8');
  assert.match(html,/Recuperaciones que necesitan ayuda/);
  assert.match(html,/sin tu aprobación/);
});

test('el módulo de recuperación nunca aparece vacío mientras se carga en ninguna materia',async()=>{
  let resolvePending;
  const pending=new Promise(resolve=>{resolvePending=resolve;});
  const page=await boot({recoveryRequests:pending,
    extraCourses:[{id:'course-2',name:'Sistemas I B',student_count:0,topic_count:0}],
    overviewById:{'course-2':{course:{id:'course-2',name:'Sistemas I B',active:true,
      registrationOpen:true,accessCode:'MAT-AAAAA-BBBBB-CCCCC'},topics:[],students:[]}}});
  await page.get('#courses').children[0].click();
  assert.equal(page.get('#student-recovery-panel').hidden,true,
    'no debe mostrarse la caja de recuperación mientras espera a Supabase');
  await page.openCourse('course-2');
  assert.equal(page.get('#student-recovery-panel').hidden,true,
    'otro curso también inicia con la sección oculta');
  resolvePending([]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.get('#student-recovery-panel').hidden,true,
    'una solicitud sin coincidencia no activa la sección en otro curso');
  assert.equal(page.get('#student-recovery-requests').children.length,0);
});

test('la sección de recuperación sigue disponible para solicitudes realmente manuales',async()=>{
  const page=await boot({
    recoveryRequests:[{id:'pending-1',email:'contacto@ejemplo.com',
      requested_at:'2026-10-15T14:00:00Z',status:'pending'}],
    students:[{id:'student-1',firstName:'Ana',lastName:'Pérez',
      email:'contacto@ejemplo.com',phone:'555',topicId:null}]
  });
  await page.get('#courses').children[0].click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.get('#student-recovery-panel').hidden,false);
  assert.equal(page.get('#student-recovery-count').textContent,'1 pendiente');
  assert.equal(page.get('#student-recovery-requests').children.length,1);
});

test('docente rechaza una recuperación manual y actualiza las solicitudes sin alterar el perfil', async () => {
  const students = [{id:'student-1',firstName:'Ana',lastName:'Pérez',
    email:'contacto@ejemplo.com',phone:'555',topicId:null}];
  const page = await boot({ students, recoveryRequests:[{id:'pending-1',
    email:'contacto@ejemplo.com',requested_at:'2026-10-15T14:00:00Z',status:'pending'}] });
  await page.get('#courses').children[0].click();
  await new Promise(resolve => setImmediate(resolve));
  const request = page.get('#student-recovery-requests').children[0];
  await request.children[7].children[1].click();
  assert.equal(request.children[8].hidden, true);
  assert.equal(page.get('#student-recovery-panel').hidden, true);
  assert.equal(page.get('#student-recovery-requests').children.length, 0);
  assert.match(page.get('#teacher-success').textContent, /Solicitud rechazada/);
  assert.equal(students.length, 1);
  assert.equal(students[0].id, 'student-1');
  const decision = page.calls.find(([name]) => name === 'teacher_decide_student_recovery')[1];
  assert.equal(decision.p_approve, false);
  assert.equal(decision.p_student_id, null);
});

test('docente asigna a estudiante sin grupo conservando su perfil', async () => {
  const students=[
    { id:'a',firstName:'Rosa',lastName:'Morales',email:'rosa@ejemplo.com',phone:'555-5555',topicId:null,
      avatar:{hair:'short'},sharing:true },
    { id:'b',firstName:'Luis',lastName:'Pérez',email:'luis@ejemplo.com',phone:'555-1111',topicId:'g1' }
  ];
  const topics=[
    {id:'g1',name:'Mesa 1',position:0,capacity:2},
    {id:'g2',name:'Mesa 2',position:1,capacity:3}
  ];
  const page=await boot({students,topics});
  await page.get('#courses').children[0].click();
  const unassigned=page.get('#student-list').children[2];
  const row=unassigned.children[1];
  assert.equal(row.children[3].textContent,'Asignar a grupo');
  await row.children[3].click();
  assert.equal(page.get('#move-student-dialog').open,true);
  assert.match(page.get('#move-student-current').textContent,/Sin equipo/);
  assert.equal(page.get('#move-student-destination').value,'g1');
  page.get('#move-student-destination').value='g2';
  await page.get('#move-student-form').dispatch('submit');
  assert.deepEqual(page.calls.filter(([name]) => name==='teacher_move_student')
    .map(([,body])=>JSON.parse(JSON.stringify(body))),
    [{p_course_id:'course-1',p_student_id:'a',p_topic_id:'g2'}]);
  assert.equal(students[0].topicId,'g2');
  assert.deepEqual(students[0].avatar,{hair:'short'});
  assert.equal(students[0].email,'rosa@ejemplo.com');
  assert.equal(students[0].sharing,false);
  assert.equal(page.get('#move-student-dialog').open,false);
  assert.match(page.get('#teacher-success').textContent,/perfil y avatar/);
});
test('docente traslada estudiantes con grupo, sin borrar registros ni conversaciones', async()=>{
  const students=[
    {id:'a',firstName:'María',lastName:'Cruz',email:'maria@ejemplo.com',phone:'555-1',topicId:'g1',sharing:true},
    {id:'b',firstName:'Ana',lastName:'Ríos',email:'ana@ejemplo.com',phone:'555-2',topicId:'g2'}
  ];
  const topics=[{id:'g1',name:'Grupo A',position:0,capacity:5},{id:'g2',name:'Grupo B',position:1,capacity:2}];
  const page=await boot({students,topics});
  await page.get('#courses').children[0].click();
  const row=page.get('#student-list').children[0].children[1];
  assert.equal(row.children[2].textContent,'Liberar del grupo');
  assert.equal(row.children[3].textContent,'Cambiar de grupo');
  await row.children[3].click();
  assert.match(page.get('#move-student-current').textContent,/Grupo A/);
  assert.equal(page.get('#move-student-destination').value,'g2');
  await page.get('#move-student-form').dispatch('submit');
  assert.equal(students[0].topicId,'g2');
  assert.equal(students[0].sharing,false);
  assert.equal(students.length,2);
  assert.ok(!page.calls.some(([name]) => name==='teacher_release_student'));
});
test('grupos llenos no se presentan como destinos disponibles',async()=>{
  const students=[
    {id:'a',firstName:'Carlos',lastName:'Pérez',phone:'555-1',topicId:null},
    {id:'b',firstName:'Elena',lastName:'Mora',phone:'555-2',topicId:'g1'}
  ];
  const topics=[{id:'g1',name:'Grupo lleno',position:0,capacity:1}];
  const page=await boot({students,topics});
  await page.get('#courses').children[0].click();
  await page.get('#student-list').children[1].children[1].children[3].click();
  assert.equal(page.get('#move-student-destination').disabled,true);
  assert.equal(page.get('#confirm-student-move').disabled,true);
  assert.match(page.get('#move-student-help').textContent,/No hay otro grupo/);
  await page.get('#cancel-student-move').click();
  assert.equal(page.get('#move-student-dialog').open,false);
  assert.equal(page.calls.some(([name]) => name==='teacher_move_student'),false);
});

test('el docente ve y puede usar tanto Eliminar como Asignar a grupo en Sin equipo', async () => {
  const students = [{ id:'student-a', firstName:'Ana', lastName:'Pérez', topicId:null,
    email:'ana@ejemplo.com', phone:'6000-0011' }];
  const topics = [{id:'group-1',name:'Grupo 1',position:0,capacity:5}];
  const page = await boot({ students, topics });
  await page.get('#courses').children[0].click();
  const unassigned = page.get('#student-list').children[1];
  const actions = unassigned.children[1].children.filter(child => child.listeners.has('click'));
  assert.deepEqual(actions.map(button => button.textContent), ['Eliminar','Asignar a grupo']);
  await actions[0].click();
  assert.equal(page.get('#delete-student-dialog').open,true);
  await page.get('#cancel-delete-student').click();
  assert.equal(page.get('#delete-student-dialog').open,false);
  await actions[1].click();
  assert.equal(page.get('#move-student-dialog').open,true);
  assert.equal(students[0].topicId,null, 'solo abrir opciones no modifica asignación');
});
test('el diseño separa los dos botones en escritorio y móvil', () => {
  const css = readFileSync(new URL('../assets/live.css',import.meta.url),'utf8');
  assert.match(css,/\.teacher-student>button:first-of-type\s*\{grid-column:2;grid-row:1\/3\}/);
  assert.match(css,/\.teacher-student>button:nth-of-type\(2\)\s*\{grid-column:3;grid-row:1\/3\}/);
  assert.match(css,/@media\(max-width:560px\)[\s\S]*?\.teacher-student>button:first-of-type\s*\{grid-column:1;grid-row:3/);
  assert.match(css,/@media\(max-width:560px\)[\s\S]*?\.teacher-student>button:nth-of-type\(2\)\s*\{grid-column:2;grid-row:3/);
});

test('resumen dentro de materia muestra inscritos, grupos y sin equipo reales, no conectados', async () => {
  const topics=Array.from({length:7},(_,i)=>({
    id:'g'+i,name:'Grupo '+(i+1),position:i,capacity:5
  }));
  const students=Array.from({length:23},(_,i)=>({
    id:'s'+i,firstName:'Estudiante',lastName:String(i+1),
    email:'estudiante'+i+'@ejemplo.com',phone:'6000-0000',
    topicId:i<4?null:'g'+((i-4)%7)
  }));
  const page=await boot({students,topics});
  await page.get('#courses').children[0].click();
  assert.equal(page.get('#course-summary').textContent,'23 estudiantes · 7 temas');
  assert.equal(page.get('#detail-student-total').textContent,'23');
  assert.equal(page.get('#detail-group-total').textContent,'7');
  assert.equal(page.get('#detail-unassigned-total').textContent,'4');
  assert.equal(students.length,23,'los contadores no alteran los registros');
});


test('logging out during an export prevents a late private spreadsheet download',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const page=await boot({extraCourses:[{id:'course-2',name:'Otra',student_count:1,topic_count:0}],overviewById:{'course-2':pending},
 students:[{id:'s1',firstName:'Ana',lastName:'Prueba',topicId:null,email:'qa@example.invalid'}]});
 const exporting=page.get('#export-all').click();
 await new Promise(setImmediate);page.get('#logout').click();
 release({course:{id:'course-2',name:'Otra',active:true},students:[],topics:[]});await exporting;
 assert.equal(page.downloads.length,0);
 assert.equal(page.get('#login').hidden,false);
});
test('a delayed group release does not reopen a subject after returning to the dashboard',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const page=await boot({students:[{id:'s1',firstName:'Ana',lastName:'Prueba',topicId:'g1'}],
 topics:[{id:'g1',position:1,name:'Grupo 1',capacity:5}],delays:{teacher_release_student:()=>pending}});
 await page.openCourse('course-1');
 const descendants=n=>[n,...n.children.flatMap(descendants)];
 descendants(page.get('#student-list')).find(n=>n.textContent==='Liberar del grupo').click();
 await new Promise(setImmediate);await page.loadCourses();release();await new Promise(setImmediate);
 assert.equal(page.get('#dashboard').hidden,false);
 assert.equal(page.get('#detail').hidden,true);
});

test('renaming a course keeps its shared code, identity, students and teams', async () => {
  const students=[{id:'s1',firstName:'Ana',lastName:'Ejemplo',topicId:'g1'}];
  const topics=[{id:'g1',name:'Bosque',position:0,capacity:5}];
  const page=await boot({students,topics});
  await page.openCourse('course-1');
  const before=JSON.stringify({id:page.current().id,code:page.current().accessCode,students,topics});
  await page.get('#edit-course-name').click();
  assert.equal(page.get('#rename-course-dialog').open,true);
  assert.equal(page.get('#rename-course-name').value,'Mantenimiento');
  page.get('#rename-course-name').value='  Taller de Informática · Sección A  ';
  await page.get('#rename-course-form').dispatch('submit');
  assert.equal(page.get('#course-title').textContent,'Taller de Informática · Sección A');
  assert.equal(page.get('#registration')['aria-label'],'Inscripciones abiertas. Cerrar para Taller de Informática · Sección A');
  assert.equal(page.get('#rename-course-dialog').open,false);
  assert.equal(JSON.stringify({id:page.current().id,code:page.current().accessCode,students,topics}),before);
  assert.deepEqual(JSON.parse(JSON.stringify(page.calls.filter(([n])=>n==='teacher_rename_course'))),
    [['teacher_rename_course',{p_course_id:'course-1',p_name:'Taller de Informática · Sección A'}]]);
  assert.equal(page.calls.some(([n])=>['create_course','create_course_with_groups','teacher_generate_course_code'].includes(n)),false);
  await page.loadCourses();await page.openCourse('course-1');
  assert.equal(page.get('#course-title').textContent,'Taller de Informática · Sección A');
});

test('canceling or saving an unchanged course name performs no update',async()=>{
  const page=await boot();await page.openCourse('course-1');
  await page.get('#edit-course-name').click();page.get('#rename-course-name').value='Otro nombre';
  await page.get('#cancel-course-rename').click();
  assert.equal(page.get('#rename-course-dialog').open,false);
  assert.equal(page.current().name,'Mantenimiento');
  await page.get('#edit-course-name').click();await page.get('#rename-course-form').dispatch('submit');
  assert.equal(page.get('#rename-course-dialog').open,false);
  assert.equal(page.calls.some(([n])=>n==='teacher_rename_course'),false);
});

test('blank, short and overly long course names are rejected before sending',async()=>{
  const page=await boot();await page.openCourse('course-1');await page.get('#edit-course-name').click();
  for(const name of ['', '   ', 'A', 'x'.repeat(121)]){
    page.get('#rename-course-name').value=name;await page.get('#rename-course-form').dispatch('submit');
    assert.equal(page.get('#rename-course-error').hidden,false);
    assert.equal(page.get('#rename-course-dialog').open,true);
    assert.equal(page.current().name,'Mantenimiento');
  }
  assert.equal(page.calls.some(([n])=>n==='teacher_rename_course'),false);
  page.get('#rename-course-name').value='Á'.repeat(120);await page.get('#rename-course-form').dispatch('submit');
  assert.equal(page.current().name,'Á'.repeat(120));
});

test('a failed rename preserves the original title and allows a successful retry',async()=>{
  let attempts=0;const page=await boot({renameError:()=>++attempts===1?'No se pudo guardar':null});
  await page.openCourse('course-1');await page.get('#edit-course-name').click();
  page.get('#rename-course-name').value='Informática';await page.get('#rename-course-form').dispatch('submit');
  assert.equal(page.get('#course-title').textContent,'Mantenimiento');
  assert.equal(page.get('#rename-course-dialog').open,true);
  assert.match(page.get('#rename-course-error').textContent,/No se pudo guardar/);
  assert.equal(page.get('#save-course-name').disabled,false);
  assert.equal(page.get('#rename-course-name').disabled,false);
  await page.get('#rename-course-form').dispatch('submit');
  assert.equal(page.get('#course-title').textContent,'Informática');
  assert.equal(page.current().accessCode,'MAT-AAAAA-BBBBB-CCCCC');
});

test('a pending rename cannot be submitted twice or canceled midway',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const page=await boot({delays:{teacher_rename_course:()=>gate}});
  await page.openCourse('course-1');await page.get('#edit-course-name').click();
  page.get('#rename-course-name').value='Informática';
  const pending=page.get('#rename-course-form').dispatch('submit');
  await page.get('#rename-course-form').dispatch('submit');await page.get('#cancel-course-rename').click();
  assert.equal(page.calls.filter(([n])=>n==='teacher_rename_course').length,1);
  assert.equal(page.get('#rename-course-dialog').open,true);
  assert.equal(page.get('#save-course-name').disabled,true);
  release();await pending;
  assert.equal(page.get('#course-title').textContent,'Informática');
});

test('logging out during rename prevents the late response from reopening private UI',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const page=await boot({delays:{teacher_rename_course:()=>gate}});
  await page.openCourse('course-1');await page.get('#edit-course-name').click();
  page.get('#rename-course-name').value='Nombre guardado';const pending=page.get('#rename-course-form').dispatch('submit');
  await page.get('#logout').click();release();await pending;
  assert.equal(page.get('#rename-course-dialog').open,false);
  assert.equal(page.get('#login').hidden,false);
  assert.equal(page.get('#course-title').textContent,'Mantenimiento');
  assert.doesNotMatch(page.get('#teacher-success').textContent,/Nombre actualizado/);
});

test('switching courses while a rename is pending preserves the newer course title',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const page=await boot({delays:{teacher_rename_course:()=>gate},overviewById:{'course-2':{
    course:{id:'course-2',name:'Sistemas II',active:true,accessCode:'MAT-DDDDD-EEEEE-FFFFF'},topics:[],students:[]}}});
  await page.openCourse('course-1');await page.get('#edit-course-name').click();
  page.get('#rename-course-name').value='Nombre anterior corregido';const pending=page.get('#rename-course-form').dispatch('submit');
  await page.openCourse('course-2');release();await pending;
  assert.equal(page.get('#course-title').textContent,'Sistemas II');
  assert.equal(page.get('#rename-course-dialog').open,false);
  assert.doesNotMatch(page.get('#teacher-success').textContent,/Nombre actualizado/);
});

test('a disabled course can be renamed while its code and disabled state remain intact',async()=>{
  const page=await boot();page.current().active=false;await page.openCourse('course-1');
  await page.get('#edit-course-name').click();page.get('#rename-course-name').value='Materia corregida';
  await page.get('#rename-course-form').dispatch('submit');
  assert.equal(page.current().name,'Materia corregida');assert.equal(page.current().active,false);
  assert.equal(page.current().accessCode,'MAT-AAAAA-BBBBB-CCCCC');
});
