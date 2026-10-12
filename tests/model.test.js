import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, normalizeSearch, formatPhone, validateProfile, createTopics, joinTopic, escapeHTML } from '../assets/model.js';
import { createRoomLayout, findPath, isWalkable, canWalkSegment } from '../assets/world-layout.js';

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
test('cada cantidad de mesas tiene rutas continuas por sus puertas',()=>{
  for (const count of [1,2,3,4,5,6,7,8,12]) {
    const layout = createRoomLayout(count);
    assert.equal(layout.rooms.length,count);
    for (const room of layout.rooms) {
      const path = findPath(layout.spawn,room.arrival,layout);
      assert.ok(path.length>0);
      assert.deepEqual(path.at(-1),room.arrival);
      let previous = layout.spawn;
      for (const point of path) {assert.ok(canWalkSegment(previous,point,layout));previous=point;}
      // Direct movement must stop at a wall even if the endpoint is free.
      const wallY = room.y + 70;
      assert.equal(canWalkSegment({x:room.x+275,y:wallY},{x:room.x+320,y:wallY},layout),false);
    }
    assert.equal(isWalkable(0,0,layout),false);
  }
});
test('un destino dentro de un mueble se aproxima por suelo accesible',()=>{
  const layout=createRoomLayout(3), room=layout.rooms[0];
  const target={x:room.desk.x+70,y:room.desk.y+20};
  const path=findPath(layout.spawn,target,layout);
  assert.ok(path.length>0);
  assert.ok(isWalkable(path.at(-1).x,path.at(-1).y,layout));
  let previous=layout.spawn;
  for(const point of path){assert.ok(canWalkSegment(previous,point,layout));previous=point;}
});
test('nombres y mensajes se muestran como texto sin inyectar HTML',()=>{
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

