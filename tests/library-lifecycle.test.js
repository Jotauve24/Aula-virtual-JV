import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createLibrarySession, libraryRole } from '../assets/library-session.js';

const source = readFileSync(new URL('../assets/library.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002';
const settle = () => new Promise(resolve => setImmediate(resolve));
class Node {
  constructor() { this.children = []; this.listeners = new Map(); this.value = ''; this.hidden = true; this.attributes = new Map(); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  fire(name) { return this.listeners.get(name)?.({ target: this }); }
}
function app() {
  let user = a; const nodes = new Map(), events = new Map(), instances = [], calls = [];
  const get = selector => { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); };
  const location = new URL('https://aula.example/biblioteca.html?vista=docente');
  vm.runInNewContext(source, {
    document: { querySelector: get, createElement: () => new Node(), addEventListener() {} },
    window: { addEventListener: (name, handler) => events.set(name, handler) },
    location, history: { replaceState: (_, __, path) => { location.href = new URL(path, location).href; } },
    URL, URLSearchParams, configured: true, signedIn: () => true, studentSignedIn: () => false,
    sessionUserId: () => user, contentBoardFiles: () => ({}), createLibrarySession, libraryRole,
    rpc: async name => { calls.push(name); return [{ id: user, name: user === a ? 'Primera materia' : 'Segunda materia' }]; },
    studentRpc: () => { throw Error('Unexpected student request'); },
    createContentBoardDemo: () => { throw Error('Unexpected demo request'); },
    createContentBoard: options => {
      const board = { options, opened: [], resets: 0, setContext(id) { this.course = id; },
        open() { this.opened.push({ course: this.course, authorized: options.signedIn() }); },
        reset() { this.resets++; }, hasUnsaved: () => false };
      instances.push(board); return board;
    }, confirm: () => true
  });
  return { get, instances, calls, changeUser: id => { user = id; }, fire: name => events.get(name)?.({}) };
}

test('restoring the library after an account change creates a controller for the new account', async () => {
  const page = app(); await settle();
  assert.equal(page.instances.length, 1); assert.equal(page.instances[0].opened[0].authorized, true);
  page.get('#library-filter').value = 'Primera'; page.get('#library-filter').fire('input');
  page.fire('pagehide'); page.changeUser(b); page.fire('pageshow'); await settle();
  assert.equal(page.get('#library-filter').value, '');
  page.get('#library-course').value = b; page.get('#library-course').fire('change'); await settle();
  assert.equal(page.instances.length, 3);
  assert.equal(page.instances[0].options.shared, true);
  assert.equal(page.instances[1].options.shared, true);
  assert.equal(page.instances[2].options.shared, false);
  assert.equal(page.instances[2].opened[0].course, b); assert.equal(page.instances[2].opened[0].authorized, true);
  assert.equal(page.instances[0].options.signedIn(), false);
});

test('focusing the library with the same account keeps its selected controller and catalog', async () => {
  const page = app(); await settle(); const original = page.instances[0];
  page.fire('focus'); await settle();
  assert.equal(page.instances.length, 1); assert.equal(page.instances[0], original);
  assert.deepEqual(page.calls, ['my_courses']);
});
