import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SKINS, SHIRTS, normalizeCode } from '../assets/model.js';
import { memberSeat } from '../assets/world-layout.js';

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
    this.dataset = {}; this.style = { setProperty(name, value) { this[name] = value; } };
    this.listeners = new Map(); this.children = []; this.isConnected = true;
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

async function boot({ submitted, remembered, signedIn = true, enroll, roomError,
  profileFixture, roomFixture = [], sharedPresence, messages = [] } = {}) {
  const nodes = new Map();
  const get = selector => {
    if (selector.startsWith('#')) {
      for (const node of nodes.values()) {
        const nested = node.querySelector(selector);
        if (nested) return nested;
      }
    }
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
  const frames = [];
  let signOutCount = 0;
  const context = vm.createContext({
    document: { querySelector: get, querySelectorAll: selector => selector === '.dialog-step' ? steps
      : selector === '[data-room-tab]' ? tabs : [], createElement: () => new Element(), addEventListener() {} },
    window: { addEventListener() {} }, localStorage, sessionStorage,
    configured: true, SKINS, SHIRTS, normalizeCode, ATTACHMENT_ACCEPT: '.pdf',
    matchMedia: () => ({ matches: true }),
    cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1,
    avatarSVG, drawWorld: (_canvas, options) => { frames.push(options); },
    createParticipantPalette: () => () => '#456789',
    applyParticipantColor() {}, participantAvatar: name => Object.assign(new Element(), { textContent: name }),
    chatMessage: msg => Object.assign(new Element(), { textContent: msg.body }),
    roomTheme: () => ({ accent: '#456789', card: '#eef' }), isWalkable: () => true,
    memberSeat,
    createRoomLayout: count => ({ rooms: Array.from({ length: count }, (_, i) => ({
      x: 40 + i * 10, y: 40 + i * 25,
      arrival: { x: 400, y: 140 + i * 30 }, label: { x: 400, y: 100 + i * 30 }
    })), width: 800, height: 560, spawn: { x: 400, y: 300 } }),
    studentSignedIn: () => !!localStorage.getItem(SESSION),
    studentSignOut: () => { signOutCount++; localStorage.removeItem(SESSION); },
    signInStudentAnonymously: async () => { localStorage.setItem(SESSION, 'existing-private-session'); },
    studentRpc: async (name, body) => {
      calls.push({ name, body: JSON.parse(JSON.stringify(body)) });
      if (name === 'enroll_student') {
        if (enroll) await enroll(body);
        return { course_id: 'course-fixture', course_name: 'Materia de prueba' };
      }
      if (name === 'my_profile') return profileFixture || { firstName: 'Ana', lastName: 'Prueba', topicId: 'existing-team', avatar: {} };
      if (name === 'course_room' && roomError) throw new Error(roomError);
      if (name === 'course_room') return roomFixture;
      if (name === 'team_chat_read') return messages;
      if (name === 'classroom_presence_ping') {
        sharedPresence?.set(profileFixture.id, { id: profileFixture.id, name: profileFixture.firstName,
          avatar: profileFixture.avatar, x: body.p_x, y: body.p_y, direction: body.p_direction });
        return [...(sharedPresence?.values() || [])].filter(student => student.id !== profileFixture.id);
      }
      throw new Error('Unexpected RPC: ' + name);
    }
  });
  vm.runInContext(source, context, { filename: 'assets/live.js' });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  return { get, fields, calls, frames, localStorage, sessionStorage, settle,
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

test('two connected students appear together in the same classroom', async () => {
  const sharedPresence = new Map();
  const student = (id, firstName) => ({ id, firstName, lastName: 'Prueba', topicId: null,
    avatar: { skin: 1, shirt: 0, hair: 'long' } });
  const ana = await boot({ submitted: NEW, profileFixture: student('student-a', 'Ana'), sharedPresence });
  const luis = await boot({ submitted: NEW, profileFixture: student('student-b', 'Luis'), sharedPresence });
  await ana.state('refreshPresence()');
  assert.equal(ana.get('#online-count').textContent, 'En el aula: 2');
  assert.equal(luis.get('#online-count').textContent, 'En el aula: 2');
  assert.equal(ana.frames.at(-1).peers[0].name, 'Luis');
  assert.equal(luis.frames.at(-1).peers[0].name, 'Ana');
  assert.equal(ana.frames.at(-1).player.direction, 'down');
});

test('assigned classmates stay seated while offline and return at their own table', async () => {
  const sharedPresence = new Map();
  const roomFixture = [{ id: 'team-1', name: 'Exploradores', position: 1, capacity: 3,
    members: [
      { id: 'student-c', name: 'Celia Ruiz', avatar: { skin: 0, shirt: 2, hair: 'long' } },
      { id: 'student-a', name: 'Ana Sol', avatar: { skin: 1, shirt: 0, hair: 'curly' } },
      { id: 'student-b', name: 'Luis Mora', avatar: { skin: 2, shirt: 1, hair: 'short' } }
    ] }];
  const profile = (id, firstName) => ({ id, firstName, lastName: 'Prueba',
    topicId: 'team-1', avatar: { skin: 1, shirt: 0, hair: 'curly' } });
  const ana = await boot({ submitted: NEW, profileFixture: profile('student-a', 'Ana'),
    roomFixture, sharedPresence });
  assert.equal(ana.get('#room').dataset.stage, 'room');
  assert.equal(ana.frames.at(-1).seated.length, 2);
  assert.deepEqual(ana.frames.at(-1).seated.map(member => member.id), ['student-b', 'student-c']);
  assert.equal(ana.frames.at(-1).player.x, 151);
  assert.equal(ana.frames.at(-1).player.y, 210);
  const luis = await boot({ submitted: NEW, profileFixture: profile('student-b', 'Luis'),
    roomFixture, sharedPresence });
  await ana.state('refreshPresence()');
  assert.equal(ana.frames.at(-1).seated.length, 1);
  assert.equal(ana.frames.at(-1).seated[0].id, 'student-c');
  assert.equal(ana.frames.at(-1).peers[0].id, 'student-b');
  assert.equal(luis.frames.at(-1).player.x, 229);
  sharedPresence.delete('student-b');
  await ana.state('refreshPresence()');
  assert.deepEqual(ana.frames.at(-1).seated.map(member => member.id), ['student-b', 'student-c']);
});

test('unread alert counts teammates, survives background refresh and clears only when chat is opened', async () => {
  const messages = [
    { id: 1, senderId: 'self', body: 'Hola', mine: true },
    { id: 2, senderId: 'other', body: '¿Empezamos?', mine: false }
  ];
  const profileFixture = { id: 'student-a', firstName: 'Ana', lastName: 'Prueba',
    topicId: 'team-1', avatar: { skin: 1 } };
  const roomFixture = [{ id: 'team-1', name: 'Equipo 1', position: 1,
    members: [{ id: 'student-a', name: 'Ana Prueba', mine: true }], capacity: 5 }];
  const page = await boot({ submitted: NEW, profileFixture, roomFixture, messages });
  assert.equal(page.get('#chat-unread').textContent, '1');
  assert.equal(page.get('#chat-alert').hidden, false);
  assert.match(page.state('document.title'), /^\(1\) Mensajes/);
  await page.state('refreshChat()');
  assert.equal(page.get('#chat-alert').hidden, false);
  page.get('#chat-alert-open').click();
  await page.settle();
  assert.equal(page.get('#chat-alert').hidden, true);
  assert.equal(page.get('#chat-unread').hidden, true);
  assert.equal(page.localStorage.getItem('aula-chat-seen:course-fixture:student-a:team-1'), '2');
  page.state('setRoomTab("aula")');
  messages.push({ id: 3, senderId: 'other', body: 'Mensaje nuevo', mine: false });
  await page.state('refreshChat()');
  assert.equal(page.get('#chat-unread').textContent, '1');
  messages.push({ id: 4, senderId: 'self', body: 'Yo también', mine: true });
  await page.state('refreshChat()');
  assert.equal(page.get('#chat-unread').textContent, '1');
});
