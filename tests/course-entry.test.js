import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SKINS, SHIRTS, normalizeCode } from '../assets/model.js';

const avatarSVG = vm.runInNewContext(readFileSync(new URL('../assets/world.js', import.meta.url), 'utf8')
  .split('function rect(ctx')[0].replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
  + '\navatarSVG;', { SKINS, SHIRTS });

// Run the actual page controller with isolated browser storage and RPC responses.
// Canvas, DOM and timers are doubles; no production accounts or data are used.
const source = readFileSync(new URL('../assets/live.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const OLD = 'MAT-AAAAA-BBBBB-CCCCC';
const NEW = 'MAT-DDDDD-EEEEE-FFFFF';
const LAST_CODE = 'aula-student-course-code';
const HANDOFF = 'aula-course-code';
const SESSION = 'aula-student-session';

function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

class Element {
  constructor() {
    this.value = ''; this.textContent = ''; this.hidden = false;
    this.dataset = {}; this.style = {}; this.listeners = new Map(); this.children = [];
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector(selector) {
    const id = selector.startsWith('#') ? selector.slice(1) : '';
    const find = node => node.id === id ? node : node.children.map(find).find(Boolean);
    return this.children.map(find).find(Boolean) || null;
  }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  reportValidity() { return true; }
  close() { this.open = false; }
  showModal() { this.open = true; }
  dispatch(name, extra = {}) {
    return this.listeners.get(name)?.({ target: this, currentTarget: this, preventDefault() {}, ...extra });
  }
  click() { return this.dispatch('click'); }
}

async function boot({ submitted, remembered, signedIn = true, enroll, roomError } = {}) {
  const nodes = new Map();
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const fields = Object.fromEntries(['code', 'firstName', 'lastName', 'email', 'phone']
    .map(key => [key, new Element()]));
  get('#registration-form').elements = { namedItem: key => fields[key] };
  const steps = Object.keys(fields).map(key => Object.assign(new Element(), { dataset: { step: key } }));
  const tabs = ['aula', 'equipo', 'chat'].map(key => Object.assign(new Element(), { dataset: { roomTab: key } }));
  const localStorage = storage({ ...(remembered ? { [LAST_CODE]: remembered } : {}),
    ...(signedIn ? { [SESSION]: 'existing-private-session' } : {}) });
  const sessionStorage = storage(submitted ? { [HANDOFF]: submitted } : {});
  const calls = [];
  let signOutCount = 0;
  const context = vm.createContext({
    document: { querySelector: get, querySelectorAll: selector => selector === '.dialog-step' ? steps
      : selector === '[data-room-tab]' ? tabs : [], createElement: () => new Element(), addEventListener() {} },
    window: { addEventListener() {} }, localStorage, sessionStorage,
    configured: true, SKINS, SHIRTS, normalizeCode,
    matchMedia: () => ({ matches: true }),
    cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1,
    avatarSVG, drawWorld() {}, createParticipantPalette: () => new Map(),
    createRoomLayout: () => ({ rooms: [], width: 800, height: 560, spawn: { x: 400, y: 300 } }),
    studentSignedIn: () => !!localStorage.getItem(SESSION),
    studentSignOut: () => { signOutCount++; localStorage.removeItem(SESSION); },
    signInStudentAnonymously: async () => { localStorage.setItem(SESSION, 'existing-private-session'); },
    studentRpc: async (name, body) => {
      calls.push({ name, body: JSON.parse(JSON.stringify(body)) });
      if (name === 'enroll_student') {
        if (enroll) await enroll(body);
        return { course_id: 'course-fixture', course_name: 'Materia de prueba' };
      }
      if (name === 'my_profile') return { firstName: 'Ana', lastName: 'Prueba', topicId: 'existing-team', avatar: {} };
      if (name === 'course_room' && roomError) throw new Error(roomError);
      throw new Error('Unexpected RPC: ' + name);
    }
  });
  vm.runInContext(source, context, { filename: 'assets/live.js' });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  return { get, fields, calls, localStorage, sessionStorage, settle,
    state: expression => vm.runInContext(expression, context), signOutCount: () => signOutCount };
}

test('a newly entered code takes precedence over the remembered old code', async () => {
  const page = await boot({ submitted: NEW, remembered: OLD, enroll: ({ p_code }) => {
    if (p_code !== NEW) throw new Error('Materia no encontrada');
  } });
  assert.equal(page.calls[0].body.p_code, NEW);
  assert.equal(page.fields.code.value, NEW);
  assert.equal(page.localStorage.getItem(LAST_CODE), NEW);
  assert.equal(page.sessionStorage.getItem(HANDOFF), null);
  assert.equal(page.get('#room').dataset.stage, 'avatar');
  assert.equal(page.state('profile.topicId'), 'existing-team');
  assert.equal(page.localStorage.getItem(SESSION), 'existing-private-session');
});

test('reload resumes the recognized code with the existing student session', async () => {
  const page = await boot({ remembered: NEW });
  assert.equal(page.calls[0].body.p_code, NEW);
  assert.equal(page.get('#room').dataset.stage, 'avatar');
  assert.equal(page.signOutCount(), 0);
});

test('an obsolete remembered code exposes the code field and preserves the student identity', async () => {
  const page = await boot({ remembered: OLD, enroll: () => { throw new Error('Materia no encontrada'); } });
  assert.equal(page.localStorage.getItem(LAST_CODE), null);
  assert.equal(page.localStorage.getItem(SESSION), 'existing-private-session');
  assert.equal(page.signOutCount(), 0);
  assert.equal(page.state('questions[questionIndex]'), 'code');
  assert.equal(page.get('#registration-error').hidden, false);
  assert.match(page.get('#registration-error').textContent, /código/i);
});

test('a student entering a different subject can register with the submitted code', async () => {
  const page = await boot({ submitted: NEW, remembered: OLD, enroll: body => {
    if (!body.p_first_name) throw new Error('Revisa correo, nombre, apellido y teléfono');
  } });
  assert.equal(page.calls[0].body.p_code, NEW);
  assert.equal(page.get('#room').dataset.stage, 'registration');
  assert.equal(page.get('#registration-error').hidden, true);
  assert.equal(page.state('questions[questionIndex]'), 'firstName');
  Object.assign(page.fields.firstName, { value: 'Ana' });
  Object.assign(page.fields.lastName, { value: 'Prueba' });
  Object.assign(page.fields.email, { value: 'qa@example.invalid' });
  Object.assign(page.fields.phone, { value: '6000-0000' });
  page.get('#registration-form').dispatch('submit');
  await page.settle();
  assert.equal(page.calls.filter(call => call.name === 'enroll_student').at(-1).body.p_code, NEW);
  assert.equal(page.localStorage.getItem(LAST_CODE), NEW);
  assert.equal(page.get('#room').dataset.stage, 'avatar');
});

test('a first-time visitor is asked for their profile and keeps the submitted code', async () => {
  const page = await boot({ submitted: NEW, remembered: OLD, signedIn: false });
  assert.equal(page.calls.length, 0);
  assert.equal(page.fields.code.value, NEW);
  assert.equal(page.state('questions[questionIndex]'), 'firstName');
});

test('an invalid submitted code does not silently fall back to another subject', async () => {
  const page = await boot({ submitted: NEW, remembered: OLD, enroll: () => { throw new Error('Materia no encontrada'); } });
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0].body.p_code, NEW);
  assert.equal(page.localStorage.getItem(LAST_CODE), OLD);
  assert.equal(page.state('questions[questionIndex]'), 'code');
  assert.equal(page.signOutCount(), 0);
});

test('a temporary server failure does not remove a code or the student session', async () => {
  const page = await boot({ remembered: OLD, enroll: () => { throw new Error('Servicio temporalmente no disponible'); } });
  assert.equal(page.localStorage.getItem(LAST_CODE), OLD);
  assert.equal(page.localStorage.getItem(SESSION), 'existing-private-session');
  assert.match(page.get('#registration-error').textContent, /temporalmente/);
});

test('code normalization is consistent when entering directly in the classroom', async () => {
  const page = await boot({ signedIn: false });
  page.fields.code.value = ' mat-ddddd- eeeee-fffff ';
  page.get('#next-question').click();
  assert.equal(page.fields.code.value, NEW);
  assert.equal(page.state('questions[questionIndex]'), 'firstName');
});

test('woman avatar starts with visible long hair and pink, and lets the student save another outfit color', async () => {
  const page = await boot({ submitted: NEW });
  const choices = page.get('#presentation-options').children;
  assert.deepEqual(choices.map(button => button.children[0].textContent), ['Mujer', 'Hombre']);
  choices[0].click();
  assert.equal(page.state('look.presentation'), 'mujer');
  assert.equal(page.state('look.hair'), 'long');
  assert.equal(page.state('look.outfit'), 5);
  assert.equal(page.get('#shirt-options').children.length, 7);
  const woman = avatarSVG({ skin: 1, shirt: 0, outfit: 5, hair: 'long', presentation: 'mujer' });
  const man = avatarSVG({ skin: 1, shirt: 1, outfit: 1, hair: 'short', presentation: 'hombre' });
  assert.match(woman, /fill="#d8588f"/);
  assert.notEqual(woman, man);
  // The long locks are still visible at shoulder height on the finished sprite.
  const pixel = (svg, x, y) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]+)"\/>/g)]
    .filter(([, rx, ry, w, h]) => x >= +rx && x < +rx + +w && y >= +ry && y < +ry + +h)
    .at(-1)?.[5];
  assert.equal(pixel(woman, 4, 30), '#594735');
  assert.notEqual(pixel(man, 4, 30), '#594735');
  page.get('#shirt-options').children[6].click();
  assert.equal(page.state('look.outfit'), 6);
  assert.equal(page.state('look.shirt'), 0);
  page.get('#avatar-form').dispatch('submit');
  await page.settle();
  const saved = page.calls.find(call => call.name === 'save_student_avatar').body.p_avatar;
  assert.equal(saved.presentation, 'mujer');
  assert.equal(saved.hair, 'long');
  assert.equal(saved.outfit, 6);
  assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 256);
});

test('joining a team requires the red confirmation and allows going back', async () => {
  const page = await boot({ submitted: NEW });
  page.state('profile.topicId = null; profile.registrationOpen = true; courseId = "course-fixture";');
  const topic = { id: 'team-1', name: 'Grupo 1', members: [], capacity: 4 };
  page.state('topicPanel(' + JSON.stringify(topic) + ')');
  const dialog = page.get('#topic-dialog');
  const button = text => {
    const find = node => node.textContent === text ? node : node.children.map(find).find(Boolean);
    return dialog.children.map(find).find(Boolean);
  };
  button('Quiero este equipo').click();
  assert.equal(page.calls.filter(call => call.name === 'choose_topic').length, 0);
  assert.ok(dialog.querySelector('#join-confirm-title'));
  button('No, volver').click();
  assert.equal(page.calls.filter(call => call.name === 'choose_topic').length, 0);
  button('Quiero este equipo').click();
  button('Sí, unirme al equipo').click();
  await page.settle();
  assert.equal(page.calls.filter(call => call.name === 'choose_topic').length, 1);
});

test('a live student session leaves the classroom when the course is disabled', async () => {
  const page = await boot({ submitted: NEW, roomError: 'Materia deshabilitada' });
  page.state('show("room")');
  await page.state('refreshRoom()');
  assert.equal(page.get('#room').dataset.stage, 'registration');
  assert.equal(page.localStorage.getItem(LAST_CODE), null);
  assert.match(page.get('#registration-error').textContent, /ya no está disponible/);
});
