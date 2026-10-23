import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorialClock, createTutorialScene, TUTORIAL_STEPS } from '../assets/entrance-tutorial.js';
import { isWalkable, canWalkSegment } from '../assets/world-layout.js';

test('pausing a tutorial preserves its position when resumed much later', () => {
  const clock = createTutorialClock();
  clock.tick(0); clock.tick(2600);
  clock.pause(true); clock.tick(80000);
  assert.equal(clock.snapshot().elapsed, 2600);
  clock.pause(false); clock.tick(100000); clock.tick(100300);
  assert.equal(clock.snapshot().elapsed, 2900);
});

test('a hidden tutorial does not advance or skip instructions after returning', () => {
  const clock = createTutorialClock();
  clock.tick(0); clock.tick(1500);
  clock.visibility(false); clock.tick(95000);
  assert.equal(clock.snapshot().elapsed, 1500);
  clock.visibility(true); clock.tick(110000); clock.tick(110200);
  assert.equal(clock.snapshot().elapsed, 1700);
});

test('manual steps and replay keep the selected page and timer consistent', () => {
  const clock = createTutorialClock(true);
  assert.equal(clock.go(5).step, 5);
  clock.tick(9000);
  assert.equal(clock.snapshot().step, 5);
  assert.equal(clock.go(0).progress, 0);
  assert.equal(clock.go(-1).step, 0);
  assert.equal(clock.go(99).step, 5);
});

test('the six tutorial scenes loop without invalid timing values', () => {
  const clock = createTutorialClock();
  const total = TUTORIAL_STEPS.reduce((sum, step) => sum + step.duration, 0);
  clock.tick(0);
  for (let time = 0; time < total * 3; time += 41) {
    const state = clock.tick(time);
    assert.ok(state.step >= 0 && state.step < 6);
    assert.ok(state.phase >= 0 && state.phase < 1);
    assert.ok(state.progress >= 0 && state.progress < 1);
  }
  assert.deepEqual(clock.tick(NaN), clock.snapshot());
});

test('the example student reaches the team through current classroom doors', () => {
  const scene = createTutorialScene();
  assert.equal(scene.layout.rooms.length, 4);
  let previous = scene.player(2, 0);
  for (let phase = .001; phase <= 1; phase += .001) {
    const next = scene.player(2, phase);
    assert.ok(isWalkable(next.x, next.y, scene.layout));
    assert.ok(canWalkSegment(previous, next, scene.layout));
    assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) < 3);
    previous = next;
  }
  const last = scene.player(2, 1), destination = scene.layout.rooms[0].arrival;
  assert.ok(Math.hypot(last.x - destination.x, last.y - destination.y) < .001);
  assert.equal(last.moving, false);
});
