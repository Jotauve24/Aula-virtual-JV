import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, normalizeSearch, formatPhone, validateProfile, createTopics, joinTopic, escapeHTML } from '../assets/model.js';
import { findPath, isWalkable } from '../assets/world.js';

test('el código tolera espacios y minúsculas; la búsqueda tolera tildes',()=>{
  assert.equal(normalizeCode(' demo 2026 '),'DEMO2026');
  assert.equal(normalizeSearch(' Lucía '),'lucia');
});
test('el teléfono exige exactamente ocho dígitos con su separador',()=>{
  assert.equal(formatPhone('60001234'),'6000-1234');
  assert.equal(formatPhone('6000-1234'),'6000-1234');
  const profile={firstName:'Ana María',lastName:'Ruiz',document:'0-000-001',phone:'0000-0001'};
  assert.deepEqual(validateProfile(profile),{});
  for(const phone of ['','0000-000','00000-0000','abcd-efgh']) assert.ok(validateProfile({...profile,phone}).phone);
  assert.ok(validateProfile({...profile,firstName:' '}).firstName);
  assert.ok(validateProfile({...profile,lastName:''}).lastName);
});
test('solo se permite un equipo y nunca se supera el cupo',()=>{
  const topics=createTopics();
  assert.equal(joinTopic(topics,null,'arquitectura').ok,true);
  assert.equal(joinTopic(topics,null,'seguridad').reason,'full');
  assert.equal(joinTopic(topics,'arquitectura','redes').reason,'already-in-group');
  assert.equal(joinTopic(topics,'arquitectura','arquitectura').reason,'already-member');
  assert.equal(joinTopic(topics,null,'inexistente').reason,'missing-topic');
});
test('el recorrido llega a cada espacio sin atravesar muebles ni salir del aula',()=>{
  for(const topic of createTopics()){
    const path=findPath({x:400,y:300},topic.target);
    assert.ok(path.length>0);
    assert.deepEqual(path.at(-1),topic.target);
    for(const point of path)assert.ok(isWalkable(point.x,point.y));
  }
  const deskPath=findPath({x:400,y:300},{x:160,y:160});
  assert.ok(deskPath.length>0);
  assert.ok(deskPath.every(point=>isWalkable(point.x,point.y)));
  assert.ok(Math.hypot(deskPath.at(-1).x-160,deskPath.at(-1).y-160)<90);
  assert.equal(isWalkable(0,0),false);
});
test('nombres y mensajes se muestran como texto sin inyectar HTML',()=>{
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
