import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mountVideoGuide } from '../assets/video-guide.js';

class Events {
  listeners = new Map();
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); }
}
function browser(mobile = false) {
  const document = new Events(), window = new Events(), notices = [], nodes = [];
  const trigger = { isConnected: true, focuses: 0, focus() { this.focuses++; } };
  Object.assign(document, { hidden: false, documentElement: { dataset: {} }, body: { append: node => nodes.push(node) } });
  Object.assign(window, { matchMedia: () => ({ matches: mobile }), CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  } });
  document.addEventListener('aulajv:guide-visibility', event => notices.push(event.detail.open));
  document.createElement = tag => {
    if (tag !== 'dialog') return { textContent: '' };
    const elements = new Map();
    const plain = () => Object.assign(new Events(), { hidden: false, open: false, focus() {},
      replaceChildren(...values) { this.children = values; } });
    const track = plain(), list = plain(), video = plain();
    Object.assign(video, { pauses: 0, currentTime: 0, ended: false,
      classList: { toggle() {} }, pause() { this.pauses++; }, querySelector: () => track });
    const transcript = plain(); transcript.querySelector = () => list;
    elements.set('video', video); elements.set('.aula-guide-transcript', transcript);
    const dialog = Object.assign(new Events(), { open: false, attributes: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      querySelector(key) { if (!elements.has(key)) elements.set(key, plain()); return elements.get(key); },
      showModal() { this.open = true; }, close() { this.open = false; this.dispatchEvent({ type: 'close' }); }
    });
    return dialog;
  };
  return { document, window, trigger, notices, nodes, controller: mountVideoGuide(document, window),
    get dialog() { return nodes[0]; }, get video() { return nodes[0]?.querySelector('video'); } };
}

test('opening a page creates no player and requests no video', () => {
  const app = browser();
  assert.equal(app.nodes.length, 0);
  app.controller.open('missing', app.trigger);
  assert.equal(app.nodes.length, 0);
  assert.deepEqual(app.notices, []);
});
test('student help chooses the portrait guide on a phone, with native controls and captions', () => {
  const app = browser(true);
  app.controller.open('student', app.trigger);
  assert.equal(app.dialog.open, true);
  assert.match(app.video.src, /estudiantes-vertical\.mp4\?v=/);
  assert.match(app.video.poster, /estudiantes-vertical\.jpg\?v=/);
  assert.match(app.video.querySelector('track').src, /estudiantes\.vtt\?v=/);
  assert.match(app.dialog.innerHTML, /<video controls playsinline preload="none"/);
  assert.match(app.dialog.innerHTML, /kind="captions" srclang="es" label="Español" default/);
  assert.doesNotMatch(app.dialog.innerHTML, /autoplay/);
  assert.equal(app.document.documentElement.dataset.aulaGuideOpen, 'true');
  assert.equal(app.dialog.querySelector('.aula-guide-transcript').querySelector('ol').children.length, 6);
});
test('teacher help has its own video and steps, including the institutional check', () => {
  const app = browser(true);
  app.controller.open('teacher', app.trigger);
  assert.match(app.video.src, /docentes\.mp4\?v=/);
  assert.equal(app.dialog.querySelector('.aula-guide-mobile-file').hidden, true);
  const text = app.dialog.querySelector('.aula-guide-transcript').querySelector('ol').children.map(n => n.textContent).join(' ');
  assert.match(text, /plataforma institucional/);
  assert.match(text, /grupo de trabajo/);
  assert.match(text, /campanita/);
});
test('closing help pauses narration, releases room audio and restores focus', () => {
  const app = browser();
  app.controller.open('student', app.trigger);
  const pauses = app.video.pauses;
  app.dialog.close();
  assert.equal(app.video.pauses, pauses + 1);
  assert.equal(app.document.documentElement.dataset.aulaGuideOpen, undefined);
  assert.deepEqual(app.notices, [true, false]);
  assert.equal(app.trigger.focuses, 1);
});
test('changing tabs pauses the player; navigation closes it and leaves no room audio lock', () => {
  const app = browser();
  app.controller.open('student', app.trigger);
  const pauses = app.video.pauses;
  app.document.hidden = true;
  app.document.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(app.video.pauses, pauses + 1);
  assert.equal(app.dialog.open, true);
  app.window.dispatchEvent({ type: 'pagehide' });
  assert.equal(app.dialog.open, false);
  assert.equal(app.document.documentElement.dataset.aulaGuideOpen, undefined);
});
test('Escape pauses playback during cancel, before the native close event runs', () => {
  const app = browser(); app.controller.open('student', app.trigger);
  const pauses = app.video.pauses;
  app.dialog.dispatchEvent({ type: 'cancel' });
  assert.equal(app.video.pauses, pauses + 1);
});
test('reopening preserves position, and an ended guide starts again without autoplay', () => {
  const app = browser();
  app.controller.open('student', app.trigger);
  app.video.currentTime = 12;
  app.controller.open('student', app.trigger);
  assert.equal(app.nodes.length, 1);
  app.dialog.close();
  app.controller.open('student', app.trigger);
  assert.equal(app.video.currentTime, 12);
  app.dialog.close(); app.video.ended = true;
  app.controller.open('student', app.trigger);
  assert.equal(app.video.currentTime, 0);
});
test('a failed video leaves an error with usable alternatives and readable instructions', () => {
  const app = browser(); app.controller.open('student', app.trigger);
  app.video.dispatchEvent({ type: 'error' });
  assert.equal(app.dialog.querySelector('.aula-guide-error').hidden, false);
  assert.match(app.dialog.querySelector('.aula-guide-open-file').href, /estudiantes\.mp4/);
  assert.equal(app.dialog.querySelector('.aula-guide-transcript').querySelector('ol').children.length, 6);
});
test('every guide resource ships locally, including valid WebVTT files', () => {
  for (const name of ['estudiantes.mp4', 'estudiantes.jpg', 'estudiantes-vertical.mp4', 'estudiantes-vertical.jpg', 'docentes.mp4', 'docentes.jpg', 'estudiantes.vtt', 'docentes.vtt'])
    assert.ok(existsSync(new URL('../assets/tutorial/' + name, import.meta.url)), name);
  for (const name of ['estudiantes', 'docentes']) {
    const text = readFileSync(new URL('../assets/tutorial/' + name + '.vtt', import.meta.url), 'utf8');
    assert.match(text, /^WEBVTT\s/);
    assert.ok((text.match(/ --> /g) || []).length >= 7);
  }
});
