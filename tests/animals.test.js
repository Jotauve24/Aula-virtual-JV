import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMAL_SPECIES, animalFrames, animalCycleDuration, drawAnimal, drawAnimalHeart } from '../assets/animals.js';
import { createRoomLayout, isWalkable, canWalkSegment } from '../assets/world-layout.js';

test('five animals tour every room and table with continuous floor walks and explicit jumps', () => {
  for (const count of [0, 1, 3, 4, 10, 40]) {
    const layout = createRoomLayout(count), original = JSON.stringify(layout);
    let previous = animalFrames(layout, 0);
    assert.deepEqual(previous.map(animal => animal.id), ['ocelot', 'panda', 'goat', 'cat', 'dog']);
    const actions = previous.map(() => new Set());
    const tables = previous.map(() => new Set());
    for (let time = 137; time <= animalCycleDuration(layout) + 3000; time += 137) {
      const animals = animalFrames(layout, time);
      for (const [index, animal] of animals.entries()) {
        if(animal.mode === 'floor') {
          assert.ok(isWalkable(animal.x, animal.y, layout), `${animal.id} with ${count} rooms`);
          if(previous[index].mode === 'floor' && previous[index].direction === animal.direction)
            assert.ok(canWalkSegment(previous[index], animal, layout), 'floor movement respects walls and furniture');
        } else {
          const room=layout.rooms[animal.roomIndex];
          assert.ok(room);
          assert.ok(animal.x >= room.desk.x+20 && animal.x <= room.desk.x+118);
          assert.ok(animal.y >= room.desk.y+23 && animal.y <= room.desk.y+room.desk.h+12);
          if(animal.mode === 'table'){
            assert.equal(animal.elevation,0);
            assert.equal(animal.depth,room.desk.y+47);
            tables[index].add(animal.roomIndex);
          }else{
            assert.ok(animal.mode.startsWith('jump'));
            assert.ok(animal.elevation>=0&&animal.elevation<=14);
          }
        }
        const distance = Math.hypot(previous[index].x-animal.x, previous[index].y-animal.y);
        assert.ok(distance <= 96 * .137 + 1e-6, 'walking, chasing and jumping do not teleport animals');
        actions[index].add(animal.action);
      }
      previous = animals;
    }
    actions.forEach(states => { assert.ok(states.has('walk')); assert.ok(states.size > 1); });
    tables.forEach(visited=>assert.equal(visited.size,count,'every animal visits every group table'));
    assert.equal(JSON.stringify(layout), original, 'animals never change the student collision map');
  }
});

test('the puppy follows the kitten during short chases, then they greet with hearts',()=>{
  const layout=createRoomLayout(4);
  let chases=0,greetings=0,walks=0;
  for(let time=0;time<animalCycleDuration(layout);time+=137){
    const animals=animalFrames(layout,time),cat=animals.find(animal=>animal.id==='cat'),dog=animals.find(animal=>animal.id==='dog');
    if(cat.action==='run'){
      assert.equal(dog.action,'chase');
      assert.ok(Math.hypot(cat.x-dog.x,cat.y-dog.y)<=22.001);
      assert.ok(cat.moving&&dog.moving);chases++;
    }
    if(cat.heart?.pair.includes('dog')){
      assert.equal(cat.action,'greet');assert.equal(dog.action,'greet');
      assert.ok(!cat.moving&&!dog.moving);
      assert.equal(cat.mode,dog.mode);greetings++;
      const pixels=[],ctx={fillRect(x,y,w,h){pixels.push([x,y,w,h]);}};
      drawAnimalHeart(ctx,cat.heart);
      assert.equal(pixels.length,18);
      assert.ok(pixels.every(pixel=>pixel.every(Number.isFinite)));
    }
    if(cat.action==='walk')walks++;
  }
  assert.ok(chases>10&&greetings>10&&walks>10,'play alternates with normal exploring and greetings');
  assert.ok(animalFrames(layout,24000,true).every(animal=>!animal.heart&&!animal.running));
});

test('independent sessions share the choreography and reduced motion keeps every animal at rest', () => {
  const first = createRoomLayout(3), second = createRoomLayout(3);
  for (const time of [0, 5100, 43210, 1792000000000]) {
    assert.deepEqual(animalFrames(first, time), animalFrames(second, time));
    assert.deepEqual(animalFrames(first, time, true), animalFrames(first, 0, true));
    assert.ok(animalFrames(first, time, true).every(animal => !animal.moving && animal.action !== 'walk'));
  }
});

test('each small animal has walking and resting drawings in all four directions', () => {
  for (const { id } of ANIMAL_SPECIES) {
    const shapes = [];
    for (const direction of ['right', 'left', 'down', 'up']) for (const step of [0, 1, 2, 3]) {
      const pixels = [];
      const ctx = { fillRect(x, y, w, h) { pixels.push([x,y,w,h,this.fillStyle]); } };
      drawAnimal(ctx, { id, x: 50, y: 50, moving: true, direction, step, fidget: 0, blink: false });
      assert.ok(pixels.every(([x,y,w,h]) => [x,y,w,h].every(Number.isFinite) && w > 0 && h > 0));
      assert.ok(50 - Math.min(...pixels.map(pixel => pixel[1])) < 23, 'the baby stays smaller than the 48px student');
      shapes.push(JSON.stringify(pixels));
    }
    assert.ok(new Set(shapes).size >= 8, 'the paws animate and the animal turns');
  }
});
