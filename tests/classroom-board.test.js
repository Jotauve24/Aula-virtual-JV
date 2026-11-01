import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomBoard } from '../assets/classroom-board.js';

class Element {
  constructor(root,tag) {Object.assign(this,{root,tag,children:[],dataset:{},listeners:new Map(),hidden:false});}
  set textContent(value) {this.text=String(value);this.children=[];}
  get textContent() {return this.text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value) {assert.match(value,/^<svg/);this.art=value;}
  setAttribute(name,value) {this[name]=String(value);}
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this.text='';this.children=nodes;}
  addEventListener(event,handler) {this.listeners.set(event,handler);}
  click() {if(!this.disabled)return this.listeners.get('click')?.();}
  focus() {this.root.activeElement=this;}
}
function setup() {
  const root={createElement:tag=>new Element(root,tag),querySelector:()=>host};
  const host=new Element(root,'aside'),opened=[],located=[],looks=[];
  const board=createClassroomBoard({root,avatar:look=>{looks.push(look);return '<svg></svg>';},onOpenNotices:()=>opened.push('open'),onLocate:id=>located.push(id)});
  const [notices,people]=host.children;
  return {board,root,host,notices,people,opened,located,looks,list:people.children[2],more:people.children[4]};
}
const self={id:'self',name:'Ana Prueba',avatar:{skin:1},email:'private@example.invalid',phone:'60000001'};
const notice={id:'n1',title:'Actividad extra',body:'Revisa Educativa.',createdAt:'2026-10-31T20:00:00Z',confirmedAt:'2026-10-31T21:00:00Z'};

test('el tablón abre avisos sin confirmar su lectura y presenta el texto como texto',()=>{
  const page=setup();page.board.setNotices({state:'ready',rows:[{...notice,title:'<img src=x onerror=alert(1)>',body:'<script>prueba</script>'}],pendingCount:1});
  assert.equal(page.notices.children[2].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(page.notices.children[3].textContent,'<script>prueba</script>');
  assert.equal(page.notices.children[1].textContent,'1 aviso por confirmar');
  page.notices.children[4].click();assert.deepEqual(page.opened,['open']);
  page.board.setNotices({state:'unavailable',rows:[notice]});assert.match(page.notices.textContent,/Sin actualizar/);
  assert.equal(page.notices.children[4].textContent,'Comprobar avisos →');
  page.board.setNotices({state:'ready',rows:[]});assert.match(page.notices.textContent,/todavía no ha publicado/);
  assert.equal(page.notices.children[4].hidden,true);
});
test('el último aviso vigente se ordena por fecha y un aviso retirado desaparece del resumen',()=>{
  const page=setup();page.board.setNotices({state:'ready',rows:[notice,{...notice,id:'old',title:'Anterior',createdAt:'2026-10-30T20:00:00Z'},
    {...notice,id:'gone',title:'Retirado',createdAt:'2026-11-01T20:00:00Z',retiredAt:'2026-11-01T21:00:00Z'}]});
  assert.equal(page.notices.children[2].textContent,'Actividad extra');assert.equal(page.notices.children[1].textContent,'Lectura confirmada');
});
test('el resumen de un aviso extenso es breve y deja intacto el texto completo',()=>{
  const page=setup(),row={...notice,body:'Información de la actividad. '.repeat(100)};
  page.board.setNotices({state:'ready',rows:[row]});
  assert.ok(page.notices.children[3].textContent.length<=181);assert.match(page.notices.children[3].textContent,/…$/);assert.ok(row.body.length>2000);
});
test('la lista incluye los presentes una sola vez, su equipo y su avatar, sin datos privados',()=>{
  const page=setup(),peers=[{id:'b',name:'Luis Prueba',avatar:{skin:2},email:'never@example.invalid'},
    {id:'teacher',name:'Docente',role:'teacher'},{id:'b',name:'Duplicado'}];
  page.board.setPresence({self,peers,topics:[{name:'Equipo Coral',members:[{id:'self'},{id:'b'}]}],state:'live'});
  assert.equal(page.people.children[1].textContent,'3 personas conectadas');assert.equal(page.list.children.length,3);
  assert.match(page.list.textContent,/Equipo Coral/);assert.match(page.list.textContent,/Ana Prueba · Tú/);
  assert.doesNotMatch(page.host.textContent,/@|60000001|Duplicado/);assert.ok(page.looks.some(look=>look.character==='zombie'));
  page.list.children.find(item=>item.children[0].dataset.boardPerson==='b').children[0].click();assert.deepEqual(page.located,['b']);
});
test('actualizar coordenadas conserva el botón enfocado y las listas largas se despliegan a pedido',()=>{
  const page=setup(),peers=Array.from({length:60},(_,i)=>({id:'p'+i,name:'Compañero '+i,avatar:{skin:i%3},x:400,y:200}));
  page.board.setPresence({self,peers,state:'live'});assert.equal(page.list.children.length,3);
  const button=page.list.children[1].children[0];button.focus();
  page.board.setPresence({self,peers:peers.map(peer=>({...peer,x:500})),state:'live'});
  assert.equal(page.list.children[1].children[0],button);assert.equal(page.root.activeElement,button);
  page.more.click();assert.equal(page.list.children.length,61);assert.equal(page.more['aria-expanded'],'true');
  page.board.setSelected('p4');assert.equal(page.list.children.find(item=>item.children[0].dataset.boardPerson==='p4').children[0]['aria-pressed'],'true');
  page.more.click();assert.equal(page.list.children.length,3);
});
test('una conexión no comprobada y un cambio de materia no conservan personas ni avisos anteriores',()=>{
  const page=setup();page.board.setNotices({state:'ready',rows:[notice]});page.board.setPresence({self,peers:[{id:'b',name:'Luis'}],state:'live'});
  page.board.setPresence({self,peers:[{id:'b',name:'Luis'}],state:'reconnecting'});
  assert.equal(page.list.children.length,0);assert.doesNotMatch(page.people.textContent,/Luis|2 personas/);assert.match(page.people.textContent,/No pudimos actualizar/);
  page.board.setPresence({self,peers:[],state:'live'});assert.equal(page.people.children[1].textContent,'1 persona conectada');
  page.board.reset();assert.equal(page.host.hidden,true);assert.doesNotMatch(page.host.textContent,/Actividad extra|Ana Prueba/);
});
