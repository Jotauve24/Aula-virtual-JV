import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeacherGradeScheme } from '../assets/teacher-grade-scheme.js';
import { createStudentGradeCalculator } from '../assets/grade-calculator.js';

class Element {
  constructor(root, tag) { Object.assign(this,{root,tag,children:[],attributes:{},listeners:new Map(),dataset:{},value:'',text:'',hidden:false,disabled:false}); }
  set textContent(value) { this.text=String(value);this.children=[]; }
  get textContent() { return this.text+this.children.map(child=>child.textContent).join(''); }
  append(...nodes) { for(const node of nodes){node.parent=this;this.children.push(node);} }
  replaceChildren(...nodes) { this.text='';this.children=[];this.append(...nodes); }
  remove() { this.parent.children=this.parent.children.filter(child=>child!==this); }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  getAttribute(key) { return this.attributes[key]??null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name,handler) { this.listeners.set(name,handler); }
  dispatch(name) { return this.listeners.get(name)?.(); }
  click() { if(!this.disabled)return this.dispatch('click'); }
  focus() { this.root.activeElement=this; }
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
