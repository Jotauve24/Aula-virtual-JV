import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTutorialClock, createTutorialScene, TUTORIAL_STEPS, TUTORIAL_REGISTRATION_FIELDS } from '../assets/entrance-tutorial.js';
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
  const last = TUTORIAL_STEPS.length - 1;
  assert.equal(clock.go(last).step, last);
  clock.tick(9000);
  assert.equal(clock.snapshot().step, last);
  assert.equal(clock.go(0).progress, 0);
  assert.equal(clock.go(-1).step, 0);
  assert.equal(clock.go(99).step, last);
});

test('all tutorial scenes loop without invalid timing values', () => {
  const clock = createTutorialClock();
  const total = TUTORIAL_STEPS.reduce((sum, step) => sum + step.duration, 0);
  clock.tick(0);
  for (let time = 0; time < total * 3; time += 41) {
    const state = clock.tick(time);
    assert.ok(state.step >= 0 && state.step < TUTORIAL_STEPS.length);
    assert.ok(state.phase >= 0 && state.phase < 1);
    assert.ok(state.progress >= 0 && state.progress < 1);
  }
  assert.deepEqual(clock.tick(NaN), clock.snapshot());
});

test('the example student reaches the team through current classroom doors', () => {
  const scene = createTutorialScene();
  assert.equal(scene.layout.rooms.length, 4);
  let previous = scene.state('movement', 0).player;
  for (const id of ['movement', 'capacity', 'choose']) {
    const start = scene.state(id, 0).player;
    assert.ok(Math.hypot(previous.x - start.x, previous.y - start.y) < .001);
    for (let phase = .001; phase <= 1; phase += .001) {
      const next = scene.state(id, phase).player;
      assert.ok(isWalkable(next.x, next.y, scene.layout));
      assert.ok(canWalkSegment(previous, next, scene.layout));
      assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) < 3);
      previous = next;
    }
  }
  const last = scene.state('choose', 1).player, destination = scene.layout.rooms[0].arrival;
  assert.ok(Math.hypot(last.x - destination.x, last.y - destination.y) < .001);
  assert.equal(last.moving, false);
});

test('onboarding separates code, registration, customization and room movement in that order', () => {
  assert.deepEqual(TUTORIAL_STEPS.map(step => step.id),
    ['code', 'registration', 'avatar', 'movement', 'capacity', 'choose', 'team', 'chat']);
  assert.deepEqual(TUTORIAL_REGISTRATION_FIELDS.map(field => field.id),
    ['firstName', 'lastName', 'age', 'documentNumber', 'email', 'phone']);
  const scene = createTutorialScene();
  assert.deepEqual([0, .17, .34, .51, .68, .85].map(phase => scene.state('registration', phase).fieldIndex),
    [0, 1, 2, 3, 4, 5]);
});

test('the student appears after customization and only joins after confirming an available team', () => {
  const scene = createTutorialScene();
  for (const id of ['code', 'registration', 'avatar']) {
    assert.equal(scene.state(id, 1).player, null);
    assert.equal(scene.state(id, 1).joined, false);
  }
  for (const id of ['movement', 'capacity']) {
    assert.ok(scene.state(id, 1).player);
    assert.equal(scene.state(id, 1).joined, false);
  }
  assert.equal(scene.state('choose', .64).choice, 'open');
  assert.equal(scene.state('choose', .65).choice, 'confirm');
  assert.equal(scene.state('choose', .82).joined, false);
  assert.equal(scene.state('choose', .83).choice, 'saved');
  assert.equal(scene.state('choose', .83).joined, true);
  assert.equal(scene.state('team', 0).joined, true);
  assert.equal(scene.state('chat', 0).joined, true);
});

test('every tutorial scene has exactly one matching card and navigation control', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const expected = TUTORIAL_STEPS.map(step => step.id);
  const cards = [...html.matchAll(/data-tour-card="([^"]+)"/g)].map(match => match[1]);
  const buttons = [...html.matchAll(/data-tour-step="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(cards, expected);
  assert.deepEqual(buttons, expected);
});
