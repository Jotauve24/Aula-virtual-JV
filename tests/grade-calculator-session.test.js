import test from 'node:test';
import assert from 'node:assert/strict';
import { createGradeSession } from '../assets/grade-calculator-session.js';

const scheme = { activities: [{ id: 'a', name: 'Proyecto', weight: 40 }, { id: 'b', name: 'Examen', weight: 60 }], referenceGrade: 71, revision: 1 };
const copy = value => structuredClone(value);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function setup(handler) {
  const calls = []; let active = true;
  const session = createGradeSession({ rpc: async (name, body) => { calls.push({name,body}); return handler(name,body); }, signedIn: () => active });
  session.setContext('course-a');
  return { session, calls, signOut: () => { active=false; session.reset(); } };
}
test('draft loading restores zero, personal target and revision across devices', async () => {
  const page=setup(()=>({scheme:copy(scheme),draft:{grades:{a:0,retired:100},goal:0,revision:3,schemeRevision:1}}));
  await page.session.load(); const state=page.session.snapshot();
  assert.deepEqual(state.values,{a:0}); assert.equal(state.goal,0); assert.equal(state.revision,3); assert.equal(state.dirty,false);
  page.session.edit({id:'b',value:'90'}); assert.equal(state.dirty,true);
});
test('load failure retries without reporting a fabricated empty configuration', async () => {
  let fail=true;const page=setup(()=>{if(fail)throw Error('Sin conexión');return {scheme:null,draft:null};});
  await page.session.load();assert.equal(page.session.snapshot().phase,'error');
  fail=false;await page.session.load();assert.equal(page.session.snapshot().phase,'ready');assert.equal(page.session.snapshot().scheme,null);
});
test('late load and save responses cannot restore a former course or signed-out profile', async () => {
  const pending=deferred();const page=setup(()=>pending.promise);
  const loading=page.session.load();page.session.setContext('course-b');pending.resolve({scheme:copy(scheme),draft:null});await loading;
  assert.equal(page.session.snapshot().courseId,'course-b');assert.equal(page.session.snapshot().scheme,null);
  const savePending=deferred();let save=false;
  const other=setup(()=>save?savePending.promise:{scheme:copy(scheme),draft:null});
  await other.session.load();other.session.edit({id:'a',value:'80'});save=true;
  const saving=other.session.save();other.signOut();savePending.resolve({revision:1});await saving;
  assert.equal(other.session.snapshot().courseId,'');assert.equal(other.session.snapshot().revision,0);
});
test('save snapshots values while preserving edits made during the request', async () => {
  const pending=deferred();let saving=false;
  const page=setup(()=>saving?pending.promise:{scheme:copy(scheme),draft:null});
  await page.session.load();page.session.edit({id:'a',value:'80,25'});saving=true;
  const promise=page.session.save();await page.session.save();page.session.edit({id:'a',value:'90'});
  assert.equal(page.calls.filter(call=>call.name==='student_save_grade_simulation').length,1);
  assert.deepEqual(page.calls.at(-1).body,{p_course_id:'course-a',p_scheme_revision:1,p_draft_revision:0,p_grades:{a:80.25},p_goal:71});
  pending.resolve({revision:1});await promise;
  assert.equal(page.session.snapshot().values.a,'90');assert.equal(page.session.snapshot().revision,1);assert.equal(page.session.snapshot().dirty,true);
});
test('save errors retain values; conflicts require an explicit reload', async () => {
  let fail=false;let saves=0;
  const page=setup(name=>{if(name==='student_grade_calculator')return {scheme:copy(scheme),draft:null};saves++;if(fail)throw Object.assign(Error('Cambió en otro dispositivo'),{code:'PT409'});return {revision:1};});
  await page.session.load();page.session.edit({id:'a',value:'80'});fail=true;
  await page.session.save();await page.session.save();
  assert.equal(saves,1);assert.equal(page.session.snapshot().conflict,true);assert.equal(page.session.snapshot().values.a,'80');
  assert.equal(page.session.fillPending(90),false);assert.equal(Object.hasOwn(page.session.snapshot().values,'b'),false);
  await page.session.load();assert.equal(page.session.snapshot().conflict,false);
});
test('invalid values are not sent and failed reload preserves the current simulation', async () => {
  let fail=false;const page=setup(()=>{if(fail)throw Error('Sin conexión');return {scheme:copy(scheme),draft:null};});
  await page.session.load();page.session.edit({id:'a',value:'101'});await page.session.save();assert.equal(page.calls.length,1);
  fail=true;await page.session.load();assert.equal(page.session.snapshot().phase,'ready');assert.equal(page.session.snapshot().values.a,'101');
  assert.equal(page.session.snapshot().dirty,true);
});
test('updated percentages retain only matching activities and explain recalculation', async () => {
  const page=setup(()=>({scheme:{...copy(scheme),revision:2},draft:{grades:{a:75,old:100},goal:80,revision:4,schemeRevision:1}}));
  await page.session.load();assert.deepEqual(page.session.snapshot().values,{a:75});assert.match(page.session.snapshot().notice,/actualizó/);
});
test('applying a what-if fills only current blanks in one edit and waits for an explicit save', async () => {
  const page=setup(()=>({scheme:copy(scheme),draft:null}));await page.session.load();
  page.session.edit({id:'a',value:'0'});assert.equal(page.session.fillPending('86,01'),true);
  assert.deepEqual(page.session.snapshot().values,{a:'0',b:86.01});assert.equal(page.session.snapshot().dirty,true);
  assert.equal(page.calls.length,1);assert.equal(page.session.fillPending(99),false);
});
test('invalid inputs, a save in flight and a replaced context cannot be changed by an applied trial', async () => {
  const pending=deferred();const page=setup(name=>name==='student_grade_calculator'?{scheme:copy(scheme),draft:null}:pending.promise);
  await page.session.load();page.session.edit({id:'a',value:'101'});
  assert.equal(page.session.fillPending(80),false);assert.deepEqual(page.session.snapshot().values,{a:'101'});
  page.session.edit({id:'a',value:'80'});assert.equal(page.session.fillPending(101),false);
  const saving=page.session.save();assert.equal(page.session.fillPending(80),false);
  pending.resolve({revision:1});await saving;
  page.session.setContext('course-b');assert.equal(page.session.fillPending(80),false);
  assert.deepEqual(page.session.snapshot().values,{});
});
