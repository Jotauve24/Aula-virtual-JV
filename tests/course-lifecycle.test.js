import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { allCoursesXlsx } from '../assets/teacher-export.js';
import { buildTeacherPresenceStats, presenceAgeLabel } from '../assets/teacher-live-model.js';

const source = readFileSync(new URL('../assets/teacher.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const teamUiSource = readFileSync(new URL('../assets/team-ui.js', import.meta.url), 'utf8').replace(/^export /gm, '');

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
  focus() { if (!this.disabled) this.focused = true; }
  remove() { this.removed = true; }
  dispatch(name) { return this.listeners.get(name)?.({ target: this, preventDefault() {} }); }
  click() { return this.listeners.has('click') ? this.dispatch('click') : this.children[0]?.click(); }
}

const reviewText = node => String(node.textContent || '') + node.children.map(reviewText).join(' ');

async function boot({ files = [], fileError = null, students = [], topics = [], extraCourses = [],
  disabledCourses = [], overviewById = {}, studentFiles = {}, recoveryRequests = [], delays = {}, renameError = null, operationError = {}, liveRows } = {}) {
  const nodes = new Map();
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const get = selector => {
    if (selector.startsWith('#')) {
      const match = [...nodes.values()].flatMap(descendants).find(node => node.id === selector.slice(1));
      if (match) return match;
    }
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
    if(operationError[name]?.()) throw new Error('Error de conexión de prueba');
    if (name === 'my_courses') return [...(course?.active ? [courseRow()] : []), ...extraCourses];
    if (name === 'teacher_disabled_courses') return [...(course && !course.active ? [courseRow()] : []), ...disabledCourses];
    if (name === 'teacher_live_course_counts') return typeof liveRows === 'function' ? liveRows() : liveRows ?? [
      {course_id:course?.id,online_count:0,students:[],student_count:students.length,topic_count:topics.length,
        pending_work_group_count:topics.filter(t=>t.workGroupCreated!==true).length,
        ready_work_group_count:topics.filter(t=>t.workGroupCreated!==true&&t.capacity>0&&students.filter(s=>s.topicId===t.id).length>=t.capacity).length,
        enrollment_review_count:students.filter(s=>s.enrollmentReview===true).length}
    ];
    if (name === 'teacher_student_recovery_requests') return recoveryRequests;
    if (name === 'teacher_decide_student_recovery') {
      const index = recoveryRequests.findIndex(request => request.id === body.p_request_id);
      assert.notEqual(index, -1);
      recoveryRequests.splice(index, 1);
      return;
    }
    if (name === 'teacher_overview') return body.p_course_id === course?.id
      ? { course: { ...course }, topics:topics.map(row=>({...row})), students: [...students] } : overviewById[body.p_course_id];
    if (name === 'teacher_rename_course') {
      assert.equal(body.p_course_id, course.id);
      const failure = typeof renameError === 'function' ? renameError() : renameError;
      if (failure) throw new Error(failure);
      course.name = body.p_name;
      return { id: course.id, name: course.name };
    }
    if (name === 'teacher_edit_topic') {
      const topic=topics.find(row=>row.id===body.p_topic_id);
      assert.ok(topic);assert.equal(body.p_course_id,course.id);
      Object.assign(topic,{name:body.p_name,instructions:body.p_instructions,capacity:body.p_capacity});return;
    }
    if (name === 'teacher_release_student') {students.find(s=>s.id===body.p_student_id).topicId=null;return;}
    if (name === 'teacher_set_topic_locked') {
      const topic=topics.find(row=>row.id===body.p_topic_id);
      topic.locked=body.p_locked;return {id:topic.id,locked:topic.locked};
    }
    if (name === 'teacher_set_enrollment_review') {
      const student = students.find(row => row.id === body.p_student_id);
      assert.equal(body.p_course_id, course.id);
      student.enrollmentReview = body.p_review;
      return { id: student.id, enrollmentReview: student.enrollmentReview };
    }
    if (name === 'teacher_set_work_group_created') {
      assert.equal(body.p_course_id, course.id);
      const topic = topics.find(row => row.id === body.p_topic_id);
      topic.workGroupCreated = body.p_created;
      return { id: topic.id, workGroupCreated: topic.workGroupCreated };
    }
    if (name === 'teacher_assign_student') {
      assert.equal(body.p_course_id, course.id);
      assert.equal(course.active, true);
      const student = students.find(row => row.id === body.p_student_id);
      const target = topics.find(topic => topic.id === body.p_topic_id);
      if (!student || !target) throw new Error('Estudiante o grupo no encontrado');
      if (students.filter(row => row.topicId === target.id).length >= target.capacity && !body.p_allow_over_capacity)
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
  const pageActions = vm.runInNewContext(teamUiSource+'\n'+source+'\n({openCourse,loadCourses,refreshDashboardPresence,editTopic})', {
    document: { querySelector: get, querySelectorAll: () => [], hidden: false,
      createTextNode: text => { const node = new Element(); node.textContent = text; return node; },
      body: { append() {} }, createElement: tag => {
      const element = new Element();
      if (tag === 'a') element.click = () => downloads.push({ name: element.download, blob: downloadedBlob });
      return element;
    } },
    configured: true, signedIn: () => true, rpc, googleAvailable: async () => false,
    initTeacherAuth:({onSignedIn})=>{void onSignedIn().catch(()=>{});return {signOut(){}};}, location:{search:''}, URLSearchParams, confirm: () => true,
    createTeacherNotices:()=>({reset(){},setCourse(){},setCourses(){},open(){}}),
    Blob, URL: { createObjectURL(blob) { downloadedBlob = blob; return 'blob:roster'; }, revokeObjectURL() {} },
    allCoursesXlsx, TextEncoder, buildTeacherPresenceStats, presenceAgeLabel,
    setTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    deleteTeacherCourseFiles: async (id, paths) => {
      calls.push(['remove_storage_files', { id, paths }]);
      if (fileError) throw new Error(fileError);
    }
  }, { filename: 'assets/teacher.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { get, calls, downloads, current: () => course, openCourse: pageActions.openCourse, loadCourses: pageActions.loadCourses, refresh:pageActions.refreshDashboardPresence,editTopic:pageActions.editTopic };
}

test('Mis materias muestra grupos sin check y matrícula por verificar aunque nadie esté conectado',async()=>{
 const page=await boot({topics:[{id:'g1',workGroupCreated:true},{id:'g2',locked:true},{id:'g3'}],
  students:[{id:'a',topicId:'g1',enrollmentReview:true},{id:'b',topicId:null,enrollmentReview:true}]});
 const host=page.get('#course-follow-up-course-1');
 assert.match(reviewText(host),/2 grupos pendientes/);assert.match(reviewText(host),/2 matrículas por verificar/);
 assert.equal(host.dataset.state,'ready');assert.equal(page.get('#summary-online').textContent,'0');
 assert.equal(page.get('#course-student-total-course-1').textContent,'2');
 assert.equal(page.get('#course-topic-total-course-1').textContent,'3 grupos');
 assert.equal(page.get('#summary-enrolled').textContent,'2');
 assert.equal(page.calls.filter(([name])=>name==='teacher_overview').length,0);
});
test('las tarjetas reflejan al volver las marcas guardadas y retiradas',async()=>{
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5,position:0}],
  students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}]});
 await page.openCourse('course-1');await page.get('#work-group-created-g1').click();
 await page.get('#enrollment-review-a').click();await page.loadCourses();await page.refresh();
 assert.match(reviewText(page.get('#course-follow-up-course-1')),/0 grupos pendientes/);
 assert.match(reviewText(page.get('#course-follow-up-course-1')),/1 matrícula por verificar/);
 await page.openCourse('course-1');await page.get('#work-group-created-g1').click();
 await page.get('#enrollment-review-a').click();await page.loadCourses();await page.refresh();
 assert.match(reviewText(page.get('#course-follow-up-course-1')),/1 grupo pendiente/);
 assert.doesNotMatch(reviewText(page.get('#course-follow-up-course-1')),/matrícula por verificar/);
});
test('un fallo conserva los últimos pendientes con un aviso y luego recupera el conteo',async()=>{
 let fail=false;const topics=[{id:'g1',capacity:1}];
 const page=await boot({topics,students:[{id:'a',topicId:'g1'}],operationError:{teacher_live_course_counts:()=>fail}});
 fail=true;await page.refresh();const host=page.get('#course-follow-up-course-1');
 assert.match(reviewText(host),/1 grupo pendiente/);assert.match(reviewText(host),/Sin actualizar/);assert.equal(host.dataset.state,'stale');
 assert.match(reviewText(host),/1 grupo listo para check/);
 topics[0].workGroupCreated=true;fail=false;await page.refresh();
 assert.match(reviewText(host),/0 grupos pendientes/);assert.doesNotMatch(reviewText(host),/Sin actualizar/);assert.equal(host.dataset.state,'ready');
 assert.doesNotMatch(reviewText(host),/listo para check/);
});
test('la campanita cuenta solo grupos completos sin check y sigue sus cambios',async()=>{
 const topics=[{id:'full',name:'Completo',capacity:2,locked:true},{id:'checked',name:'Ya creado',capacity:1,workGroupCreated:true},
  {id:'partial',name:'Incompleto',capacity:2},{id:'empty',name:'Vacío',capacity:1}];
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:'full'},
  {id:'b',firstName:'Bea',lastName:'Prueba',topicId:'full',enrollmentReview:true},
  {id:'c',topicId:'checked'},{id:'d',topicId:'partial'},{id:'u',topicId:null}];
 const page=await boot({topics,students});const host=()=>page.get('#course-follow-up-course-1');
 assert.match(reviewText(host()),/3 grupos pendientes/);assert.match(reviewText(host()),/1 grupo listo para check/);
 assert.match(reviewText(host()),/1 matrícula por verificar/);
 const before=structuredClone(students);
 await page.openCourse('course-1');await page.get('#work-group-created-full').click();
 await page.loadCourses();await page.refresh();assert.doesNotMatch(reviewText(host()),/listo para check/);
 assert.match(reviewText(host()),/2 grupos pendientes/);assert.deepEqual(students,before);
 await page.openCourse('course-1');await page.get('#work-group-created-full').click();
 await page.loadCourses();await page.refresh();assert.match(reviewText(host()),/1 grupo listo para check/);
 students[0].topicId=null;await page.refresh();assert.doesNotMatch(reviewText(host()),/listo para check/);
 students[0].topicId='full';await page.refresh();assert.match(reviewText(host()),/1 grupo listo para check/);
 assert.equal(topics[0].workGroupCreated,false);assert.equal(topics[0].locked,true);
});
test('dos grupos llenos o con cupo superado muestran una cantidad plural sin exigir matrícula confirmada',async()=>{
 const page=await boot({topics:[{id:'a',capacity:1},{id:'b',capacity:1}],
  students:[{id:'a1',topicId:'a',enrollmentReview:true},{id:'a2',topicId:'a'},{id:'b1',topicId:'b'}]});
 assert.match(reviewText(page.get('#course-follow-up-course-1')),/2 grupos listos para check/);
 assert.match(reviewText(page.get('#course-follow-up-course-1')),/1 matrícula por verificar/);
 assert.equal(page.calls.filter(([name])=>name==='teacher_set_work_group_created').length,0);
});
test('sin datos de seguimiento la tarjeta nunca asegura que no haya pendientes',async()=>{
 const page=await boot({liveRows:[{course_id:'course-1',online_count:0}]});
 assert.match(reviewText(page.get('#course-follow-up-course-1')),/Pendientes no disponibles/);
 assert.doesNotMatch(reviewText(page.get('#course-follow-up-course-1')),/0 grupos pendientes/);
 assert.equal(page.get('#course-follow-up-course-1').dataset.state,'unavailable');
});
test('una lectura anterior al check guardado no repone el contador anterior',async()=>{
 let held=false,release;
 const topics=[{id:'g1',name:'Coral',capacity:5,position:0}];
 const page=await boot({topics,delays:{teacher_live_course_counts:()=>held?new Promise(resolve=>release=resolve):undefined},
  liveRows:()=>[{course_id:'course-1',online_count:0,student_count:held?99:0,topic_count:1,pending_work_group_count:1,ready_work_group_count:0,enrollment_review_count:0}]});
 await page.openCourse('course-1');held=true;const read=page.refresh();
 await page.get('#work-group-created-g1').click();
 const host=page.get('#course-follow-up-course-1'),signature=host.dataset.signature;
 release();await read;assert.equal(host.dataset.signature,signature);assert.equal(page.get('#summary-enrolled').textContent,'0');
});
test('salir mientras llegan los pendientes no restaura el panel ni sus totales',async()=>{
 let held=false,release;const page=await boot({delays:{teacher_live_course_counts:()=>held?new Promise(resolve=>release=resolve):undefined}});
 held=true;const read=page.refresh();page.get('#logout').click();
 release();await read;assert.equal(page.get('#login').hidden,false);assert.equal(page.get('#dashboard').hidden,true);
});

test('el docente marca y retira una revisión sin eliminar, liberar o cambiar al estudiante',async()=>{
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:'g1',email:'a@example.invalid',phone:'60000001',age:21,avatar:{skin:1}}];
 const before=structuredClone(students[0]);
 const page=await boot({students,topics:[{id:'g1',name:'Coral',position:0,capacity:5}]});await page.openCourse('course-1');
 const button=()=>page.get('#enrollment-review-a');
 assert.equal(button()['aria-pressed'],'false');assert.match(button()['aria-label'],/Marcar matrícula por verificar de Ana/);
 await button().click();assert.equal(students[0].enrollmentReview,true);
 assert.equal(button()['aria-pressed'],'true');assert.equal(button().disabled,false);assert.equal(button().focused,true);
 assert.match(reviewText(page.get('#student-list')),/1 matrícula por verificar/);
 assert.match(page.get('#course-summary').textContent,/1 matrícula por verificar/);
 assert.match(page.get('#teacher-success').textContent,/equipo verá el aviso/);
 await button().click();assert.equal(students[0].enrollmentReview,false);
 const {enrollmentReview,...rest}=students[0];assert.deepEqual(rest,before);
 assert.doesNotMatch(reviewText(page.get('#student-list')),/Matrícula por verificar/);
 assert.equal(page.calls.some(([name])=>/delete_student|release_student|assign_student/.test(name)),false);
 assert.deepEqual(page.calls.filter(([name])=>name==='teacher_set_enrollment_review').map(([,body])=>body.p_review),[true,false]);
});

test('una marca también funciona sin equipo y no convierte a los demás en matrícula confirmada',async()=>{
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null},
  {id:'b',firstName:'Bea',lastName:'Prueba',topicId:null}];
 const page=await boot({students});await page.openCourse('course-1');await page.get('#enrollment-review-a').click();
 assert.equal(students[0].topicId,null);assert.equal(students[1].enrollmentReview,undefined);
 assert.match(reviewText(page.get('#student-list')),/1 matrícula por verificar/);
 assert.doesNotMatch(reviewText(page.get('#student-list')),/Matrícula confirmada/);
});

test('un aviso pendiente bloquea duplicados y se puede reintentar tras un fallo',async()=>{
 let release,fail=true;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}],
  delays:{teacher_set_enrollment_review:()=>gate},operationError:{teacher_set_enrollment_review:()=>{const value=fail;fail=false;return value;}}});
 await page.openCourse('course-1');const button=page.get('#enrollment-review-a');
 const pending=button.click();await button.click();assert.equal(page.calls.filter(([n])=>n==='teacher_set_enrollment_review').length,1);
 assert.equal(button.disabled,true);release();await pending;
 assert.equal(button.disabled,false);assert.equal(button['aria-pressed'],'false');assert.match(page.get('#error').textContent,/conexión/);
 await button.click();assert.equal(page.get('#enrollment-review-a')['aria-pressed'],'true');
});

test('dos revisiones simultáneas conservan ambas marcas y sus controles',async()=>{
 const resolvers={};const students=['a','b'].map(id=>({id,firstName:id,lastName:'Prueba',topicId:null}));
 const page=await boot({students,delays:{teacher_set_enrollment_review:body=>new Promise(resolve=>resolvers[body.p_student_id]=resolve)}});
 await page.openCourse('course-1');const a=page.get('#enrollment-review-a').click(),b=page.get('#enrollment-review-b').click();
 resolvers.a();await a;assert.equal(page.get('#enrollment-review-b').disabled,true);
 resolvers.b();await b;assert.ok(students.every(s=>s.enrollmentReview));
 assert.equal(page.get('#enrollment-review-a').disabled,false);assert.equal(page.get('#enrollment-review-b').disabled,false);
 assert.match(page.get('#course-summary').textContent,/2 matrículas por verificar/);
});

test('una respuesta tardía de la marca no restaura la vista tras salir',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}],delays:{teacher_set_enrollment_review:()=>gate}});
 await page.openCourse('course-1');const pending=page.get('#enrollment-review-a').click();
 page.get('#logout').click();release();await pending;
 assert.equal(page.get('#login').hidden,false);assert.doesNotMatch(page.get('#teacher-success').textContent,/Matrícula por verificar/);
});

test('reabrir la misma materia mientras se guarda no deja el triángulo bloqueado',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}],delays:{teacher_set_enrollment_review:()=>gate}});
 await page.openCourse('course-1');const pending=page.get('#enrollment-review-a').click();
 await page.openCourse('course-1');assert.equal(page.get('#enrollment-review-a').disabled,true);
 release();await pending;
 assert.equal(page.get('#enrollment-review-a').disabled,false);assert.equal(page.get('#enrollment-review-a')['aria-pressed'],'true');
});

test('el check del grupo se guarda, se conserva al reabrir y se puede quitar',async()=>{
 const topics=[{id:'g1',name:'Coral',capacity:5,position:0},{id:'g2',name:'Teal',capacity:5,position:1}];
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:'g1',enrollmentReview:true,avatar:{skin:1}}];
 const before=structuredClone(students);
 const page=await boot({topics,students});await page.openCourse('course-1');
 const control=()=>page.get('#work-group-created-g1');
 assert.equal(control()['aria-pressed'],'false');assert.match(control()['aria-label'],/Marcar grupo de trabajo como creado: Coral/);
 await control().click();assert.equal(topics[0].workGroupCreated,true);assert.equal(topics[1].workGroupCreated,undefined);
 assert.equal(control()['aria-pressed'],'true');assert.equal(control().disabled,false);assert.equal(control().focused,true);
 await page.openCourse('course-1');assert.equal(control()['aria-pressed'],'true');
 await control().click();assert.equal(topics[0].workGroupCreated,false);assert.deepEqual(students,before);
 const walk=n=>[n,...n.children.flatMap(walk)];
 assert.equal(walk(page.get('#student-list')).filter(n=>n.className==='secondary teacher-icon-button work-group-check').length,2);
 assert.deepEqual(page.calls.filter(([name])=>name==='teacher_set_work_group_created').map(([,b])=>b.p_created),[true,false]);
});

test('el check no depende de que el equipo esté lleno ni de que esté bloqueado',async()=>{
 const topics=[{id:'empty',name:'Vacío',capacity:5,locked:true},{id:'full',name:'Lleno',capacity:1,locked:true}];
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:'full'}];
 const page=await boot({topics,students});await page.openCourse('course-1');
 await page.get('#work-group-created-empty').click();await page.get('#work-group-created-full').click();
 assert.ok(topics.every(t=>t.workGroupCreated));assert.ok(topics.every(t=>t.locked));
 assert.equal(students[0].topicId,'full');assert.equal(topics[1].capacity,1);
});

test('un check pendiente evita duplicados y permite reintentar tras un error',async()=>{
 let release,fail=true;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5}],delays:{teacher_set_work_group_created:()=>gate},
  operationError:{teacher_set_work_group_created:()=>{const v=fail;fail=false;return v;}}});
 await page.openCourse('course-1');const button=page.get('#work-group-created-g1');
 const saving=button.click();await button.click();assert.equal(page.calls.filter(([n])=>n==='teacher_set_work_group_created').length,1);
 release();await saving;assert.equal(button.disabled,false);assert.equal(button['aria-pressed'],'false');
 assert.match(page.get('#error').textContent,/conexión/);await button.click();assert.equal(page.get('#work-group-created-g1')['aria-pressed'],'true');
});

test('un check y una alerta guardados simultáneamente conservan ambos estados',async()=>{
 const resolve={};const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5}],
  students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:'g1'}],delays:{
   teacher_set_work_group_created:()=>new Promise(r=>resolve.group=r),teacher_set_enrollment_review:()=>new Promise(r=>resolve.student=r)}});
 await page.openCourse('course-1');const a=page.get('#work-group-created-g1').click(),b=page.get('#enrollment-review-a').click();
 resolve.student();await b;assert.equal(page.get('#work-group-created-g1').disabled,true);
 resolve.group();await a;assert.equal(page.get('#enrollment-review-a')['aria-pressed'],'true');
 assert.equal(page.get('#work-group-created-g1')['aria-pressed'],'true');assert.equal(page.get('#work-group-created-g1').disabled,false);
});

test('reabrir durante un check pendiente no deja el control bloqueado',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5}],delays:{teacher_set_work_group_created:()=>gate}});
 await page.openCourse('course-1');const saving=page.get('#work-group-created-g1').click();
 await page.openCourse('course-1');assert.equal(page.get('#work-group-created-g1').disabled,true);
 release();await saving;assert.equal(page.get('#work-group-created-g1').disabled,false);assert.equal(page.get('#work-group-created-g1')['aria-pressed'],'true');
});

test('salir durante el guardado del check no restaura la materia ni muestra el éxito tarde',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5}],delays:{teacher_set_work_group_created:()=>gate}});
 await page.openCourse('course-1');const saving=page.get('#work-group-created-g1').click();
 page.get('#logout').click();release();await saving;
 assert.equal(page.get('#login').hidden,false);assert.doesNotMatch(page.get('#teacher-success').textContent,/marcado como creado/);
});

test('el check de una materia deshabilitada se consulta sin permitir cambiarlo',async()=>{
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5,workGroupCreated:true}]});page.current().active=false;
 await page.openCourse('course-1');const b=page.get('#work-group-created-g1');assert.equal(b.disabled,true);assert.equal(b['aria-pressed'],'true');
 await b.click();assert.equal(page.calls.some(([n])=>n==='teacher_set_work_group_created'),false);
});

test('materias deshabilitadas conservan las observaciones sin ofrecer cambios',async()=>{
 const page=await boot({students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null,enrollmentReview:true}]});
 page.current().active=false;await page.openCourse('course-1');
 assert.match(reviewText(page.get('#student-list')),/Matrícula por verificar/);
 const walk=n=>[n,...n.children.flatMap(walk)];
 assert.equal(walk(page.get('#student-list')).some(n=>n.className==='secondary teacher-icon-button teacher-enrollment-toggle'),false);
});

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
  assert.deepEqual(page.calls.filter(([name]) => name==='teacher_assign_student')
    .map(([,body])=>JSON.parse(JSON.stringify(body))),
    [{p_course_id:'course-1',p_student_id:'a',p_topic_id:'g2',p_allow_over_capacity:false}]);
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
test('grupo lleno exige autorización antes de asignar un integrante adicional',async()=>{
  const students=[
    {id:'a',firstName:'Carlos',lastName:'Pérez',phone:'555-1',topicId:null},
    {id:'b',firstName:'Elena',lastName:'Mora',phone:'555-2',topicId:'g1'}
  ];
  const topics=[{id:'g1',name:'Grupo lleno',position:0,capacity:1}];
  const page=await boot({students,topics});
  await page.get('#courses').children[0].click();
  await page.get('#student-list').children[1].children[1].children[3].click();
  assert.equal(page.get('#move-student-destination').disabled,false);
  assert.equal(page.get('#confirm-student-move').disabled,true);
  assert.equal(page.get('#move-capacity-exception').hidden,false);
  assert.match(page.get('#move-capacity-summary').textContent,/2 de 1/);
  await page.get('#move-student-form').dispatch('submit');
  assert.equal(page.calls.some(([name])=>name==='teacher_assign_student'),false);
  page.get('#move-over-capacity').checked=true;
  await page.get('#move-over-capacity').dispatch('change');
  assert.equal(page.get('#confirm-student-move').disabled,false);
  await page.get('#move-student-form').dispatch('submit');
  assert.equal(page.get('#move-student-dialog').open,false);
  assert.equal(students[0].topicId,'g1');
  assert.equal(topics[0].capacity,1);
  assert.equal(page.calls.find(([name])=>name==='teacher_assign_student')[1].p_allow_over_capacity,true);
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


test('candado docente bloquea y reabre un grupo sin alterar integrantes o cupos',async()=>{
 const topics=[{id:'g1',name:'Grupo Coral',position:0,capacity:5,locked:false}];
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:'g1'}];
 const page=await boot({topics,students});await page.openCourse('course-1');
 const lock=()=>page.get('#topic-list').children[0].children.at(-1);
 assert.equal(lock()['aria-pressed'],'false');await lock().click();
 assert.equal(topics[0].locked,true);assert.equal(lock()['aria-pressed'],'true');
 assert.match(page.get('#topic-list').children[0].children[1].textContent,/1 de 5.*bloqueado/);
 assert.equal(students[0].topicId,'g1');assert.equal(topics[0].capacity,5);
 await lock().click();assert.equal(topics[0].locked,false);
 assert.equal(page.calls.filter(([name])=>name==='teacher_set_topic_locked').length,2);
});
test('traslado a grupo bloqueado y ya excedido exige permiso que se reinicia al cambiar destino',async()=>{
 const topics=[{id:'g1',name:'Cerrado',position:0,capacity:1,locked:true},
 {id:'g2',name:'Disponible',position:1,capacity:5},{id:'g3',name:'Origen',position:2,capacity:5}];
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:'g3',avatar:{skin:1}},
 {id:'b',firstName:'Bea',lastName:'Prueba',topicId:'g1'},{id:'c',firstName:'Ceci',lastName:'Prueba',topicId:'g1'}];
 const page=await boot({topics,students});await page.openCourse('course-1');
 await page.get('#student-list').children[2].children[1].children[3].click();
 const select=page.get('#move-student-destination'),permission=page.get('#move-over-capacity');
 select.value='g1';await select.dispatch('change');assert.match(page.get('#move-student-help').textContent,/bloqueado/);
 assert.match(page.get('#move-capacity-summary').textContent,/3 de 1/);
 permission.checked=true;await permission.dispatch('change');
 select.value='g2';await select.dispatch('change');assert.equal(permission.checked,false);
 select.value='g1';await select.dispatch('change');assert.equal(page.get('#confirm-student-move').disabled,true);
 permission.checked=true;await permission.dispatch('change');await page.get('#move-student-form').dispatch('submit');
 assert.equal(students[0].topicId,'g1');assert.deepEqual(students[0].avatar,{skin:1});
 assert.equal(topics[0].locked,true);assert.equal(topics[0].capacity,1);
});
test('asignación sin otro grupo permanece vacía y no envía solicitudes',async()=>{
 const page=await boot({topics:[],students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}]});
 await page.openCourse('course-1');await page.get('#student-list').children[0].children[1].children[3].click();
 assert.equal(page.get('#move-student-destination').disabled,true);
 assert.equal(page.get('#confirm-student-move').disabled,true);
 assert.equal(page.get('#move-capacity-exception').hidden,true);
 await page.get('#move-student-form').dispatch('submit');assert.equal(page.calls.some(([n])=>n==='teacher_assign_student'),false);
});
test('error de asignación conserva permiso y permite reintentar sin duplicar un envío pendiente',async()=>{
 let attempts=0,release;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:1}],
 students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}],
 operationError:{teacher_assign_student:()=>++attempts===1},delays:{teacher_assign_student:()=>gate}});
 await page.openCourse('course-1');await page.get('#student-list').children[1].children[1].children[3].click();
 const pending=page.get('#move-student-form').dispatch('submit');
 await page.get('#move-student-form').dispatch('submit');await page.get('#cancel-student-move').click();
 assert.equal(page.calls.filter(([n])=>n==='teacher_assign_student').length,1);
 assert.equal(page.get('#move-student-dialog').open,true);assert.equal(page.get('#move-over-capacity').disabled,true);
 release();await pending;assert.equal(page.get('#move-student-error').hidden,false);
 assert.equal(page.get('#confirm-student-move').disabled,false);
 await page.get('#move-student-form').dispatch('submit');assert.equal(page.get('#move-student-dialog').open,false);
});
test('cerrar sesión o cambiar de materia impide que un traslado pendiente reabra datos antiguos',async()=>{
 for(const logout of [true,false]){
 let release;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5}],
 students:[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}],delays:{teacher_assign_student:()=>gate},
 overviewById:{'course-2':{course:{id:'course-2',name:'Otra materia',active:true},topics:[],students:[]}}});
 await page.openCourse('course-1');await page.get('#student-list').children[1].children[1].children[3].click();
 const pending=page.get('#move-student-form').dispatch('submit');
 if(logout)await page.get('#logout').click();else await page.openCourse('course-2');
 release();await pending;assert.equal(page.get('#move-student-dialog').open,false);
 if(logout)assert.equal(page.get('#login').hidden,false);else assert.equal(page.get('#course-title').textContent,'Otra materia');
 assert.doesNotMatch(page.get('#teacher-success').textContent,/Equipo actualizado/);
 }
});
test('un candado pendiente no muestra éxito ni recupera la materia tras salir',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const page=await boot({topics:[{id:'g1',name:'Coral',capacity:5}],delays:{teacher_set_topic_locked:()=>gate}});
 await page.openCourse('course-1');const lock=page.get('#topic-list').children[0].children.at(-1);
 const pending=lock.click();await lock.click();assert.equal(page.calls.filter(([n])=>n==='teacher_set_topic_locked').length,1);
 await page.get('#logout').click();release();await pending;
 assert.equal(page.get('#login').hidden,false);assert.doesNotMatch(page.get('#teacher-success').textContent,/Ingreso bloqueado/);
});


test('un grupo que se llena mientras el diálogo está abierto muestra el permiso al reintentar',async()=>{
 const students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}];
 const topics=[{id:'g1',name:'Coral',capacity:1}];
 const page=await boot({students,topics});await page.openCourse('course-1');
 await page.get('#student-list').children[1].children[1].children[3].click();
 assert.equal(page.get('#move-capacity-exception').hidden,true);
 students.push({id:'b',firstName:'Bea',lastName:'Prueba',topicId:'g1'});
 await page.get('#move-student-form').dispatch('submit');
 assert.equal(page.get('#move-capacity-exception').hidden,false);
 assert.equal(page.get('#move-student-error').hidden,false);
 assert.equal(page.get('#confirm-student-move').disabled,true);
 page.get('#move-over-capacity').checked=true;await page.get('#move-over-capacity').dispatch('change');
 await page.get('#move-student-form').dispatch('submit');
 assert.equal(students[0].topicId,'g1');assert.equal(topics[0].capacity,1);
});


test('una lectura fallida tras guardar un candado o traslado informa al docente sin reenviar cambios',async()=>{
 for(const lockAction of [true,false]){
 let reads=0;
 const topics=[{id:'g1',name:'Coral',capacity:5}],students=[{id:'a',firstName:'Ana',lastName:'Prueba',topicId:null}];
 const page=await boot({topics,students,operationError:{teacher_overview:()=>++reads>1}});
 await page.openCourse('course-1');
 if(lockAction)await page.get('#topic-list').children[0].children.at(-1).click();
 else {await page.get('#student-list').children[1].children[1].children[3].click();await page.get('#move-student-form').dispatch('submit');}
 assert.equal(page.get('#error').hidden,false);
 assert.equal(page.calls.filter(([n])=>n===(lockAction?'teacher_set_topic_locked':'teacher_assign_student')).length,1);
 if(lockAction)assert.equal(topics[0].locked,true);
 else {assert.equal(students[0].topicId,'g1');assert.match(page.get('#error').textContent,/asignación se guardó/);}
 }
});

function topicEditor(page) {
 const form=page.get('#edit-topic-form');
 const fields=Object.fromEntries(['name','instructions','capacity'].map(name=>[name,new Element()]));
 form.elements={namedItem:name=>fields[name]};
 form.querySelector=()=>page.get('#edit-topic-submit');
 return {form,fields};
}
test('editar tema congela sus datos y evita cerrar o abrir otra edición durante el guardado',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const topics=[{id:'a',name:'Coral',capacity:5,position:0},{id:'b',name:'Teal',capacity:5,position:1}];
 const page=await boot({topics,delays:{teacher_edit_topic:()=>gate}});await page.openCourse('course-1');
 const {form,fields}=topicEditor(page);page.editTopic(topics[0]);fields.name.value='Coral actualizado';
 const pending=form.dispatch('submit');await new Promise(setImmediate);
 assert.ok(Object.values(fields).every(field=>field.disabled));assert.equal(form['aria-busy'],'true');
 page.get('#cancel-topic-edit').click();assert.equal(page.get('#edit-topic-dialog').open,true);
 let prevented=false;page.get('#edit-topic-dialog').listeners.get('cancel')({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 page.editTopic(topics[1]);assert.equal(fields.name.value,'Coral actualizado');
 await form.dispatch('submit');assert.equal(page.calls.filter(([name])=>name==='teacher_edit_topic').length,1);
 release();await pending;assert.equal(topics[0].name,'Coral actualizado');assert.equal(topics[1].name,'Teal');
 assert.equal(page.get('#edit-topic-dialog').open,false);
 page.editTopic(topics[1]);assert.equal(fields.name.value,'Teal');assert.ok(Object.values(fields).every(field=>!field.disabled));
});
test('un error de edición permite reintentar con los datos escritos y no afecta una sesión cerrada',async()=>{
 let release,fail=true;const gate=new Promise(resolve=>release=resolve);
 const topics=[{id:'a',name:'Coral',capacity:5,position:0}];
 const page=await boot({topics,delays:{teacher_edit_topic:()=>gate},operationError:{teacher_edit_topic:()=>fail}});
 await page.openCourse('course-1');const {form,fields}=topicEditor(page);page.editTopic(topics[0]);fields.name.value='Mi tema corregido';
 const pending=form.dispatch('submit');release();await pending;
 assert.equal(fields.name.value,'Mi tema corregido');assert.equal(fields.name.disabled,false);
 assert.equal(page.get('#edit-topic-error').hidden,false);assert.equal(form['aria-busy'],'false');
 fail=false;await form.dispatch('submit');assert.equal(topics[0].name,'Mi tema corregido');
});
test('una edición pendiente no reabre el panel después de cerrar sesión',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const topics=[{id:'a',name:'Coral',capacity:5,position:0}];
 const page=await boot({topics,delays:{teacher_edit_topic:()=>gate}});await page.openCourse('course-1');
 const {form,fields}=topicEditor(page);page.editTopic(topics[0]);fields.name.value='Guardado anterior';
 const pending=form.dispatch('submit');await new Promise(setImmediate);page.get('#logout').click();
 release();await pending;
 assert.equal(page.get('#edit-topic-dialog').open,false);assert.equal(page.get('#detail').hidden,true);assert.equal(page.get('#login').hidden,false);
 assert.doesNotMatch(page.get('#teacher-success').textContent,/Tema y cupos actualizados/);
});
test('las recuperaciones docentes asocian las etiquetas a sus controles de identidad',async()=>{
 const page=await boot({recoveryRequests:[{id:'request-qa',email:'qa@example.test',requested_at:'2026-10-28T12:00:00Z'}]});
 await page.openCourse('course-1');await new Promise(setImmediate);
 const item=page.get('#student-recovery-requests').children[0];
 assert.equal(item.children[2].htmlFor,item.children[3].id);assert.equal(item.children[3].name,'student');
 assert.equal(item.children[5].htmlFor,item.children[6].id);assert.equal(item.children[6].name,'confirmation');
});
test('una respuesta parcial muestra presencia desconocida hasta recibir un cero confirmado',async()=>{
 let available=false;const page=await boot({liveRows:()=>available?[{course_id:'course-1',online_count:0,students:[]}]:[]});
 assert.equal(page.get('#summary-online').textContent,'—');assert.match(page.get('#live-updated').textContent,/parcial/);
 assert.equal(page.get('#live-error').hidden,false);await page.openCourse('course-1');
 assert.equal(page.get('#detail-live-count').textContent,'— en línea');
 assert.match(reviewText(page.get('#detail-online-list')),/No se pudo comprobar/);
 available=true;await page.refresh();assert.equal(page.get('#summary-online').textContent,'0');assert.equal(page.get('#live-error').hidden,true);
 assert.match(reviewText(page.get('#detail-online-list')),/No hay estudiantes conectados/);
});

test('volver a materias descarta la edición anterior y deja iniciar otra aunque su respuesta siga pendiente',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const topics=[{id:'a',name:'Coral',capacity:5,position:0},{id:'b',name:'Teal',capacity:5,position:1}];
 const page=await boot({topics,delays:{teacher_edit_topic:()=>gate}});await page.openCourse('course-1');
 const {form,fields}=topicEditor(page);page.editTopic(topics[0]);fields.name.value='Cambio anterior';
 const old=form.dispatch('submit');await new Promise(setImmediate);await page.loadCourses();
 assert.equal(page.get('#edit-topic-dialog').open,false);await page.openCourse('course-1');page.editTopic(topics[1]);
 assert.equal(fields.name.value,'Teal');assert.equal(fields.name.disabled,false);
 release();await old;
 assert.equal(page.get('#edit-topic-dialog').open,true);assert.equal(fields.name.value,'Teal');
 assert.doesNotMatch(page.get('#teacher-success').textContent,/Tema y cupos actualizados/);
});
