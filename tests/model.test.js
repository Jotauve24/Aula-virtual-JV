import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode } from '../assets/model.js';
import { createRoomLayout, findPath, isWalkable, canWalkSegment } from '../assets/world-layout.js';

test('el código de materia tolera espacios y minúsculas',()=>{
  assert.equal(normalizeCode(' mat-aaaaa- bbbbb-ccccc '),'MAT-AAAAA-BBBBB-CCCCC');
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

