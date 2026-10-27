import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoExperience, DEMO_STUDENT } from '../assets/teacher-demo-state.js';

const group=(id='7',capacity=5,members=[])=>({id,capacity,members});

test('ZombieAdmin starts without a student enrollment and cannot join a full team',()=>{
  const demo=createDemoExperience();
  assert.equal(demo.chosenId,null);
  assert.equal(demo.sharing,false);
  assert.equal(demo.choose(group('full',1,[{id:'real'}])),false);
  assert.equal(demo.chosenId,null);
});
test('group selection remains local, without taking a real place',()=>{
  const realMembers=[{id:'real-member',name:'Estudiante real'}];
  const topic=group('g7',5,realMembers);
  const demo=createDemoExperience();
  assert.equal(demo.choose(topic),true);
  assert.equal(demo.chosenId,'g7');
  assert.equal(demo.choose(group('g8')),false);
  assert.equal(topic.members.length,1);
  assert.equal(demo.members(topic).length,2);
  assert.equal(demo.members(topic)[1].name,DEMO_STUDENT.name);
  assert.equal(demo.members(topic)[1].virtual,true);
  assert.equal(demo.members(topic)[1].mine,true);
  assert.equal(demo.members(group('g8')).length,0);
});
test('contact privacy toggle controls fictional details only',()=>{
  const topic=group('g7'), demo=createDemoExperience();
  demo.choose(topic);
  assert.equal(demo.members(topic)[0].sharing,false);
  assert.equal(DEMO_STUDENT.email,'jair.demo@ejemplo.com');
  assert.equal(DEMO_STUDENT.phone,'6000-0011');
  demo.share(true);
  assert.equal(demo.members(topic)[0].sharing,true);
  demo.share(false);
  assert.equal(demo.members(topic)[0].sharing,false);
});
test('chat sends local examples, not real team messages',()=>{
  const demo=createDemoExperience(),topic=group('g7'),other=group('g8');
  demo.choose(topic);
  const seed=demo.messages('g7');
  assert.equal(seed.length,2);
  assert.ok(seed.every(msg=>msg.name==='Compañero de ejemplo'));
  assert.equal(demo.send('g8','Wrong group'),false);
  assert.equal(demo.send('g7',''),false);
  assert.equal(demo.send('g7','Hola equipo'),true);
  assert.equal(demo.messages('g7').at(-1).name,DEMO_STUDENT.name);
  assert.equal(demo.messages('g7').at(-1).mine,true);
  assert.equal(demo.messages('g8').length,2);
});
test('files stay in the local demo and reset clears only the demonstration',()=>{
  const demo=createDemoExperience(),topic=group('g7');
  demo.choose(topic);
  const file={name:'actividad.pdf',size:1000};
  assert.equal(demo.send('g7','',file,{name:file.name,size:file.size,type:'application/pdf'}),true);
  assert.equal(demo.file('local:demo-1'),file);
  demo.share(true);
  demo.reset();
  assert.equal(demo.chosenId,null);
  assert.equal(demo.sharing,false);
  assert.equal(demo.file('local:demo-1'),null);
  assert.equal(topic.members.length,0);
  assert.equal(demo.choose(topic),true);
  assert.equal(demo.messages('g7').length,2);
});

test('ZombieAdmin can demonstrate an incoming message without touching student chat',()=>{
  const demo=createDemoExperience();
  const topic=group('grupo-demo');
  assert.equal(demo.receive(topic.id),false);
  assert.equal(demo.choose(topic),true);
  assert.equal(demo.receive(topic.id,'¿Ya tienes lista la tarea?'),true);
  const last=demo.messages(topic.id).at(-1);
  assert.equal(last.name,'Compañero de ejemplo');
  assert.equal(last.mine,false);
  assert.equal(last.body,'¿Ya tienes lista la tarea?');
  assert.equal(topic.members.length,0);
  demo.reset();
  assert.equal(demo.chosenId,null);
  assert.equal(demo.messages(topic.id).length,2);
});


test('simulation respects a locked group without consuming or releasing any real membership',()=>{
 const demo=createDemoExperience(),topic={...group('locked',5,[{id:'a'}]),locked:true};
 assert.equal(demo.choose(topic),false);assert.equal(demo.chosenId,null);
 topic.locked=false;assert.equal(demo.choose(topic),true);
 topic.locked=true;assert.equal(demo.chosenId,topic.id);assert.equal(topic.members.length,1);
});
