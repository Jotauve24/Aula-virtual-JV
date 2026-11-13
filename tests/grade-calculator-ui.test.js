import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeacherGradeScheme } from '../assets/teacher-grade-scheme.js';
import { createStudentGradeCalculator } from '../assets/grade-calculator.js';
import { calculateGrades } from '../assets/grade-calculator-model.js';
import { createTeacherGradePreview } from '../assets/teacher-grade-preview.js';

class Element {
  constructor(root, tag) { Object.assign(this,{root,tag,children:[],attributes:{},listeners:new Map(),dataset:{},style:{},value:'',text:'',hidden:false,disabled:false}); }
  set textContent(value) { this.text=String(value);this.children=[]; }
  get textContent() { return this.text+this.children.map(child=>child.textContent).join(''); }
  append(...nodes) { for(const node of nodes){node.parent=this;this.children.push(node);} }
  replaceChildren(...nodes) { this.text='';this.children=[];this.append(...nodes); }
  remove() { this.parent.children=this.parent.children.filter(child=>child!==this); }
  insertBefore(node,before) {
    if(node===before)return;
    if(node.parent)node.remove();
    const index=before===null?this.children.length:this.children.indexOf(before);
    assert.ok(index>=0);node.parent=this;this.children.splice(index,0,node);
  }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  getAttribute(key) { return this.attributes[key]??null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name,handler) { this.listeners.set(name,handler); }
  dispatch(name) { return this.listeners.get(name)?.(); }
  click() { if(!this.disabled)return this.dispatch('click'); }
  focus() { this.root.activeElement=this;this.dispatch('focus'); }
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function dom() {
  const root={createElement:tag=>new Element(root,tag),activeElement:null};
  const host=new Element(root,'div'),events=new Map();
  const win={confirm:()=>true,addEventListener:(name,handler)=>events.set(name,handler)};
  return {root,host,win,events,get:id=>descendants(host).find(node=>node.id===id),
    button:text=>descendants(host).find(node=>node.tag==='button'&&node.textContent===text)};
}
const scheme={activities:[{id:'a',name:'Proyecto',weight:40},{id:'b',name:'Examen',weight:60}],referenceGrade:71,revision:1};

test('zombie view uses the student calculator, local save labels and restart without any student RPC',async()=>{
  const page=dom(),calls=[];
  const controller=createTeacherGradePreview({...page,signedIn:()=>true,avatar:()=>'<svg data-zombie></svg>',rpc:async(name,body)=>{
    calls.push({name,body});return structuredClone(scheme);
  }});
  controller.setContext('c1');assert.equal(calls.length,0);controller.open();await settle();
  assert.match(page.host.textContent,/Porcentajes publicados de esta materia/);assert.match(page.host.textContent,/Demostración docente/);
  assert.equal(page.get('grade-progress-avatar').innerHTML,'<svg data-zombie></svg>');
  page.get('grade-a').value='0';page.get('grade-a').dispatch('input');
  page.get('grade-trial-grade').value='80';page.get('grade-trial-grade').dispatch('input');page.get('grade-trial-apply').click();
  assert.equal(page.get('grade-a').value,'0');assert.equal(page.get('grade-b').value,'80');
  page.button('Guardar prueba').click();await settle();assert.match(page.host.textContent,/Prueba guardada solo en esta demostración/);
  page.get('grade-b').value='50';page.get('grade-b').dispatch('input');page.button('Recargar prueba guardada').click();await settle();
  assert.equal(page.get('grade-b').value,80);
  controller.reset();controller.open();await settle();assert.equal(page.get('grade-a').value,'');assert.equal(page.get('grade-b').value,'');
  assert.ok(calls.every(call=>call.name==='teacher_grade_scheme'));
});

test('zombie preview distinguishes a missing configuration, a failed read and a late former room',async()=>{
  const page=dom();let source=null;
  const controller=createTeacherGradePreview({...page,signedIn:()=>true,rpc:async()=>{if(source instanceof Error)throw source;return source;}});
  controller.setContext('c1');controller.open();await settle();assert.match(page.host.textContent,/plantilla de ejemplo/);
  assert.ok(page.get('grade-u1'));assert.equal(page.get('grade-u1').value,'');
  controller.setContext('c2');source=Error('Sin conexión');controller.open();await settle();
  assert.match(page.host.textContent,/Sin conexión/);assert.doesNotMatch(page.host.textContent,/plantilla de ejemplo/);
  assert.equal(page.get('grade-u1'),undefined);source=structuredClone(scheme);page.button('Reintentar').click();await settle();
  assert.ok(page.get('grade-a'));assert.match(page.host.textContent,/Porcentajes publicados/);
});

test('a valid activity ID matching an object property remains blank until the trial is applied',async()=>{
  const page=dom();const sample={activities:[{id:'constructor',name:'Proyecto',weight:100}],referenceGrade:71,revision:1};
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>({scheme:sample,draft:null})});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  assert.equal(page.get('grade-constructor').value,'');assert.equal(page.get('grade-constructor').getAttribute('aria-invalid'),null);
  assert.equal(page.get('grade-progress-value').textContent,'0');assert.equal(page.get('grade-trial-final').textContent,'71');
  page.get('grade-trial-apply').click();assert.equal(page.get('grade-constructor').value,'71');assert.equal(page.root.activeElement,page.get('grade-constructor'));
});

test('a live what-if stays separate until applied and only an explicit save sends its grades',async()=>{
  const page=dom(),calls=[];
  const sample={activities:[{id:'done',name:'Actividades con nota',weight:75},{id:'unit',name:'Unidad VI',weight:20},{id:'forum',name:'Foro VI',weight:5}],referenceGrade:71,revision:1};
  const controller=createStudentGradeCalculator({...page,avatar:()=>'<svg></svg>',signedIn:()=>true,rpc:async(name,body)=>{
    calls.push({name,body});return name==='student_grade_calculator'?{scheme:sample,draft:{grades:{done:66},goal:71,revision:1,schemeRevision:1}}:{revision:2};
  }});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  const editTrial=value=>{page.get('grade-trial-grade').value=value;page.get('grade-trial-grade').dispatch('input');};
  editTrial('80');assert.equal(page.get('grade-trial-final').textContent,'69.5');assert.match(page.get('grade-trial-outcome').textContent,/faltarían 1.5/);
  assert.equal(page.get('grade-progress-value').textContent,'49.5');assert.equal(page.get('grade-unit').value,'');assert.equal(controller.hasUnsaved(),false);
  page.get('grade-trial-range').value='0';page.get('grade-trial-range').dispatch('input');assert.equal(page.get('grade-trial-final').textContent,'49.5');
  page.button('Probar el mínimo necesario').click();assert.equal(page.get('grade-trial-final').textContent,'71');assert.equal(calls.length,1);
  page.get('grade-trial-apply').click();assert.equal(String(page.get('grade-unit').value),'86');assert.equal(String(page.get('grade-forum').value),'86');
  assert.equal(page.get('grade-done').value,66);assert.equal(page.get('grade-progress-value').textContent,'71');assert.equal(page.get('grade-trial-empty').hidden,false);
  assert.equal(page.get('grade-trial-apply').disabled,true);assert.equal(page.get('grade-trial-body').hidden,true);
  assert.equal(page.get('grade-progress-avatar').dataset.celebrate,'true');assert.equal(controller.hasUnsaved(),true);assert.equal(calls.length,1);
  page.button('Guardar simulación').click();await settle();assert.deepEqual(calls[1].body.p_grades,{done:66,unit:86,forum:86});assert.equal(calls[1].body.p_goal,71);
});
test('a bad trial cannot change the actual result and a base edit recalculates the same trial',async()=>{
  const page=dom();
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>({scheme:structuredClone(scheme),draft:{grades:{a:50},goal:71,revision:1,schemeRevision:1}})});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  page.get('grade-trial-grade').value='101';page.get('grade-trial-grade').dispatch('input');
  assert.equal(page.get('grade-trial-apply').disabled,true);assert.equal(page.get('grade-trial-meter').hidden,true);
  assert.equal(page.get('grade-progress-value').textContent,'20');assert.equal(controller.hasUnsaved(),false);
  page.get('grade-trial-grade').value='80';page.get('grade-trial-grade').dispatch('input');assert.equal(page.get('grade-trial-final').textContent,'68');
  page.get('grade-a').value='60';page.get('grade-a').dispatch('input');assert.equal(page.get('grade-trial-final').textContent,'72');
  assert.equal(page.get('grade-b').value,'');
  page.get('grade-a').value='101';page.get('grade-a').dispatch('input');assert.equal(page.get('grade-trial-range').disabled,true);assert.equal(page.get('grade-trial-meter').hidden,true);
  controller.reset();assert.equal(page.get('grade-trial-grade'),undefined);
});
test('selecting a grade explains its exact weighted contribution and an avatar refresh preserves edits',async()=>{
  const page=dom();let look='<svg id="first"></svg>',calls=0;
  const controller=createStudentGradeCalculator({...page,avatar:()=>look,signedIn:()=>true,rpc:async()=>{calls++;return {scheme:structuredClone(scheme),draft:null};}});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  page.get('grade-a').focus();page.get('grade-a').value='0';page.get('grade-a').dispatch('input');
  assert.equal(page.get('grade-contribution-a').hidden,false);assert.match(page.get('grade-contribution-a').textContent,/Aporta 0 puntos/);
  page.get('grade-a').value='80,25';page.get('grade-a').dispatch('input');assert.match(page.get('grade-contribution-a').textContent,/32.1 puntos/);
  page.get('grade-b').focus();assert.equal(page.get('grade-contribution-a').hidden,true);assert.match(page.get('grade-contribution-b').textContent,/Pendiente/);
  look='<svg id="second"></svg>';controller.open();assert.equal(page.get('grade-progress-avatar').innerHTML,look);
  assert.equal(page.get('grade-a').value,'80,25');assert.equal(calls,1);assert.equal(controller.hasUnsaved(),true);
});

test('teacher settings stay lazy, reject a 101-percent total, and publish canonical rows',async()=>{
  const page=dom(),calls=[];
  const controller=createTeacherGradeScheme({...page,signedIn:()=>true,rpc:async(name,body)=>{calls.push({name,body});return structuredClone(scheme);}});
  controller.setContext('c1');assert.equal(calls.length,0);
  page.host.open=true;page.host.dispatch('toggle');await settle();
  page.get('scheme-weight-a').value='41';page.get('scheme-weight-a').dispatch('input');page.button('Guardar cambios').click();await settle();
  assert.equal(calls.length,1);assert.match(page.host.textContent,/suman 101/);assert.equal(page.root.activeElement,page.get('scheme-weight-a'));
  page.get('scheme-weight-a').value='40';page.get('scheme-weight-a').dispatch('input');page.button('Guardar cambios').click();await settle();
  assert.deepEqual(calls[1].body,{p_course_id:'c1',p_activities:scheme.activities,p_reference_grade:71,p_expected_revision:1});
  assert.match(page.host.textContent,/Ya está disponible/);assert.equal(controller.hasUnsaved(),false);
});
test('teacher empty state is an unpublished suggestion; conflicts preserve edits until reload',async()=>{
  const page=dom();let saves=0;
  const controller=createTeacherGradeScheme({...page,signedIn:()=>true,rpc:async name=>{
    if(name==='teacher_grade_scheme')return null;saves++;throw Object.assign(Error('Cambió la configuración'),{code:'PT409'});
  }});
  controller.setContext('c1');page.host.open=true;page.host.dispatch('toggle');await settle();
  assert.match(page.host.textContent,/Plantilla sugerida/);assert.equal(saves,0);
  page.get('scheme-name-u1').value='Mi actividad';page.get('scheme-name-u1').dispatch('input');
  page.button('Activar calculadora').click();await settle();
  assert.equal(page.get('scheme-name-u1').value,'Mi actividad');assert.equal(page.button('Activar calculadora').disabled,true);
  assert.equal(controller.hasUnsaved(),true);page.button('Recargar configuración').click();await settle();
  assert.equal(controller.hasUnsaved(),false);assert.equal(page.button('Activar calculadora').disabled,false);
});
test('a former teacher load cannot populate a newly selected course',async()=>{
  const page=dom();let resolve;const pending=new Promise(done=>resolve=done);
  const controller=createTeacherGradeScheme({...page,signedIn:()=>true,rpc:()=>pending});
  controller.setContext('c1');page.host.open=true;page.host.dispatch('toggle');controller.setContext('c2');
  resolve(scheme);await settle();assert.equal(page.get('scheme-weight-a'),undefined);assert.equal(page.host.open,false);
});
test('student UI treats zero as completed, preserves focus, and blocks invalid saves',async()=>{
  const page=dom(),calls=[];
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async(name,body)=>{calls.push({name,body});return name==='student_grade_calculator'?{scheme:structuredClone(scheme),draft:null}:{revision:1};}});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  const input=page.get('grade-a');input.focus();input.value='0';input.dispatch('input');
  assert.match(page.host.textContent,/La meta supera el máximo/);assert.equal(page.root.activeElement,input);
  input.value='101';input.dispatch('input');page.button('Guardar simulación').click();await settle();
  assert.equal(calls.length,1);assert.equal(input.getAttribute('aria-invalid'),'true');
  input.value='80';input.dispatch('input');page.button('Guardar simulación').click();await settle();
  assert.deepEqual(calls[1].body.p_grades,{a:80});assert.match(page.host.textContent,/Simulación guardada/);
  controller.reset();assert.equal(page.host.textContent,'');assert.equal(controller.hasUnsaved(),false);
});
test('failed first load remains retryable after a course context is replaced',async()=>{
  const page=dom();let fail=false;
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>{if(fail)throw Error('Sin conexión');return {scheme:structuredClone(scheme),draft:null};}});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  controller.setContext({courseId:'c2'});fail=true;controller.open();await settle();
  assert.match(page.host.textContent,/Sin conexión/);assert.ok(page.button('Reintentar'));
  fail=false;page.button('Reintentar').click();await settle();assert.ok(page.get('grade-a'));
});
test('live progress distinguishes an empty grade from zero and keeps the same meter while editing',async()=>{
  const page=dom();
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>({scheme:structuredClone(scheme),draft:null})});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  const meter=page.get('grade-progress-track'),progress=page.get('grade-progress');
  assert.equal(meter.getAttribute('aria-valuenow'),'0');assert.match(progress.textContent,/0 de 2 actividades con nota/);
  assert.match(progress.textContent,/Empieza aquí/);
  page.get('grade-goal').value='0';page.get('grade-goal').dispatch('input');assert.match(progress.textContent,/Meta alcanzada/);
  page.get('grade-goal').value='71';page.get('grade-goal').dispatch('input');assert.match(progress.textContent,/Empieza aquí/);
  const field=page.get('grade-a');field.focus();field.value='0';field.dispatch('input');
  assert.equal(page.get('grade-progress-track'),meter);assert.equal(page.root.activeElement,field);
  assert.equal(meter.getAttribute('aria-valuenow'),'0');assert.match(progress.textContent,/1 de 2 actividades con nota/);
  assert.match(progress.textContent,/Meta por revisar/);
  field.value='80';field.dispatch('input');
  assert.equal(meter.getAttribute('aria-valuenow'),'32');assert.match(meter.getAttribute('aria-valuetext'),/32 puntos de 100. Tu meta es 71/);
  page.get('grade-b').value='100';page.get('grade-b').dispatch('input');
  assert.equal(meter.getAttribute('aria-valuenow'),'92');assert.match(progress.textContent,/Meta alcanzada/);
  assert.match(progress.textContent,/2 de 2 actividades con nota/);
});
test('invalid input hides numeric progress until corrected and targets at both scale ends stay exact',async()=>{
  const page=dom();
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>({scheme:structuredClone(scheme),draft:{grades:{a:100},goal:100,revision:1,schemeRevision:1}})});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  const meter=page.get('grade-progress-track'),marker=page.get('grade-goal-marker'),field=page.get('grade-a'),goal=page.get('grade-goal');
  assert.equal(meter.getAttribute('aria-valuenow'),'40');assert.match(meter.getAttribute('aria-valuetext'),/Tu meta es 100/);
  field.value='101';field.dispatch('input');
  assert.equal(meter.hidden,true);assert.equal(marker.hidden,true);assert.equal(meter.getAttribute('aria-valuenow'),null);
  assert.equal(page.get('grade-progress-value').textContent,'—');assert.match(page.get('grade-progress').textContent,/Revisa los datos/);
  field.value='100';field.dispatch('input');goal.value='0';goal.dispatch('input');
  assert.equal(meter.hidden,false);assert.equal(marker.hidden,false);assert.equal(meter.getAttribute('aria-valuenow'),'40');
  assert.match(meter.getAttribute('aria-valuetext'),/Tu meta es 0/);assert.match(page.get('grade-progress').textContent,/Meta alcanzada/);
  goal.value='101';goal.dispatch('input');assert.equal(meter.getAttribute('aria-valuenow'),null);
  goal.value='100';goal.dispatch('input');page.get('grade-b').value='100';page.get('grade-b').dispatch('input');
  assert.equal(meter.getAttribute('aria-valuenow'),'100');assert.match(page.get('grade-progress').textContent,/Meta alcanzada/);
});
test('the result distinguishes missing final points from the score needed in each pending activity',async()=>{
  const page=dom();
  const sample={activities:[{id:'done',name:'Actividades con nota',weight:70},{id:'foro5',name:'Foro Unidad V',weight:5},{id:'u6',name:'Unidad VI',weight:20},{id:'foro6',name:'Foro Unidad VI',weight:5}],referenceGrade:71,revision:1};
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>({scheme:sample,draft:{grades:{done:100},goal:71,revision:1,schemeRevision:1}})});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  const result=page.get('grade-results').textContent;
  assert.match(result,/Ya acumulas 70 puntos de la nota final/);assert.match(result,/Te falta 1 punto para alcanzar 71/);
  assert.match(result,/Necesitas al menos 3.34 sobre 100 en cada una de las 3 actividades pendientes/);
  assert.doesNotMatch(result,/Peso|promedio ponderado|escenarios independientes/);
  const pending=descendants(page.get('grade-results')).find(node=>node.tag==='details');
  assert.equal(pending.open,false);pending.open=true;pending.dispatch('toggle');
  page.get('grade-u6').value='3';page.get('grade-u6').dispatch('input');
  assert.equal(descendants(page.get('grade-results')).find(node=>node.tag==='details').open,true);
  page.get('grade-u6').value='10';page.get('grade-u6').dispatch('input');
  assert.match(page.get('grade-results').textContent,/Ya alcanzas tu meta/);
});

test('pending activities link back to their fields without changing a grade or saving, even after the goal is covered',async()=>{
  const page=dom();let calls=0;
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>{calls++;return {scheme:structuredClone(scheme),draft:{grades:{a:100},goal:30,revision:1,schemeRevision:1}};}});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  const jump=descendants(page.host).find(node=>node.tag==='button'&&node.getAttribute('aria-label')==='Escribir nota de Examen');
  assert.ok(jump);jump.click();assert.equal(page.root.activeElement,page.get('grade-b'));
  assert.equal(page.get('grade-b').value,'');assert.equal(page.get('grade-a').value,100);assert.equal(calls,1);
  assert.equal(controller.hasUnsaved(),false);assert.match(page.get('grade-results').textContent,/Ya alcanzas tu meta/);
  page.get('grade-b').value='0';page.get('grade-b').dispatch('input');
  assert.equal(descendants(page.host).some(node=>node.tag==='button'&&node.getAttribute('aria-label')==='Escribir nota de Examen'),false);
  assert.match(page.get('grade-progress').textContent,/2 de 2 actividades con nota/);
});
test('a complete result explains the difference from the goal and no longer offers a hypothetical maximum',async()=>{
  const page=dom();const sample={activities:[{id:'a',name:'Unidad I',weight:5},{id:'b',name:'Resto de actividades',weight:95}],referenceGrade:71,revision:1};
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>({scheme:sample,draft:{grades:{a:10,b:80},goal:71,revision:1,schemeRevision:1}})});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  assert.equal(page.get('grade-progress-value').textContent,'76.5');assert.match(page.get('grade-progress').textContent,/Tu nota final estimada/);
  assert.match(page.get('grade-results').textContent,/Superas tu meta de 71 por 5.5 puntos/);
  assert.doesNotMatch(page.get('grade-results').textContent,/Si sacas 100 en lo pendiente|Necesitas al menos/);
  assert.match(page.get('grade-results').textContent,/10 × 5 ÷ 100 = 0.5 puntos/);
  page.get('grade-b').value='';page.get('grade-b').dispatch('input');
  assert.match(page.get('grade-results').textContent,/Si sacas 100 en lo pendiente95.5 \/ 100/);
  page.get('grade-b').value='0';page.get('grade-b').dispatch('input');
  assert.match(page.get('grade-results').textContent,/Te faltan 70.5 puntos/);assert.match(page.get('grade-results').textContent,/Ya ingresaste todas las notas/);
});
test('the result follows scrolling only when it fits and a former course observer cannot update the current pane',async()=>{
  const page=dom(),observers=[];page.win.innerHeight=900;
  page.win.ResizeObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(node){this.node=node;}disconnect(){this.disconnected=true;}};
  const controller=createStudentGradeCalculator({...page,signedIn:()=>true,rpc:async()=>({scheme:structuredClone(scheme),draft:null})});
  controller.setContext({courseId:'c1'});controller.open();await settle();
  const previous=observers[0];previous.callback([{borderBoxSize:[{blockSize:700}]}]);assert.equal(previous.node.dataset.sticky,'true');
  page.win.innerHeight=600;page.events.get('resize')();assert.equal(previous.node.dataset.sticky,'false');
  controller.setContext({courseId:'c2'});controller.open();await settle();assert.equal(previous.disconnected,true);
  previous.callback([{borderBoxSize:[{blockSize:100}]}]);assert.equal(observers[1].node.dataset.sticky,undefined);
  observers[1].callback([{borderBoxSize:[{blockSize:900}]}]);assert.equal(observers[1].node.dataset.sticky,'false');
});

test('moving activities preserves edited fields, saves their order and keeps student grades attached to their IDs',async()=>{
  const page=dom();let stored={activities:[{id:'u1',name:'Unidad I',weight:5},{id:'final',name:'Proyecto final',weight:90},{id:'foro',name:'Foro I',weight:5}],referenceGrade:71,revision:1};
  const grades={u1:0,final:90,foro:80};
  const before=calculateGrades(stored.activities,grades,71).earned;
  const findButton=name=>descendants(page.host).find(node=>node.tag==='button'&&node.getAttribute('aria-label')===name);
  const order=()=>descendants(page.host).filter(node=>node.tag==='input'&&node.id?.startsWith('scheme-name-')).map(node=>node.id);
  const controller=createTeacherGradeScheme({...page,signedIn:()=>true,rpc:async(name,body)=>{
    if(name==='teacher_save_grade_scheme')stored={activities:body.p_activities,referenceGrade:body.p_reference_grade,revision:stored.revision+1};
    return structuredClone(stored);
  }});
  controller.setContext('c1');page.host.open=true;page.host.dispatch('toggle');await settle();
  const name=page.get('scheme-name-foro'),weight=page.get('scheme-weight-foro');
  name.value='Foro I · Participación';name.dispatch('input');
  assert.equal(findButton('Subir Unidad I').disabled,true);assert.equal(findButton('Bajar Foro I · Participación').disabled,true);
  findButton('Subir Foro I · Participación').click();
  assert.deepEqual(order(),['scheme-name-u1','scheme-name-foro','scheme-name-final']);
  assert.equal(page.get('scheme-name-foro'),name);assert.equal(page.get('scheme-weight-foro'),weight);assert.equal(weight.value,5);
  assert.equal(controller.hasUnsaved(),true);assert.match(page.host.textContent,/posición 2 de 3/);
  findButton('Subir Foro I · Participación').click();assert.equal(findButton('Subir Foro I · Participación').disabled,true);assert.equal(page.root.activeElement,name);
  findButton('Bajar Foro I · Participación').click();page.button('Guardar cambios').click();await settle();
  assert.deepEqual(stored.activities.map(row=>row.id),['u1','foro','final']);assert.equal(calculateGrades(stored.activities,grades,71).earned,before);
  page.button('Recargar configuración').click();await settle();assert.deepEqual(order(),['scheme-name-u1','scheme-name-foro','scheme-name-final']);
  assert.equal(page.get('scheme-name-foro').value,'Foro I · Participación');
});

test('movement boundaries update after adding or removing rows and movement stays blocked while saving',async()=>{
  const page=dom();let finishSave;let pending;
  const findButton=name=>descendants(page.host).find(node=>node.tag==='button'&&node.getAttribute('aria-label')===name);
  const controller=createTeacherGradeScheme({...page,signedIn:()=>true,rpc:name=>name==='teacher_grade_scheme'?structuredClone(scheme):(pending=new Promise(resolve=>{finishSave=resolve;}))});
  controller.setContext('c1');page.host.open=true;page.host.dispatch('toggle');await settle();
  findButton('Quitar Examen').click();assert.equal(findButton('Subir Proyecto').disabled,true);assert.equal(findButton('Bajar Proyecto').disabled,true);
  page.button('Añadir actividad').click();assert.equal(findButton('Bajar Proyecto').disabled,false);assert.equal(findButton('Subir actividad').disabled,false);
  findButton('Quitar actividad').click();page.get('scheme-weight-a').value='100';page.get('scheme-weight-a').dispatch('input');
  page.button('Guardar cambios').click();assert.equal(findButton('Subir Proyecto').disabled,true);assert.equal(findButton('Bajar Proyecto').disabled,true);assert.equal(findButton('Quitar Proyecto').disabled,true);
  finishSave({...scheme,revision:2});await pending;await settle();assert.equal(findButton('Quitar Proyecto').disabled,false);
});
