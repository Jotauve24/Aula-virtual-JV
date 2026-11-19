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
  querySelectorAll(selector) { return selector === '[data-post-action]' ? descendants(this).filter(node => 'postAction' in node.dataset) : []; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function dom() {
  const root = { createElement: tag => new Element(root, tag) };
  const host = new Element(root, 'div'); root.body = new Element(root, 'body'); root.body.append(host);
  return { root, host, win: { addEventListener() {}, URL: { revokeObjectURL() {} } } };
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
test('the community mural shows cross-course creations without team names or edit controls', async () => {
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
  assert.match(page.host.textContent, /Informática II/);
  assert.doesNotMatch(page.host.textContent, /3519608|Equipo de ejemplo|Martes/);
  assert.equal(nodes.find(node => node.tag === 'button' && node.textContent === 'Publicar contenido').hidden, true);
  assert.equal(nodes.filter(node => node.className === 'cb-post-actions').length, 0);
});
