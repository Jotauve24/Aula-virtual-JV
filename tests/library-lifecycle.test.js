import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createLibrarySession, libraryRole } from '../assets/library-session.js';
import { BOARD_CATEGORIES } from '../assets/content-board-model.js';
import { categoryIcon, decorateCategorySelect } from '../assets/content-category.js';

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
function app(url = 'https://aula.example/biblioteca.html?vista=docente') {
  let user = a; const nodes = new Map(), events = new Map(), instances = [], calls = [];
  const get = selector => { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); };
  const location = new URL(url);
  vm.runInNewContext(source, {
    document: { querySelector: get, createElement: () => new Node(), addEventListener() {} },
    window: { addEventListener: (name, handler) => events.set(name, handler) },
    location, history: { replaceState: (_, __, path) => { location.href = new URL(path, location).href; } },
    URL, URLSearchParams, configured: true, signedIn: () => true, studentSignedIn: () => false,
    sessionUserId: () => user, contentBoardFiles: () => ({}), createLibrarySession, libraryRole, BOARD_CATEGORIES, categoryIcon, decorateCategorySelect,
    rpc: async name => { calls.push(name); return [{ id: user, name: user === a ? 'Primera materia' : 'Segunda materia' }]; },
    studentRpc: () => { throw Error('Unexpected student request'); },
    createContentBoardDemo: () => { throw Error('Unexpected demo request'); },
    createContentBoard: options => {
      const board = { options, opened: [], composed: [], resets: 0, setContext(id) { this.course = id; },
        open(filters) { this.opened.push({ course: this.course, authorized: options.signedIn(), ...filters }); },
        async compose(draft) { this.composed.push(draft); },
        reset() { this.resets++; }, hasUnsaved: () => false };
      instances.push(board); return board;
    }, confirm: () => true
  });
  return { get, instances, calls, location, changeUser: id => { user = id; }, fire: name => events.get(name)?.({}) };
}

test('restoring the library after an account change creates a controller for the new account', async () => {
  const page = app(); await settle();
  assert.equal(page.instances.length, 1); assert.equal(page.instances[0].opened[0].authorized, true);
  page.get('#library-category').value = 'book'; page.get('#library-category').fire('change');
  page.fire('pagehide'); page.changeUser(b); page.fire('pageshow'); await settle();
  assert.equal(page.get('#library-category').value, 'all');
  page.instances[1].options.onPublish('infographic'); await settle();
  assert.equal(page.instances.length, 3);
  assert.equal(page.instances[0].options.shared, true);
  assert.equal(page.instances[1].options.shared, true);
  assert.equal(page.instances[2].options.shared, false);
  assert.equal(page.instances[2].opened[0].course, b); assert.equal(page.instances[2].opened[0].authorized, true);
  assert.equal(page.instances[2].composed[0].kind, 'infographic');
  assert.equal(page.instances[0].options.signedIn(), false);
});

test('library navigation uses resource categories and never renders account course names', async () => {
  const page = app(); await settle();
  const labels = page.get('#library-category-list').children.map(node => node.textContent);
  assert.deepEqual(labels, Object.values(BOARD_CATEGORIES));
  const options = page.get('#library-category').children.map(node => node.textContent).join(' ');
  assert.doesNotMatch(options, /Primera materia|Segunda materia/);
  page.get('#library-category').value = 'book'; page.get('#library-category').fire('change');
  assert.equal(page.instances.length, 1);
  assert.equal(page.instances[0].opened.at(-1).course, 'all');
  assert.equal(page.instances[0].opened.at(-1).kind, 'book');
  assert.equal(page.get('#library-current-category').textContent, 'Libros');
  assert.equal(page.location.searchParams.get('categoria'), 'book');
  page.instances[0].options.onKindChange('video');
  assert.equal(page.get('#library-category').value, 'video');
  assert.equal(page.get('#library-current-category').textContent, 'Videos');
});

test('old course links open the common library and edits use only the owned internal scope', async () => {
  const page = app('https://aula.example/biblioteca.html?vista=docente&materia=' + a + '&categoria=document'); await settle();
  const shared = page.instances[0];
  assert.equal(shared.opened[0].course, 'all'); assert.equal(shared.opened[0].kind, 'document');
  shared.options.onEdit({ mine: true, courseId: b }); await settle();
  assert.equal(page.instances.length, 1);
  shared.options.onEdit({ mine: true, courseId: a, id: 'own-post' }); await settle();
  assert.equal(page.instances[1].opened[0].course, a);
  assert.equal(page.instances[1].composed[0].post.id, 'own-post');
  assert.equal(page.get('#library-current-category').textContent, 'Mi espacio de creación');
});

test('focusing the library with the same account keeps its selected controller and catalog', async () => {
  const page = app(); await settle(); const original = page.instances[0];
  page.fire('focus'); await settle();
  assert.equal(page.instances.length, 1); assert.equal(page.instances[0], original);
  assert.deepEqual(page.calls, ['my_courses']);
});
