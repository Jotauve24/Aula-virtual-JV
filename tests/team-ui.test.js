import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamName, renderTeamLight, createTeamNameControl } from '../assets/team-ui.js';
import { createRoomLayout } from '../assets/world-layout.js';
import { createDemoExperience } from '../assets/teacher-demo-state.js';

test('team names normalize whitespace and validate Unicode character boundaries', () => {
  assert.equal(normalizeTeamName('  Equipo\n  Creativo\t '), 'Equipo Creativo');
  assert.equal(normalizeTeamName('Á'.repeat(80)), 'Á'.repeat(80));
  assert.equal(normalizeTeamName('🦊'.repeat(80)), '🦊'.repeat(80));
  for (const value of [null, '', ' \t\n', 'A', 'Á'.repeat(81)])
    assert.throws(() => normalizeTeamName(value), /2 y 80/);
});
test('the light follows a selected room across layout sizes without changing movement geometry', () => {
  const node = { hidden: true, style: {} };
  for (const count of [1, 3, 4, 10, 40]) {
    const layout = createRoomLayout(count), before = JSON.stringify(layout);
    renderTeamLight(node, layout, count - 1);
    const room = layout.rooms.at(-1);
    assert.equal(node.hidden, false);
    assert.equal(node.style.left, room.x / layout.width * 100 + '%');
    assert.equal(node.style.top, room.y / layout.height * 100 + '%');
    assert.equal(node.style.width, room.w / layout.width * 100 + '%');
    assert.equal(node.style.height, room.h / layout.height * 100 + '%');
    assert.equal(JSON.stringify(layout), before);
    renderTeamLight(node, layout, -1); assert.equal(node.hidden, true);
  }
});

function control(onSave) {
  const doc = { activeElement: null };
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = new Map(); this.events = new Map(); this.isConnected = true; this.style = {}; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attrs.set(key, value); }
    removeAttribute(key) { this.attrs.delete(key); }
    addEventListener(key, fn) { this.events.set(key, fn); }
    focus() { doc.activeElement = this; }
    select() { this.selected = true; }
    async fire(key, event = {}) { await this.events.get(key)?.({ preventDefault() {}, ...event }); }
  }
  doc.createElement = tag => new Element(tag);
  const previous = globalThis.document; globalThis.document = doc;
  const api = createTeamNameControl({ name: 'Grupo 1', onSave });
  globalThis.document = previous;
  const [row, form] = api.element.children, [title, edit] = row.children;
  const [label, input, hint, error, actions] = form.children, [save, cancel] = actions.children;
  return { ...api, doc, row, form, title, edit, label, input, hint, error, save, cancel };
}
test('the pencil opens a labelled editor; cancel and Escape preserve the saved name', async () => {
  const page = control(() => assert.fail('Cancel must not save'));
  assert.equal(page.form.hidden, true);
  assert.equal(page.label.htmlFor, page.input.id);
  assert.equal(page.edit.attrs.get('aria-controls'), page.form.id);
  await page.edit.fire('click'); assert.equal(page.form.hidden, false);
  assert.equal(page.input.value, 'Grupo 1'); assert.equal(page.doc.activeElement, page.input);
  page.input.value = 'Borrador'; await page.cancel.fire('click');
  assert.equal(page.title.textContent, 'Grupo 1'); assert.equal(page.form.hidden, true);
  assert.equal(page.doc.activeElement, page.edit);
  await page.edit.fire('click'); assert.equal(page.input.value, 'Grupo 1');
  await page.form.fire('keydown', { key: 'Escape' }); assert.equal(page.form.hidden, true);
});
test('saving blocks duplicate requests and restores focus after the shared name is confirmed', async () => {
  const calls = []; let finish;
  const page = control((...args) => { calls.push(args); return new Promise(resolve => { finish = resolve; }); });
  await page.edit.fire('click'); page.input.value = '  Equipo   Coral ';
  const pending = page.form.fire('submit');
  await page.form.fire('submit'); await page.cancel.fire('click');
  assert.equal(calls.length, 1); assert.deepEqual(calls[0], ['Equipo Coral', 'Grupo 1']);
  assert.equal(page.save.disabled, true); assert.equal(page.form.hidden, false);
  finish('Equipo Coral'); await pending;
  assert.equal(page.title.textContent, 'Equipo Coral'); assert.equal(page.form.hidden, true);
  assert.equal(page.save.disabled, false); assert.equal(page.doc.activeElement, page.edit);
});
test('validation and server failures preserve the draft and allow retry', async () => {
  let calls = 0;
  const page = control(async () => { calls++; throw new Error('No se pudo conectar. Inténtalo otra vez.'); });
  await page.edit.fire('click'); page.input.value = '  ';
  await page.form.fire('submit'); assert.equal(calls, 0); assert.equal(page.error.hidden, false);
  page.input.value = 'Equipo Bosque'; await page.form.fire('submit');
  assert.equal(calls, 1); assert.equal(page.input.value, 'Equipo Bosque');
  assert.equal(page.form.hidden, false); assert.equal(page.error.attrs.get('role'), 'alert');
  assert.equal(page.input.attrs.get('aria-invalid'), 'true'); assert.equal(page.input.disabled, false);
  await page.form.fire('submit'); assert.equal(calls, 2);
});
test('background updates preserve the draft and original version until the editor is reopened', async () => {
  let received;
  const page = control(async (...args) => { received = args; throw new Error('El nombre cambió.'); });
  await page.edit.fire('click'); page.input.value = 'Mi propuesta'; page.update('Nombre de un compañero');
  await page.form.fire('submit'); assert.deepEqual(received, ['Mi propuesta', 'Grupo 1']);
  assert.equal(page.input.value, 'Mi propuesta');
  await page.cancel.fire('click'); await page.edit.fire('click');
  assert.equal(page.input.value, 'Nombre de un compañero');
});
test('an unchanged team name closes without a database write', async () => {
  const page = control(() => assert.fail('No change must not save'));
  await page.edit.fire('click'); await page.form.fire('submit'); assert.equal(page.form.hidden, true);
});
test('the teacher simulation renames only its local team and resets without modifying real topics', () => {
  const demo = createDemoExperience();
  const mine = { id: 'one', name: 'Grupo 1', capacity: 5, members: [] };
  const other = { id: 'two', name: 'Grupo 2', capacity: 5, members: [] };
  const before = JSON.stringify([mine, other]); demo.choose(mine);
  assert.throws(() => demo.rename(other, 'Ajeno', 'Grupo 2'), /Solo puedes/);
  assert.throws(() => demo.rename(mine, 'grupo 2', 'Grupo 1', [mine, other]), /Ya existe/);
  assert.equal(demo.rename(mine, 'Equipo Coral', 'Grupo 1', [mine, other]), 'Equipo Coral');
  assert.equal(demo.nameOf(mine), 'Equipo Coral');
  assert.throws(() => demo.rename(mine, 'Cambio tardío', 'Grupo 1'), /nombre cambió/);
  assert.equal(JSON.stringify([mine, other]), before); demo.reset();
  assert.equal(demo.nameOf(mine), 'Grupo 1');
});
