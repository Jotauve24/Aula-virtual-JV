import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRecentCourses, RECENT_COURSES_KEY} from '../assets/recent-courses.js';
import {normalizeCode} from '../assets/model.js';

const FIRST='MAT-AAAAA-BBBBB-CCCCC',SECOND='MAT-DDDDD-EEEEE-FFFFF',LAST='aula-student-course-code';
function storage(initial={}) {
 const values=new Map(Object.entries(initial));
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
test('los códigos recientes se normalizan, no se duplican y conservan el nombre confirmado al reutilizarlos',()=>{
 const saved=storage({[LAST]:FIRST}),recent=createRecentCourses(saved);
 assert.equal(recent.list()[0].code,FIRST);
 recent.remember(SECOND,'  Informática   II  ');recent.remember(FIRST,'Sistemas I');recent.remember(' mat-ddddd-eeeee-fffff ');
 assert.deepEqual(recent.list(),[{code:SECOND,name:'Informática II'},{code:FIRST,name:'Sistemas I'}]);
 assert.deepEqual(createRecentCourses(saved).list(),recent.list());
});
test('el historial mantiene los últimos cinco códigos y no incorpora valores inválidos ni datos adicionales',()=>{
 const saved=storage(),recent=createRecentCourses(saved);
 for(const letter of ['A','B','C','D','E','F'])recent.remember('MAT-'+Array(3).fill(letter.repeat(5)).join('-'));
 recent.remember('javascript:alert(1)');recent.remember('MAT-INCOMPLETO');
 assert.equal(recent.list().length,5);assert.equal(recent.list()[0].code,'MAT-FFFFF-FFFFF-FFFFF');
 saved.setItem(RECENT_COURSES_KEY,JSON.stringify([{code:FIRST,name:'Materia',email:'no-guardar@example.invalid',token:'no-guardar'}]));
 recent.remember(FIRST);
 assert.deepEqual(Object.keys(JSON.parse(saved.getItem(RECENT_COURSES_KEY))[0]).sort(),['code','name']);
});
test('un historial corrupto o excesivo no bloquea el código anterior y olvidar lo elimina de ambas memorias',()=>{
 const saved=storage({[LAST]:FIRST,[RECENT_COURSES_KEY]:'{invalid'}),recent=createRecentCourses(saved);
 assert.equal(recent.list()[0].code,FIRST);
 saved.setItem(RECENT_COURSES_KEY,'x'.repeat(17000));assert.equal(recent.list()[0].code,FIRST);
 recent.remember(SECOND);recent.forget(FIRST);assert.equal(saved.getItem(LAST),null);
 assert.deepEqual(recent.list().map(row=>row.code),[SECOND]);
 recent.clear();assert.deepEqual(createRecentCourses(saved).list(),[]);
});
test('si el navegador bloquea el almacenamiento, los recientes funcionan en memoria sin interrumpir el ingreso',()=>{
 const recent=createRecentCourses({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}});
 assert.deepEqual(recent.list(),[]);recent.remember(FIRST,'Prueba');assert.equal(recent.list()[0].code,FIRST);
 recent.forget(FIRST);assert.deepEqual(recent.list(),[]);recent.remember(SECOND);recent.clear();assert.deepEqual(recent.list(),[]);
});

function home({initial={},blocked=false,available=true}={}) {
 const local=storage(initial),session=storage(),navigations=[],nodes=new Map();let doc;
 class Element {
  constructor(){this.value='';this.textContent='';this.children=[];this.handlers=new Map();this.hidden=false;this.attributes={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  querySelector(){return this.children[0]||new Element();}
  setAttribute(key,value){this.attributes[key]=String(value);}
  removeAttribute(key){delete this.attributes[key];}
  addEventListener(type,fn){this.handlers.set(type,fn);}
  dispatch(type,extra={}){return this.handlers.get(type)?.({target:this,preventDefault(){},...extra});}
  click(){return this.dispatch('click');}
  focus(){doc.activeElement=this;this.dispatch('focus');}
  showModal(){this.open=true;}
  close(){this.open=false;}
 }
 const get=key=>{if(!nodes.has(key))nodes.set(key,new Element());return nodes.get(key);};
 get('#code-hint').textContent='Puedes pegar el código completo, con sus guiones.';
 get('#recent-code-panel').hidden=true;
 get('#recent-code-panel').append(get('#recent-code-list'),get('#forget-recent-codes'));
 get('#course-form').append(...['#course-code','#recent-code-toggle','#recent-code-panel','#code-hint','#enter-course','#code-error'].map(get));
 doc={querySelector:get,querySelectorAll:()=>[],createElement:()=>new Element(),activeElement:null,handlers:new Map(),addEventListener(type,fn){this.handlers.set(type,fn);}};
 const historyStorage=blocked?{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}}:local;
 const source=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(source,{document:doc,window:{location:{assign:url=>navigations.push(url)}},sessionStorage:session,
  configured:available,normalizeCode,createRecentCourses:()=>createRecentCourses(historyStorage),mountEntranceTutorial(){},avatarSVG(){return '';}});
 return {get,local,session,doc,navigations,submit:()=>get('#course-form').dispatch('submit')};
}
test('la portada sin historial conserva el campo vacío y permite el ingreso manual',()=>{
 const page=home();assert.equal(page.get('#course-code').value,'');assert.equal(page.get('#enter-course').disabled,true);
 assert.equal(page.get('#recent-code-toggle').hidden,true);assert.deepEqual(page.navigations,[]);
 page.get('#course-code').value=FIRST;page.get('#course-code').dispatch('input');page.submit();
 assert.equal(page.session.getItem('aula-course-code'),FIRST);assert.deepEqual(page.navigations,['./live.html']);
});
test('el código anterior queda escrito y Entrar funciona directamente sin tocar el campo',()=>{
 const page=home({initial:{[LAST]:FIRST,'aula-student-session':'sesión ficticia'}});
 assert.equal(page.get('#course-code').value,FIRST);assert.equal(page.get('#enter-course').disabled,false);
 assert.equal(page.get('#recent-code-panel').hidden,true);page.submit();
 assert.equal(page.session.getItem('aula-course-code'),FIRST);
 assert.equal(page.local.getItem('aula-student-session'),'sesión ficticia');
});
test('tocar el campo permite escoger otra materia y envía ese código, respetando las sesiones existentes',()=>{
 const initial=storage({[LAST]:FIRST,'aula-student-session':'estudiante ficticio','aula-supabase-session':'docente ficticio'});
 const cache=createRecentCourses(initial);cache.remember(FIRST,'Sistemas I');cache.remember(SECOND,'Informática II');
 const page=home({initial:{[LAST]:FIRST,[RECENT_COURSES_KEY]:initial.getItem(RECENT_COURSES_KEY),'aula-student-session':'estudiante ficticio','aula-supabase-session':'docente ficticio'}});
 assert.equal(page.get('#course-code').value,SECOND);
 page.get('#course-code').focus();assert.equal(page.get('#recent-code-panel').hidden,false);
 page.get('#course-form').dispatch('focusout',{relatedTarget:null});assert.equal(page.get('#recent-code-panel').hidden,false);
 page.get('#recent-code-list').children[1].click();assert.equal(page.get('#course-code').value,FIRST);
 assert.equal(page.get('#recent-code-panel').hidden,true);assert.equal(page.doc.activeElement,page.get('#enter-course'));
 page.submit();assert.equal(page.session.getItem('aula-course-code'),FIRST);
 assert.equal(page.local.getItem('aula-student-session'),'estudiante ficticio');
 assert.equal(page.local.getItem('aula-supabase-session'),'docente ficticio');
});
test('un código inválido o una configuración no disponible no se añade ni inicia navegación',()=>{
 const invalid=home();invalid.get('#course-code').value='incorrecto';invalid.submit();
 assert.deepEqual(createRecentCourses(invalid.local).list(),[]);assert.deepEqual(invalid.navigations,[]);
 const unavailable=home({available:false});unavailable.get('#course-code').value=FIRST;unavailable.submit();
 assert.deepEqual(createRecentCourses(unavailable.local).list(),[]);assert.deepEqual(unavailable.navigations,[]);
});
test('el selector se cierra con Escape o fuera del formulario y permite olvidar códigos sin cerrar la sesión',()=>{
 const page=home({initial:{[LAST]:FIRST,'aula-student-session':'sesión ficticia'}});
 page.get('#course-code').focus();page.get('#course-form').dispatch('keydown',{key:'Escape'});assert.equal(page.get('#recent-code-panel').hidden,true);
 page.get('#course-code').click();page.doc.handlers.get('pointerdown')({target:{}});assert.equal(page.get('#recent-code-panel').hidden,true);
 page.get('#course-code').click();page.get('#forget-recent-codes').click();
 assert.equal(page.get('#course-code').value,'');assert.equal(page.get('#recent-code-toggle').hidden,true);
 assert.deepEqual(createRecentCourses(page.local).list(),[]);assert.equal(page.local.getItem('aula-student-session'),'sesión ficticia');
});
test('almacenamiento bloqueado en la portada no impide pegar un código y entrar',()=>{
 const page=home({blocked:true});page.get('#course-code').value=FIRST;page.submit();
 assert.equal(page.session.getItem('aula-course-code'),FIRST);assert.deepEqual(page.navigations,['./live.html']);
});
