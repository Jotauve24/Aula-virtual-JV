import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const shellCode = readFileSync(new URL('../assets/page-shell.js', import.meta.url), 'utf8');
const embedCode = readFileSync(new URL('../assets/embed.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const ORIGIN = 'https://aula.example';
const BASE = ORIGIN + '/Aula-virtual-JV/';
class Events {
  listeners = new Map();
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  async fire(name, event = {}) { for (const fn of [...(this.listeners.get(name) || [])]) await fn(event); }
}
const classes = () => { const values = new Set(); return { add: value => values.add(value), contains: value => values.has(value) }; };
function historyAt(location) {
  const calls = [];
  return { calls, replaceState(state, title, path) { calls.push(path); location.href = new URL(path, location.href).href; },
    pushState(state, title, path) { calls.push(path); location.href = new URL(path, location.href).href; } };
}
function shell({ content = false } = {}) {
  const location = new URL(BASE), history = historyAt(location), messages = [], children = [];
  const document = Object.assign(new Events(), { readyState: 'complete',
    currentScript: { src: BASE + 'assets/page-shell.js?v=0.15.0' }, title: 'AulaVirtualJv',
    documentElement: { classList: classes() }, querySelector: () => null,
    querySelectorAll: () => [], body: { replaceChildren: (...nodes) => { children.splice(0, children.length, ...nodes); } },
    createElement: tag => {
      assert.equal(tag, 'iframe');
      const attrs = new Map(), frame = Object.assign(new Events(), {
        setAttribute: (key, value) => attrs.set(key, value), getAttribute: key => attrs.get(key),
        hasAttribute: key => attrs.has(key), contentWindow: { location: new URL(BASE),postMessage:(data,origin)=>messages.push({data,origin}) },
        contentDocument: { title: 'AulaVirtualJv',body:{dataset:{}} }, attrs
      });
      return frame;
    }
  });
  const parent = { postMessage: (data, origin) => messages.push({ data, origin }) };
  const window = Object.assign(new Events(), { document, history, location, parent,
    frameElement: content ? { hasAttribute: key => key === 'data-aula-content' } : null });
  window.self = window; window.top = window;
  const serviceWorker=new Events();
  const context = vm.createContext({ document, window, history, location, URL,navigator:{serviceWorker} });
  vm.runInContext(shellCode, context);
  const frame = children[0];
  return { window, document, location, history, messages, children, frame, context,serviceWorker,
    async load(path, title = 'Otra pantalla') { frame.contentWindow.location = new URL(path, BASE); frame.contentDocument.title = title; await frame.fire('load'); },
    async notify(overrides = {}) { await window.fire('message', { origin: ORIGIN, source: frame.contentWindow, data: { type: 'aula:location' }, ...overrides }); } };
}
function fullscreenDocument() {
  const doc = new Events(); doc.enters = 0; doc.exits = 0; doc.fullscreenElement = null;
  doc.documentElement = { classList: classes(), async requestFullscreen() {
    assert.equal(this, doc.documentElement); doc.enters++; doc.fullscreenElement = this;
    await doc.fire('fullscreenchange');
  } };
  doc.exitFullscreen = async function () { assert.equal(this, doc); doc.exits++; doc.fullscreenElement = null; await doc.fire('fullscreenchange'); };
  return doc;
}
function contentControls(target = fullscreenDocument(), { icon = false, hosted = true, embedded = false } = {}) {
  const path = { value: '', setAttribute(name, value) { assert.equal(name, 'd'); this.value = value; } };
  const button = Object.assign(new Events(), { attrs: new Map(), textContent: 'Ampliar aula',
    setAttribute(name, value) { this.attrs.set(name, value); },
    querySelector(selector) { return icon ? selector === 'svg' ? {} : path : null; } });
  const document = hosted ? fullscreenDocument() : target;
  document.querySelector = () => button;
  const attrs = new Map([['data-aula-content', ''], ['data-aula-embedded', String(embedded)]]);
  const top = { location: { href: BASE } }, opened = [];
  const window = Object.assign(new Events(), { document, top, parent: { document: target },
    frameElement: hosted ? { hasAttribute: key => attrs.has(key), getAttribute: key => attrs.get(key) } : null,
    open: (...args) => opened.push(args) });
  window.self = window;
  const context = vm.createContext({ window, document, location: new URL(BASE), Error });
  const api = vm.runInContext(embedCode + '\n({openAuthPage})', context);
  return { target, window, document, button, path, opened, api };
}

test('all internal pages live in one accessible frame with fullscreen permission', () => {
  const page = shell();
  assert.equal(page.document.documentElement.classList.contains('aula-shell'), true);
  assert.equal(page.children.length, 1);
  assert.equal(page.frame.src, BASE);
  assert.equal(page.frame.title, 'Contenido de AulavirtualJV');
  assert.equal(page.frame.getAttribute('allow'), 'fullscreen');
  assert.equal(page.frame.hasAttribute('allowfullscreen'), true);
  assert.equal(page.frame.getAttribute('data-aula-embedded'), 'false');
});

test('navigation keeps the fullscreen owner and frame while updating the real address and title', async () => {
  const page = shell(); const frame = page.frame, root = page.document.documentElement;
  page.document.fullscreenElement = root;
  for (const path of ['docente.html', 'docente-sala.html?materia=fictional', 'live.html?login=1', './']) {
    await page.load(path, path);
    assert.equal(page.children[0], frame);
    assert.equal(page.document.fullscreenElement, root);
    assert.equal(page.location.href, new URL(path, BASE).href);
    assert.equal(page.document.title, path);
  }
});

test('route notifications accept only the current same-origin frame and never trust a message URL', async () => {
  const page = shell(); page.frame.contentWindow.location = new URL('live.html?login=1', BASE);
  await page.notify({ origin: 'https://elsewhere.example' });
  await page.notify({ source: {} });
  assert.equal(page.location.href, BASE);
  await page.notify({ data: { type: 'aula:location', url: 'https://elsewhere.example/' } });
  assert.equal(page.location.href, BASE + 'live.html?login=1');
  await page.load('https://elsewhere.example/');
  assert.equal(page.location.href, BASE + 'live.html?login=1');
  await page.load('assets/not-a-page.html');
  assert.equal(page.location.href, BASE + 'live.html?login=1');
});

test('callback cleanup inside the child also removes its fragment from the address bar', async () => {
  const page = shell();
  await page.load('live.html?student_auth=login#access_token=fictional&refresh_token=fictional');
  page.frame.contentWindow.location.hash = '';
  await page.notify();
  assert.equal(page.location.href, BASE + 'live.html?student_auth=login');
});

test('a content page never creates another shell and forwards native history changes without a URL payload', async () => {
  const page = shell({ content: true });
  assert.equal(page.children.length, 0);
  assert.equal(page.document.documentElement.classList.contains('aula-shell'), false);
  page.history.replaceState(null, '', 'live.html?login=1');
  assert.equal(page.messages.at(-1).origin, ORIGIN);
  assert.deepEqual(JSON.parse(JSON.stringify(page.messages.at(-1).data)), { type: 'aula:location' });
  await page.window.fire('hashchange');
  assert.equal(page.messages.length >= 3, true);
});

test('ampliar targets the persistent document and a newly loaded page immediately offers reducir', async () => {
  const target = fullscreenDocument(), first = contentControls(target, { icon: true });
  await first.button.fire('click');
  assert.equal(target.enters, 1);
  assert.equal(first.document.enters, 0);
  assert.equal(first.button.attrs.get('aria-label'), 'Reducir aula');
  assert.match(first.path.value, /M3 8/);
  await first.window.fire('pagehide');
  assert.equal(target.listeners.get('fullscreenchange').size, 0);
  const second = contentControls(target);
  assert.equal(second.button.textContent, 'Reducir aula');
  assert.equal(second.button.attrs.get('aria-pressed'), 'true');
  assert.equal(target.enters, 1, 'new pages must not make another fullscreen request');
  await second.button.fire('click');
  assert.equal(target.exits, 1);
  assert.equal(second.button.textContent, 'Ampliar aula');
});

test('Esc and history restoration refresh the control without forcing fullscreen back on', async () => {
  const target = fullscreenDocument(), page = contentControls(target);
  await page.button.fire('click');
  target.fullscreenElement = null; await target.fire('fullscreenchange');
  assert.equal(page.button.attrs.get('aria-label'), 'Ampliar aula');
  assert.equal(target.enters, 1);
  await page.window.fire('pagehide');
  target.fullscreenElement = target.documentElement;
  await page.window.fire('pageshow');
  assert.equal(page.button.attrs.get('aria-label'), 'Reducir aula');
  assert.equal(target.enters, 1);
});

test('embedded layout is retained only for an externally embedded host', () => {
  assert.equal(contentControls(undefined, { embedded: false }).document.documentElement.classList.contains('is-embedded'), false);
  assert.equal(contentControls(undefined, { embedded: true }).document.documentElement.classList.contains('is-embedded'), true);
});

test('a denied fullscreen request keeps the existing open-apart fallback', async () => {
  const target = fullscreenDocument(); target.documentElement.requestFullscreen = async () => { throw new Error('Denied'); };
  const page = contentControls(target);
  await page.button.fire('click');
  assert.deepEqual(page.opened, [[BASE, '_blank', 'noopener']]);
  assert.equal(page.button.attrs.get('aria-label'), 'Ampliar aula');
});

test('standalone legacy content still expands its own document', async () => {
  const target = fullscreenDocument(), page = contentControls(target, { hosted: false });
  await page.button.fire('click'); assert.equal(target.enters, 1);
  await page.button.fire('click'); assert.equal(target.exits, 1);
});

test('external authentication leaves the content frame and uses the browser document', () => {
  const page = contentControls(); const url = 'https://auth.example/authorize';
  page.api.openAuthPage(url);
  assert.equal(page.window.top.location.href, url);
  assert.equal(page.opened.length, 0);
});


test('real student callbacks keep their original session scope and notify the host after scrubbing tokens',()=>{
  const page=shell({content:true});
  page.location.href=BASE+'live.html?student_auth=login#access_token=fictional-access&refresh_token=fictional-refresh&expires_in=3600';
  const saved=new Map(),temporary=new Map();
  const storage=data=>({getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)});
  Object.assign(page.context,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
    localStorage:storage(saved),sessionStorage:storage(temporary),URLSearchParams});
  const client=readFileSync(new URL('../assets/supabase-client.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  vm.runInContext(client,page.context);
  assert.equal(JSON.parse(saved.get('aula-student-session')).access_token,'fictional-access');
  assert.equal(saved.has('aula-supabase-session'),false);
  assert.equal(page.location.hash,'');
  assert.equal(page.location.search,'?student_auth=login');
  assert.deepEqual(JSON.parse(JSON.stringify(page.messages.at(-1).data)),{type:'aula:location'});
});

test('Google keeps the existing teacher redirect URL while leaving the internal frame',()=>{
  const location=new URL(BASE+'docente.html'),data=new Map(),opened=[];
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const context=vm.createContext({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
    localStorage:storage,sessionStorage:storage,location,history:{replaceState(){}},URL,URLSearchParams,
    openAuthPage:url=>opened.push(new URL(url))});
  const client=readFileSync(new URL('../assets/supabase-client.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const api=vm.runInContext(client+'\n({signInWithGoogle})',context);api.signInWithGoogle();
  assert.equal(opened[0].origin,'https://example.supabase.co');
  assert.equal(opened[0].pathname,'/auth/v1/authorize');
  assert.equal(opened[0].searchParams.get('provider'),'google');
  assert.equal(opened[0].searchParams.get('redirect_to'),BASE+'docente.html');
});

test('las notificaciones abren el chat de la misma materia conservando el documento y el borrador',async()=>{
 const page=shell(),courseId='11111111-1111-4111-8111-111111111111',topicId='22222222-2222-4222-8222-222222222222';
 await page.load('live.html');page.frame.contentDocument.body.dataset={chatCourse:courseId,chatTopic:topicId};
 const src=page.frame.src;
 await page.serviceWorker.fire('message',{source:{scriptURL:BASE+'chat-worker.js'},data:{type:'aula:chat-notification',courseId,topicId}});
 assert.equal(page.frame.src,src);assert.equal(page.children[0],page.frame);
 assert.equal(page.messages.at(-1).data.topicId,topicId);assert.equal(page.messages.at(-1).origin,ORIGIN);
});
test('una notificación de otra materia usa una ruta local y rechaza workers o identificadores ajenos',async()=>{
 const page=shell(),courseId='11111111-1111-4111-8111-111111111111',topicId='22222222-2222-4222-8222-222222222222';
 const message={source:{scriptURL:BASE+'chat-worker.js'},data:{type:'aula:chat-notification',courseId,topicId,url:'https://evil.invalid'}};
 await page.serviceWorker.fire('message',{...message,source:{scriptURL:'https://evil.invalid/sw.js'}});assert.equal(page.frame.src,BASE);
 await page.serviceWorker.fire('message',{...message,data:{...message.data,courseId:'https://evil.invalid'}});assert.equal(page.frame.src,BASE);
 await page.serviceWorker.fire('message',message);
 assert.equal(page.frame.src,BASE+'live.html?resume_id='+courseId+'&chat='+topicId);
});
