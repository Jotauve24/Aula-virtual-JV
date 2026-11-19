import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createContentBoard } from '../assets/content-board.js';
import { createContentBoardDemo } from '../assets/content-board-demo.js';

const descendants = node => [node, ...node.children.flatMap(descendants)];
class Element {
  constructor(root, tag) { Object.assign(this, { root, tag, children: [], attributes: {}, listeners: new Map(), dataset: {}, value: '', text: '', hidden: false, disabled: false }); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.text = ''; this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  contains(node) { return descendants(this).includes(node); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
  querySelectorAll(selector) { return selector === '[data-post-action]' ? descendants(this).filter(node => 'postAction' in node.dataset) : []; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function dom() {
  const root = { createElement: tag => new Element(root, tag), listeners: new Map(),
    addEventListener(name, handler) { this.listeners.set(name, handler); },
    removeEventListener(name, handler) { if (this.listeners.get(name) === handler) this.listeners.delete(name); } };
  const host = new Element(root, 'div'); root.body = new Element(root, 'body'); root.body.append(host);
  return { root, host, win: { addEventListener() {}, crypto: { randomUUID }, URL: { revokeObjectURL() {} } } };
}

test('zombie mural renders every example, including its illustration without a remote attachment', async () => {
  const page = dom(), demo = createContentBoardDemo({ crypto: { randomUUID } });
  const course = randomUUID(); demo.setContext(course);
  let remoteFiles = 0;
  const board = createContentBoard({ ...page, signedIn: () => true, demo: true, rpc: demo.request,
    files: { ...demo.files, blob: async () => { remoteFiles++; throw Error('Unexpected remote file'); } } });
  board.setContext(course); board.open(); await settle();
  assert.equal(board.snapshot().error, '');
  assert.equal(descendants(page.host).filter(node => node.tag === 'article').length, 5);
  const image = descendants(page.host).find(node => node.tag === 'img');
  assert.match(image.src, /board-example\.svg$/); assert.equal(remoteFiles, 0);
  assert.match(page.host.textContent, /5 publicaciones/);
  board.reset(); assert.equal(page.host.children.length, 0);
});

test('student board keeps teacher controls hidden and safely renders publication text', async () => {
  const page = dom(), demo = createContentBoardDemo({ crypto: { randomUUID } });
  const course = randomUUID(); demo.setContext(course);
  const board = createContentBoard({ ...page, signedIn: () => true, files: demo.files, rpc: async (name, args) => {
    const result = await demo.request(name, args);
    result.posts = result.posts.map(post => ({ ...post, demoImage: undefined, title: '<script>publication</script>' }));
    result.settings.postingOpen = false;
    return result;
  } });
  board.setContext(course); board.open(); await settle();
  const nodes = descendants(page.host);
  assert.equal(nodes.find(node => node.className === 'cb-settings').hidden, true);
  assert.equal(nodes.find(node => node.tag === 'button' && node.textContent === 'Publicar contenido').disabled, true);
  assert.equal(nodes.filter(node => node.tag === 'script').length, 0);
  assert.match(page.host.textContent, /<script>publication<\/script>/);
});

test('an unavailable board never reports a false zero publication count', async () => {
  const page = dom();
  const board = createContentBoard({ ...page, signedIn: () => true, files: {}, rpc: async () => { throw Error('Sin conexión'); } });
  board.setContext(randomUUID()); board.open(); await settle();
  const summary = descendants(page.host).find(node => node.className === 'cb-list-summary');
  assert.equal(summary.textContent, 'Publicaciones no disponibles');
  assert.equal(descendants(page.host).find(node => node.className === 'cb-error').hidden, false);
});
test('the community mural shows resources without course names, team names or default edit controls', async () => {
  const page = dom(), demo = createContentBoardDemo({ crypto: { randomUUID } }), course = randomUUID();
  demo.setContext(course);
  const board = createContentBoard({ ...page, shared: true, showGroups: false, demo: true, signedIn: () => true, files: demo.files,
    rpc: async () => {
      const result = await demo.request('course_board', { p_course_id: course });
      result.posts = result.posts.map(post => ({ ...post, courseId: course, courseName: '3519608 - Informática II - Martes' }));
      result.actor.isTeacher = true;
      return result;
    } });
  board.setContext('all'); board.open(); await settle();
  const nodes = descendants(page.host);
  assert.equal(board.snapshot().error, '');
  assert.equal(nodes.filter(node => node.tag === 'article').length, 5);
  assert.doesNotMatch(page.host.textContent, /Informática II|3519608|Equipo de ejemplo|Martes/);
  assert.equal(nodes.find(node => node.tag === 'button' && node.textContent === 'Publicar contenido').hidden, true);
  assert.equal(nodes.filter(node => node.className === 'cb-post-actions').length, 0);
});

for (const kind of ['infographic', 'digital_tool']) test('a resource category carries into the composer and publishes: '+kind, async () => {
  const page = dom(), demo = createContentBoardDemo({ crypto: { randomUUID } }), course = randomUUID(); demo.setContext(course);
  const board = createContentBoard({ ...page, showGroups: false, signedIn: () => true, demo: true, files: demo.files, rpc: demo.request });
  board.setContext(course); await board.compose({ kind });
  const dialog = descendants(page.root.body).find(node => node.tag === 'dialog');
  assert.equal(dialog.open, true);
  const fields = descendants(dialog);
  assert.equal(fields.find(node => node.id === 'cb-post-kind').value, kind);
  fields.find(node => node.id === 'cb-title').value = 'Una infografía para aprender';
  fields.find(node => node.id === 'cb-body').value = 'Ideas para compartir con la comunidad.';
  await fields.find(node => node.tag === 'form').listeners.get('submit')({ preventDefault() {} }); await settle();
  const result = await demo.request('course_board', { p_course_id: course, p_scope: 'mine' });
  assert.equal(result.posts.length, 1); assert.equal(result.posts[0].kind, kind);
  const filtered = await demo.request('course_board', { p_course_id: course, p_kind: kind, p_scope: 'mine' });
  assert.equal(filtered.posts.length, 1); assert.equal(filtered.posts[0].kind, kind);
  assert.equal(descendants(page.root.body).filter(node => node.tag === 'dialog').length, 0);
});

test('a late publication-context response cannot open a composer in a different context', async () => {
  const page = dom(), demo = createContentBoardDemo({ crypto: { randomUUID } }), course = randomUUID(); demo.setContext(course);
  const result = await demo.request('course_board', { p_course_id: course }); let finish;
  const board = createContentBoard({ ...page, signedIn: () => true, files: demo.files, rpc: () => new Promise(resolve => { finish = resolve; }) });
  board.setContext(course); const composing = board.compose({ kind: 'book' });
  board.setContext(randomUUID()); finish(result); await composing;
  assert.equal(descendants(page.root.body).filter(node => node.tag === 'dialog').length, 0);
});

test('publication options close on Escape, outside press and when another menu opens', async () => {
  const page = dom(), demo = createContentBoardDemo({ crypto: { randomUUID } }), course = randomUUID(); demo.setContext(course);
  const board = createContentBoard({ ...page, signedIn: () => true, files: demo.files, rpc: async (name, args) => {
    const data = await demo.request(name, args);
    data.posts = data.posts.slice(0, 2).map(post => ({ ...post, mine: true })); return data;
  } });
  board.setContext(course); board.open(); await settle();
  const menus = descendants(page.host).filter(node => node.className === 'cb-post-actions');
  const open = menu => { menu.open = true; menu.listeners.get('toggle')(); };
  open(menus[0]); assert.equal(page.root.listeners.has('pointerdown'), true);
  open(menus[1]); assert.equal(menus[0].open, false); assert.equal(menus[1].open, true);
  let prevented = false;
  page.root.listeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true); assert.equal(menus[1].open, false); assert.equal(menus[1].children[0].focused, true);
  assert.equal(page.root.listeners.size, 0);
  open(menus[0]); page.root.listeners.get('pointerdown')({ target: page.host });
  assert.equal(menus[0].open, false); assert.equal(page.root.listeners.size, 0);
  open(menus[0]); board.reset();
  assert.equal(menus[0].open, false); assert.equal(page.root.listeners.size, 0);
  open(menus[0]); // A queued native toggle from a removed card is ignored.
  assert.equal(page.root.listeners.size, 0);
});

test('opening edit closes its menu and avoids repeating the generic teacher name', async () => {
  const page = dom(), demo = createContentBoardDemo({ crypto: { randomUUID } }), course = randomUUID(); demo.setContext(course);
  const board = createContentBoard({ ...page, signedIn: () => true, files: demo.files, rpc: async (name, args) => {
    const data = await demo.request(name, args);
    data.posts = data.posts.slice(0, 1).map(post => ({ ...post, mine: true, authorName: 'Docente', authorIsTeacher: true })); return data;
  } });
  board.setContext(course); board.open(); await settle();
  const nodes = descendants(page.host), menu = nodes.find(node => node.className === 'cb-post-actions');
  const byline = nodes.find(node => node.className === 'cb-byline');
  assert.equal(byline.children.filter(node => node.textContent === 'Docente').length, 1);
  menu.open = true; menu.listeners.get('toggle')();
  const edit = descendants(menu).find(node => node.tag === 'button' && node.textContent === 'Editar');
  edit.listeners.get('click')();
  assert.equal(menu.open, false); assert.equal(page.root.listeners.size, 0);
  assert.equal(descendants(page.root.body).find(node => node.tag === 'dialog').open, true);
});
