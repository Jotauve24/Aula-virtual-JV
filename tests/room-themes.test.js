import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWorld, roomTheme, ROOM_THEMES } from '../assets/world.js';
import { createRoomLayout, findPath, isWalkable, canWalkSegment, memberSeat } from '../assets/world-layout.js';

test('ten desks have different themed furnishings while their walking layout stays intact', () => {
  const layout = createRoomLayout(10);
  const before = JSON.stringify(layout);
  const strokes = [];
  const ctx = { fillStyle: '', fillRect(x, y, w, h) {
    strokes.push({ x, y, w, h, color: this.fillStyle });
  } };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  drawWorld(canvas, { layout });
  assert.equal(canvas.width, 800);
  assert.equal(canvas.height, 1312);
  assert.equal(JSON.stringify(layout), before);
  assert.equal(ROOM_THEMES.length, 10);
  assert.equal(new Set(ROOM_THEMES.map(t => t.id)).size, 10);
  assert.equal(new Set(ROOM_THEMES.map(t => t.accent)).size, 10);
  const deskShapes = layout.rooms.map(room => {
    assert.ok(isWalkable(room.arrival.x, room.arrival.y, layout));
    const d = room.desk;
    // Ignore colors: this verifies that desks actually have distinct objects.
    return JSON.stringify(strokes.filter(s =>
      s.x >= d.x + 10 && s.x < d.x + 125 &&
      s.y >= d.y + 4 && s.y < d.y + 39 &&
      s.w < 50 && s.h < 35
    ).map(s => [s.x - d.x, s.y - d.y, s.w, s.h]));
  });
  assert.equal(new Set(deskShapes).size, 10);
});

test('rooms beyond ten still receive distinct color palettes', () => {
  const accents = Array.from({ length: 40 }, (_, i) => roomTheme(i).accent);
  assert.equal(new Set(accents).size, 40);
});

test('an unpaired final group sits below the center and every room remains reachable', () => {
  for (let count = 1; count <= 10; count++) {
    const layout = createRoomLayout(count);
    const last = layout.rooms.at(-1);
    assert.equal(last.x, count % 2 ? 250 : 460);
    if (count % 2) {
      assert.equal(last.label.x, layout.width / 2);
      assert.ok(isWalkable(400, last.y + 3, layout));
      assert.ok(isWalkable(400, last.y + 217, layout));
      if (count > 1) assert.deepEqual(layout.rooms.slice(-3, -1).map(room => room.x), [40, 460]);
    }
    assert.ok(isWalkable(layout.spawn.x, layout.spawn.y, layout));
    for (const room of layout.rooms) {
      const path = findPath(layout.spawn, room.arrival, layout);
      assert.deepEqual(path.at(-1), room.arrival, `entry to group ${layout.rooms.indexOf(room) + 1} of ${count}`);
      assert.ok([layout.spawn, ...path].every((point, index, points) =>
        index === 0 || canWalkSegment(points[index - 1], point, layout)));
    }
  }
});

test('the map draws two overlapping students with separate visible names', () => {
  const names = [];
  const ctx = { fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
    measureText: text => ({ width: text.length * 7 }),
    fillText: (text, x) => names.push([text, x]) };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  drawWorld(canvas, { layout: createRoomLayout(0), player: { x: 400, y: 280, skin: 1, shirt: 0 },
    peers: [{ x: 400, y: 280, name: 'Ana', avatar: { skin: 1, shirt: 5, hair: 'long' } }] });
  const peer = names.find(([label]) => label === 'Ana');
  const me = names.find(([label]) => label === 'Tú');
  assert.ok(peer && me);
  assert.ok(Math.abs(peer[1] - me[1]) >= 27);
});

test('three permanent seats stay inside their team room and away from furniture', () => {
  const layout = createRoomLayout(3);
  for (const room of layout.rooms) for (let index = 0; index < 3; index++) {
    const place = memberSeat(room, index);
    assert.ok(place.x > room.x && place.x < room.x + room.w);
    assert.ok(place.y > room.y && place.y < room.y + room.h);
    assert.ok(isWalkable(place.x, place.y, layout), `seat ${index + 1} of room ${layout.rooms.indexOf(room) + 1}`);
  }
});

test('entrance furniture has collision while the center path reaches the rooms', () => {
  for (const count of [0, 1, 3, 4, 10, 39, 40]) {
    const layout = createRoomLayout(count);
    for (const object of layout.exterior) {
      assert.equal(isWalkable(object.x + object.w / 2, object.y + object.h / 2, layout), false);
    }
    const hall = { x: 400, y: layout.height - 102 };
    const path = findPath(layout.spawn, hall, layout);
    assert.deepEqual(path.at(-1), hall, `central entrance with ${count} groups`);
    for (const room of [layout.rooms[0], layout.rooms.at(-1)].filter(Boolean)) {
      const route = findPath(layout.spawn, room.arrival, layout);
      assert.deepEqual(route.at(-1), room.arrival);
      assert.ok([layout.spawn, ...route].every((point, index, points) =>
        index === 0 || canWalkSegment(points[index - 1], point, layout)));
    }
  }
});
