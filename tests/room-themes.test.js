import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWorld, roomTheme, ROOM_THEMES } from '../assets/world.js';
import { createRoomLayout, isWalkable } from '../assets/world-layout.js';

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
  assert.equal(canvas.height, 1280);
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
