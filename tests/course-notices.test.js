import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentNotices } from '../assets/student-notices.js';
import { createTeacherNotices, createNoticeId } from '../assets/teacher-notices.js';

// Small DOM doubles run the real controllers. All names and messages are fictional.
class Element {
  constructor(root,tag='div') { Object.assign(this,{root,tag,children:[],listeners:new Map(),hidden:false,disabled:false,open:false,value:'',isConnected:true,scrollTop:0}); }
  set textContent(value) { this.text=String(value); this.children=[]; }
  get textContent() { return (this.text||'')+this.children.map(child=>child.textContent).join(''); }
  set innerHTML(value) { throw new Error('Notice text must never be parsed as HTML'); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text=''; this.children=[...nodes]; }
  setAttribute(name,value) { this[name]=String(value); }
  addEventListener(name,handler) { if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(handler); }
  async fire(name) { const event={target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}}; await Promise.all((this.listeners.get(name)||[]).map(fn=>fn(event))); return event; }
  focus() { this.root.activeElement=this; }
  showModal() { this.open=true; }
  close() { this.open=false; }
  reset() { for(const id of ['teacher-notice-title','teacher-notice-body','teacher-notice-target'])this.root.get(id).value=''; }
}
function dom() {
  const elements=new Map();
  const root={get(id){if(!elements.has(id))elements.set(id,new Element(root));return elements.get(id);},
    querySelector(selector){return selector==='dialog[open]'?[...elements].find(([key,value])=>key.endsWith('-dialog')&&value.open)?.[1]||null:this.get(selector.slice(1));},
    createElement(tag){return new Element(root,tag);}};
  return root;
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const notice=(id='n1',extra={})=>({id,title:'Actividad extra',body:'Revisa las indicaciones en Educativa.\nEntrega una vez por equipo.',createdAt:'2026-10-31T19:00:00Z',confirmedAt:null,...extra});
const context={courseId:'c1',studentId:'s1',courseName:'Sistemas I · Materia ficticia'};
test('el identificador de envío funciona también cuando el navegador no ofrece randomUUID',()=>{
  const uuid=createNoticeId({getRandomValues:bytes=>{for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}});
  assert.match(uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(createNoticeId({randomUUID:()=>uuid}),uuid);
});
function student(rpc,options={}) {const root=dom();const controller=createStudentNotices({root,rpc,signedIn:()=>true,...options});return {root,controller,get:id=>root.get('student-'+id)};}

test('el resumen comparte solo lecturas confirmadas por el servidor y distingue un fallo al actualizar',async()=>{
  const snapshots=[],gate=deferred();let failing=false;
  const page=student(async name=>{if(failing)throw Error('Sin conexión');return name==='student_course_notices'?[notice()]:gate.promise;},{onUpdate:value=>snapshots.push(value)});
  await page.controller.enter(context);assert.ok(snapshots.some(value=>value.state==='loading'));
  assert.equal(snapshots.at(-1).pendingCount,1);assert.equal(snapshots.at(-1).rows[0].confirmedAt,null);
  await page.get('notice-confirm').fire('click');assert.equal(snapshots.at(-1).rows[0].confirmedAt,null);
  gate.resolve({confirmedAt:'2026-10-31T21:00:00Z'});await settle();
  assert.equal(snapshots.at(-1).pendingCount,0);assert.equal(snapshots.at(-1).rows[0].confirmedAt,'2026-10-31T21:00:00Z');
  failing=true;await page.controller.refresh();assert.equal(snapshots.at(-1).state,'unavailable');
  page.controller.reset();assert.deepEqual(snapshots.at(-1),{state:'hidden',pendingCount:0,rows:[]});
});
test('cerrar los avisos devuelve el foco al acceso del tablón que los abrió',async()=>{
  const page=student(async()=>[notice('n1',{confirmedAt:'2026-10-31T21:00:00Z'})]);await page.controller.enter(context);
  const opener=page.root.createElement('button');page.controller.open({opener});await settle();
  await page.get('notice-close').fire('click');assert.equal(page.root.activeElement,opener);
});
function teacher(rpc) {const root=dom();let nextId=0;const controller=createTeacherNotices({root,rpc,signedIn:()=>true,makeId:()=>`uuid-${++nextId}`});controller.setCourse({id:'c1',name:'Materia ficticia',active:true},[{id:'g1',name:'Equipo Coral'}]);return {root,controller,get:id=>root.get(id)};}

test('abrir un aviso exige Entendido, sin confirmar por mostrarlo ni por Escape',async()=>{
  const calls=[],wait=deferred();
  const page=student(async(name,args)=>{calls.push({name,args});return name==='student_course_notices'?[notice()]:wait.promise;});
  await page.controller.enter(context);
  assert.equal(page.get('notices-dialog').open,true);assert.equal(page.get('notice-title').textContent,'Actividad extra');
  assert.equal((await page.get('notices-dialog').fire('cancel')).defaultPrevented,true);
  assert.equal(calls.length,1);assert.equal(page.get('notice-close').hidden,true);
  await page.get('notice-close').fire('click');assert.equal(page.get('notices-dialog').open,true);
  await page.get('notice-confirm').fire('click');await page.get('notice-confirm').fire('click');
  assert.equal(calls.length,2);assert.equal(page.get('notice-confirm').disabled,true);assert.equal(page.get('notices-dialog').open,true);
  wait.resolve({confirmedAt:'2026-10-31T20:00:00Z'});await settle();
  assert.equal(page.get('notices-dialog').open,false);assert.equal(page.get('notices-count').hidden,true);
});

test('varios avisos se confirman uno por uno y HTML se presenta como texto',async()=>{
  const calls=[];const rows=[notice('n1',{title:'<img src=x onerror=alert(1)>',body:'<script>prueba</script>\nMensaje completo.'}),notice('n2')];
  const page=student(async(name,args)=>{calls.push({name,args});return name==='student_course_notices'?rows:{confirmedAt:'2026-10-31T20:00:00Z'};});
  await page.controller.enter(context);assert.equal(page.get('notice-title').textContent,rows[0].title);assert.equal(page.get('notice-content').textContent,rows[0].body);
  await page.get('notice-confirm').fire('click');await settle();
  assert.equal(page.get('notices-dialog').open,true);assert.equal(page.get('notice-title').textContent,'Actividad extra');
  await page.get('notice-confirm').fire('click');await settle();
  assert.deepEqual(calls.filter(c=>c.name==='student_confirm_course_notice').map(c=>c.args.p_notice_id),['n1','n2']);
  assert.equal(page.get('notices-dialog').open,false);
});

test('un fallo al guardar no cierra el aviso ni lo convierte en leído',async()=>{
  let fail=true;
  const page=student(async name=>{if(name==='student_course_notices')return [notice()];if(fail)throw Error('offline');return {confirmedAt:'2026-10-31T20:00:00Z'};});
  await page.controller.enter(context);await page.get('notice-confirm').fire('click');await settle();
  assert.equal(page.get('notices-dialog').open,true);assert.equal(page.get('notice-error').hidden,false);assert.equal(page.get('notice-confirm').disabled,false);
  fail=false;await page.get('notice-confirm').fire('click');await settle();assert.equal(page.get('notices-dialog').open,false);
});

test('la comprobación inicial fallida permite reintentar sin saltar los avisos',async()=>{
  let fail=true;const page=student(async()=>{if(fail)throw Error('offline');return [];});
  await page.controller.enter(context);assert.equal(page.get('notices-dialog').open,true);assert.equal(page.get('notice-retry').hidden,false);
  assert.equal((await page.get('notices-dialog').fire('cancel')).defaultPrevented,true);
  fail=false;await page.get('notice-retry').fire('click');await settle();assert.equal(page.get('notices-dialog').open,false);
});

test('no tener avisos y revisar los confirmados nunca envía una confirmación nueva',async()=>{
  const calls=[];const page=student(async name=>{calls.push(name);return [];});await page.controller.enter(context);
  assert.equal(page.get('notices-dialog').open,false);page.controller.open();await settle();
  assert.match(page.get('notice-content').textContent,/todavía no/);assert.equal(page.get('notice-close').hidden,false);
  await page.get('notice-close').fire('click');assert.equal(page.get('notices-dialog').open,false);assert.ok(calls.every(name=>name==='student_course_notices'));
});

test('la lectura guardada en el perfil se conserva en otra instancia o dispositivo',async()=>{
  let confirmedAt=null;
  const server=async name=>name==='student_course_notices'?[notice('n1',{confirmedAt})]:{confirmedAt:confirmedAt='2026-10-31T20:00:00Z'};
  const first=student(server);await first.controller.enter(context);await first.get('notice-confirm').fire('click');await settle();
  const second=student(server);await second.controller.enter(context);assert.equal(second.get('notices-dialog').open,false);
  second.controller.open();await settle();assert.match(second.get('notice-content').textContent,/Lectura confirmada/);
  assert.equal(second.get('notice-confirm').hidden,true);
});

test('un aviso retirado durante la lectura se cierra sin registrar una lectura falsa',async()=>{
  const page=student(async name=>name==='student_course_notices'?[notice()]:{retired:true});
  await page.controller.enter(context);await page.get('notice-confirm').fire('click');await settle();assert.equal(page.get('notices-dialog').open,false);
});

test('una respuesta de sondeo anterior a Entendido no vuelve a abrir el aviso confirmado',async()=>{
  const slow=deferred();let loads=0;
  const page=student(async name=>name==='student_course_notices'?(++loads===1?[notice()]:slow.promise):{confirmedAt:'2026-10-31T20:00:00Z'});
  await page.controller.enter(context);const refresh=page.controller.refresh();await page.get('notice-confirm').fire('click');await settle();
  slow.resolve([notice()]);await refresh;assert.equal(page.get('notices-dialog').open,false);
});

test('salir o cambiar de materia descarta respuestas y confirmaciones antiguas',async()=>{
  const slow=deferred();const page=student(async()=>slow.promise);const entry=page.controller.enter(context);
  page.controller.reset();slow.resolve([notice()]);await entry;assert.equal(page.get('notices-dialog').open,false);assert.equal(page.get('notices-button').hidden,true);
  const ack=deferred();let course='c1';const next=student(async(name,args)=>name==='student_course_notices'?(args.p_course_id==='c1'?[notice()]:[]):ack.promise);
  await next.controller.enter(context);await next.get('notice-confirm').fire('click');await next.controller.enter({...context,courseId:course='c2'});
  ack.resolve({confirmedAt:'2026-10-31T20:00:00Z'});await settle();assert.equal(next.get('notices-dialog').open,false);assert.equal(course,'c2');
});

test('un aviso recibido durante otra ventana espera y conserva la notificación pendiente',async()=>{
  let rows=[];const page=student(async()=>rows);await page.controller.enter(context);
  page.root.get('other-dialog').open=true;rows=[notice()];await page.controller.refresh();
  assert.equal(page.get('notices-dialog').open,false);assert.equal(page.get('notices-count').textContent,'1');
  page.root.get('other-dialog').open=false;await page.controller.refresh();assert.equal(page.get('notices-dialog').open,true);
});

test('el docente publica al destino elegido y reintenta el mismo borrador sin duplicarlo',async()=>{
  const calls=[];let fail=true;
  const page=teacher(async(name,args)=>{calls.push({name,args});if(name==='teacher_course_notices')return [];if(fail)throw Error('Sin conexión');return args.p_notice_id;});
  page.get('teacher-notice-title').value='Actividad extra';page.get('teacher-notice-body').value='Revisa Educativa.';page.get('teacher-notice-target').value='g1';
  await page.get('teacher-notice-form').fire('submit');assert.match(page.get('teacher-notice-error').textContent,/Sin conexión/);
  fail=false;await page.get('teacher-notice-form').fire('submit');
  const posts=calls.filter(c=>c.name==='teacher_publish_course_notice');assert.equal(posts.length,2);assert.equal(posts[0].args.p_notice_id,posts[1].args.p_notice_id);
  assert.equal(posts[1].args.p_topic_id,'g1');assert.match(page.get('teacher-notice-status').textContent,/Aviso publicado/);assert.equal(page.get('teacher-notice-title').value,'');
});

test('doble publicación en curso, campos vacíos y materias inactivas no crean avisos',async()=>{
  const wait=deferred(),calls=[];const page=teacher(async(name,args)=>{calls.push({name,args});return name==='teacher_course_notices'?[]:wait.promise;});
  await page.get('teacher-notice-form').fire('submit');assert.equal(calls.length,0);
  page.get('teacher-notice-title').value='Aviso';page.get('teacher-notice-body').value='Mensaje';const first=page.get('teacher-notice-form').fire('submit');
  await page.get('teacher-notice-form').fire('submit');assert.equal(calls.length,1);assert.equal(page.get('publish-course-notice').disabled,true);
  wait.resolve('id');await first;page.controller.setCourse({id:'inactive',name:'Materia inactiva',active:false},[]);
  page.get('teacher-notice-title').value='Otro';page.get('teacher-notice-body').value='Mensaje';await page.get('teacher-notice-form').fire('submit');
  assert.equal(calls.filter(c=>c.name==='teacher_publish_course_notice').length,1);
});

test('el docente consulta confirmaciones y retira solo después de confirmar esa acción',async()=>{
  const calls=[];let retired=false;
  const page=teacher(async(name,args)=>{calls.push({name,args});if(name==='teacher_course_notices')return [notice('n1',{recipientCount:2,confirmedCount:1,pendingCount:1,retiredAt:retired?'2026-10-31T20:00:00Z':null})];
    if(name==='teacher_course_notice_readers')return [{id:'s1',name:'Ana Prueba',confirmedAt:'2026-10-31T20:00:00Z'},{id:'s2',name:'Luis Prueba',confirmedAt:null}];if(name==='teacher_retire_course_notice')retired=true;});
  page.controller.open();await settle();let article=page.get('teacher-notice-list').children[0];assert.match(article.textContent,/1 de 2 confirmaron · 1 pendiente/);
  const details=article.children[4];details.open=true;await details.fire('toggle');await settle();assert.match(details.textContent,/Ana Prueba/);assert.match(details.textContent,/Pendiente/);
  const actions=article.children[5];await actions.children[0].fire('click');assert.equal(calls.some(c=>c.name==='teacher_retire_course_notice'),false);
  await actions.children[1].children[1].fire('click');assert.equal(retired,true);assert.match(page.get('teacher-notice-list').textContent,/Retirado/);
});

test('una publicación antigua no restaura el contenido al salir del panel o cambiar de materia',async()=>{
  const slow=deferred();const page=teacher(async()=>slow.promise);
  page.get('teacher-notice-title').value='Aviso';page.get('teacher-notice-body').value='Mensaje';const post=page.get('teacher-notice-form').fire('submit');
  page.controller.reset();slow.resolve('id');await post;assert.equal(page.get('teacher-notice-status').textContent,'');assert.equal(page.get('teacher-notice-list').children.length,0);
});

test('seleccionar varias materias envía el mismo texto una sola vez al RPC atómico',async()=>{
  const calls=[];const page=teacher(async(name,args)=>{calls.push({name,args});return name==='teacher_course_notices'?[]:[];});
  page.controller.setCourses([{id:'c1',name:'Materia actual'},{id:'c2',name:'Informática II'},{id:'c3',name:'Taller de Informática'},{id:'disabled',name:'Inactiva',active:false}]);
  const choices=page.get('teacher-notice-courses').children;assert.equal(choices.length,2);
  for(const label of choices){label.children[0].checked=true;await label.children[0].fire('change');}
  assert.equal(page.get('publish-course-notice').textContent,'Publicar en 3 materias');assert.match(page.get('teacher-notice-destinations').textContent,/Informática II/);
  page.get('teacher-notice-title').value='Actividad extra';page.get('teacher-notice-body').value='Revisa Educativa.';
  await page.get('teacher-notice-form').fire('submit');
  const posts=calls.filter(c=>c.name==='teacher_publish_notice_to_courses');assert.equal(posts.length,1);
  assert.deepEqual(posts[0].args.p_course_ids,['c1','c2','c3']);assert.equal(posts[0].args.p_title,'Actividad extra');
  assert.equal(calls.some(c=>c.name==='teacher_publish_course_notice'),false);assert.match(page.get('teacher-notice-status').textContent,/3 materias/);
  assert.equal(page.get('publish-course-notice').textContent,'Publicar aviso');assert.ok(choices.every(label=>!label.children[0].checked));
});
test('un reintento conserva el lote y cambiar a un equipo quita los otros destinos',async()=>{
  const calls=[];let fail=true;const page=teacher(async(name,args)=>{calls.push({name,args});if(name==='teacher_course_notices')return [];if(fail)throw Error('Conexión interrumpida');return [];});
  page.controller.setCourses([{id:'c1',name:'Actual'},{id:'c2',name:'Otra'}]);
  const box=page.get('teacher-notice-courses').children[0].children[0];box.checked=true;await box.fire('change');
  page.get('teacher-notice-title').value='Actividad extra';page.get('teacher-notice-body').value='Mensaje';
  await page.get('teacher-notice-form').fire('submit');fail=false;await page.get('teacher-notice-form').fire('submit');
  const posts=calls.filter(c=>c.name==='teacher_publish_notice_to_courses');assert.equal(posts[0].args.p_batch_id,posts[1].args.p_batch_id);
  box.checked=true;await box.fire('change');page.get('teacher-notice-target').value='g1';await page.get('teacher-notice-target').fire('change');
  assert.equal(box.checked,false);assert.equal(box.disabled,true);assert.equal(page.get('publish-course-notice').textContent,'Publicar aviso');
  page.get('teacher-notice-title').value='Solo equipo';page.get('teacher-notice-body').value='Mensaje';await page.get('teacher-notice-form').fire('submit');
  assert.equal(calls.at(-2).name,'teacher_publish_course_notice');assert.equal(calls.at(-2).args.p_topic_id,'g1');
});
test('cerrar sesión borra el catálogo de otras materias de la vista de avisos',()=>{
  const page=teacher(async()=>[]);page.controller.setCourses([{id:'c1',name:'Actual'},{id:'c2',name:'Materia anterior'}]);
  assert.match(page.get('teacher-notice-courses').textContent,/Materia anterior/);page.controller.reset();
  page.controller.setCourse({id:'other-account',name:'Otra cuenta',active:true},[]);
  assert.equal(page.get('teacher-notice-multi').hidden,true);assert.equal(page.get('teacher-notice-courses').textContent,'');
});
