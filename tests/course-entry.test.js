import { normalizeStudentDocument, DOCUMENT_COUNTRIES } from '../assets/student-document.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SKINS, SHIRTS, normalizeCode } from '../assets/model.js';
import { memberSeat, createRoomLayout, isWalkable, findPath, canWalkSegment } from '../assets/world-layout.js';
import { createIncomingMessageTracker } from '../assets/chat-notification.js';

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
    this.classList = { add() {}, remove() {} }; this.offsetWidth = 0;
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
  profileFixture, roomFixture = [], sharedPresence, messages = [], chatFailure, presenceFailure,
  motionReduced = true, realLayout = false, emailHint = false, phoneHint = false, phoneHintError = false, documentRequired = false, setDocument, search = '' } = {}) {
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
  const fields = Object.fromEntries(['code', 'firstName', 'lastName', 'documentNumber', 'documentType', 'documentCountry', 'documentPrefix', 'documentTome', 'documentEntry', 'email', 'phone']
    .map(key => [key, new Element()]));
  fields.documentType.value='cedula'; fields.documentPrefix.value='8'; fields.documentTome.value='123'; fields.documentEntry.value='45';
  get('#registration-form').elements = { namedItem: key => fields[key] };
  get('#registration-form').reset = () => Object.values(fields).forEach(field=>{field.value='';});
  const steps = Object.keys(fields).map(key => Object.assign(new Element(), { dataset: { step: key } }));
  const tabs = ['aula', 'equipo', 'chat'].map(key => Object.assign(new Element(), { dataset: { roomTab: key } }));
  const localStorage = storage({ ...(remembered ? { [LAST_CODE]: remembered } : {}),
    ...(signedIn ? { [SESSION]: 'existing-private-session' } : {}) });
  const sessionStorage = storage(submitted ? { [HANDOFF]: submitted } : {});
  const calls = [];
  const frames = [];
  const pendingFrames = new Map(), documentListeners = new Map(), windowListeners = new Map();
  let frameId = 0;
  const motionPreference = Object.assign(new Element(), { matches: motionReduced });
  let signOutCount = 0;
  let clock = Date.now();
  const profileData = profileFixture || { firstName: 'Ana', lastName: 'Prueba', topicId: 'existing-team', avatar: {} };
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const presenceNodes = () => [...new Set([...nodes.values()].flatMap(descendants))]
    .filter(node => Object.hasOwn(node.dataset, 'memberPresence'));
  class PageDate extends Date { static now() { return clock; } }
  const context = vm.createContext({
    document: { querySelector: get, querySelectorAll: selector => selector === '.dialog-step' ? steps
      : selector === '[data-room-tab]' ? tabs : selector === '[data-member-presence]' ? presenceNodes() : [], createElement: () => new Element(), hidden: false,
      addEventListener: (name, handler) => documentListeners.set(name, handler), dispatchEvent() {} },
    window: { addEventListener: (name, handler) => windowListeners.set(name, handler) }, localStorage, sessionStorage, Date: PageDate,
    location:{search,pathname:'/Aula-virtual-JV/live.html'},history:{replaceState(){}},confirm:()=>true,URLSearchParams,
    configured: true, SKINS, SHIRTS, normalizeCode, ATTACHMENT_ACCEPT: '.pdf',
    matchMedia: () => motionPreference,
    cancelAnimationFrame: id => pendingFrames.delete(id),
    requestAnimationFrame: handler => { pendingFrames.set(++frameId, handler); return frameId; },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    CustomEvent: class { constructor(type,options){this.type=type;this.detail=options?.detail;} },
    createIncomingMessageTracker, normalizeStudentDocument, DOCUMENT_COUNTRIES,
    avatarSVG, drawWorld: (_canvas, options) => { frames.push(options); },
    createParticipantPalette: () => () => '#456789',
    applyParticipantColor() {}, participantAvatar: name => Object.assign(new Element(), { textContent: name }),
    chatMessage: msg => Object.assign(new Element(), { textContent: msg.body }),
    downloadTeamFile() {},
    roomTheme: () => ({ accent: '#456789', card: '#eef' }), isWalkable: realLayout ? isWalkable : () => true,
    findPath: realLayout ? findPath : (_from, to) => [to], canWalkSegment: realLayout ? canWalkSegment : () => true,
    memberSeat,
    createRoomLayout: realLayout ? createRoomLayout : count => ({ rooms: Array.from({ length: count }, (_, i) => ({
      x: 40 + i * 10, y: 40 + i * 25,
      arrival: { x: 400, y: 140 + i * 30 }, label: { x: 400, y: 100 + i * 30 }
    })), width: 800, height: 560, spawn: { x: 400, y: 300 } }),
    studentSignedIn: () => !!localStorage.getItem(SESSION),
    studentSignOut: () => { signOutCount++; localStorage.removeItem(SESSION); },
    signInStudentAnonymously: async () => { localStorage.setItem(SESSION, 'existing-private-session'); },
    studentRpc: async (name, body) => {
      calls.push({ name, body: JSON.parse(JSON.stringify(body)) });
      if (name === 'student_registration_email_hint') return emailHint;
      if (name === 'student_registration_phone_hint') { if(phoneHintError) throw Error('Servicio no disponible'); return typeof phoneHint==='function'?phoneHint(body):phoneHint; }
      if (name === 'enroll_student_document') {
        if (enroll) await enroll(body);
        return { course_id: 'course-fixture', course_name: 'Materia de prueba' };
      }
      if (name === 'student_document_status') return {required:documentRequired};
      if (name === 'student_set_document') {if(setDocument) await setDocument(body); documentRequired=false; return;}
      if (name === 'my_profile') return profileData;
      if (name === 'save_student_avatar') { profileData.avatar = body.p_avatar; return; }
      if (name === 'choose_topic') {
        profileData.topicId = body.p_topic_id;
        const team = roomFixture.find(row => row.id === body.p_topic_id);
        if (team && !team.members.some(member => member.id === profileData.id))
          team.members.push({ id: profileData.id, name: profileData.firstName + ' ' + profileData.lastName,
            mine: true, avatar: profileData.avatar });
        return;
      }
      if (name === 'course_room' && roomError) throw new Error(roomError);
      if (name === 'course_room') return JSON.parse(JSON.stringify(roomFixture));
      if (name === 'team_chat_read') { if (chatFailure?.()) throw new Error('Conexión temporalmente no disponible'); return messages; }
      if (name === 'classroom_presence_ping') {
        if (presenceFailure?.()) throw new Error('Conexión temporalmente no disponible');
        sharedPresence?.set(profileData.id, { id: profileData.id, name: profileData.firstName,
          avatar: profileData.avatar, x: body.p_x, y: body.p_y, direction: body.p_direction });
        return [...(sharedPresence?.values() || [])].filter(student => student.id !== profileData.id);
      }
      throw new Error('Unexpected RPC: ' + name);
    }
  });
  vm.runInContext(source, context, { filename: 'assets/live.js' });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  return { get, fields, calls, frames, localStorage, sessionStorage, settle, advanceTime: ms => { clock += ms; },
    tick: (ms = 100) => { clock += ms; const callbacks = [...pendingFrames.values()]; pendingFrames.clear(); callbacks.forEach(callback => callback(clock)); },
    pendingFrameCount: () => pendingFrames.size,
    visibility: hidden => { context.document.hidden = hidden; documentListeners.get('visibilitychange')?.(); },
    motion: reduced => { motionPreference.matches = reduced; motionPreference.dispatch('change'); },
    leavePage: () => windowListeners.get('pagehide')?.(),
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
test('the explicit recovery entry does not start a classroom in parallel',async()=>{
  const page=await boot({remembered:NEW,search:'?login=1'});
  assert.equal(page.calls.length,0);
  assert.equal(page.get('#room').dataset.stage,'registration');
});
test('student logout clears obsolete resume and recovery shortcuts along with the session',async()=>{
  const page=await boot({remembered:NEW});
  page.localStorage.setItem('aula-student-resume-id','11111111-1111-4111-8111-111111111111');
  page.localStorage.setItem('aula-student-recovery-code',OLD);
  await page.get('#logout').click();
  assert.equal(page.localStorage.getItem('aula-student-resume-id'),null);
  assert.equal(page.localStorage.getItem('aula-student-recovery-code'),null);
  assert.equal(page.localStorage.getItem(SESSION),null);
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
  assert.equal(page.calls.filter(call => call.name === 'enroll_student_document').at(-1).body.p_code, NEW);
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

test('disconnected members sit at their team and connected students appear only once', async () => {
  const sharedPresence = new Map();
  let presenceFails = false;
  const roomFixture = [{ id: 'team-1', name: 'Exploradores', position: 1, capacity: 3,
    members: [
      { id: 'student-c', name: 'Celia Ruiz', avatar: { skin: 0, shirt: 2, outfit: 5, hair: 'long' } },
      { id: 'student-a', name: 'Ana Sol', avatar: { skin: 1, shirt: 0, hair: 'curly' } },
      { id: 'student-b', name: 'Luis Mora', avatar: { skin: 2, shirt: 1, hair: 'short' } }
    ] }];
  const profile = (id, firstName) => ({ id, firstName, lastName: 'Prueba',
    topicId: 'team-1', avatar: { skin: 1, shirt: 0, hair: 'curly' } });
  const ana = await boot({ submitted: NEW, profileFixture: profile('student-a', 'Ana'),
    roomFixture, sharedPresence, presenceFailure: () => presenceFails });
  assert.equal(ana.get('#room').dataset.stage, 'room');
  assert.deepEqual(Array.from(ana.frames.at(-1).seated, member => member.id), ['student-b', 'student-c']);
  assert.equal(ana.frames.at(-1).seated[1].avatar.outfit, 5);
  assert.equal(ana.frames.at(-1).peers.length, 0);
  assert.equal(ana.frames.at(-1).player.x, 151);
  assert.equal(ana.frames.at(-1).player.y, 210);
  const luis = await boot({ submitted: NEW, profileFixture: profile('student-b', 'Luis'),
    roomFixture, sharedPresence });
  await ana.state('refreshPresence()');
  assert.deepEqual(Array.from(ana.frames.at(-1).seated, member => member.id), ['student-c']);
  assert.equal(ana.frames.at(-1).seated[0].seatIndex, 2);
  assert.equal(ana.frames.at(-1).peers.length, 1);
  assert.equal(ana.frames.at(-1).peers[0].id, 'student-b');
  assert.equal(luis.frames.at(-1).player.x, 229);
  sharedPresence.delete('student-b');
  await ana.state('refreshPresence()');
  assert.equal(ana.frames.at(-1).peers.length, 0);
  assert.deepEqual(Array.from(ana.frames.at(-1).seated, member => member.id), ['student-b', 'student-c']);
  roomFixture[0].members = roomFixture[0].members.filter(member => member.id !== 'student-c');
  await ana.state('refreshRoom()');
  assert.deepEqual(Array.from(ana.frames.at(-1).seated, member => member.id), ['student-b']);
  presenceFails = true;
  await ana.state('refreshPresence()');
  assert.equal(ana.frames.at(-1).seated.length, 0, 'unknown presence must not mark people as offline');
  presenceFails = false;
  await ana.state('refreshPresence()');
  assert.deepEqual(Array.from(ana.frames.at(-1).seated, member => member.id), ['student-b']);
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

test('editing the avatar can be cancelled or saved without losing the position or tab', async () => {
  const profileFixture = { id: 'student-a', firstName: 'Ana', lastName: 'Prueba', topicId: 'team-1',
    avatar: { skin: 1, shirt: 1, outfit: 1, hair: 'long', presentation: 'mujer' } };
  const roomFixture = [{ id: 'team-1', name: 'Arquitectura', position: 1, capacity: 3,
    members: [{ id: 'student-a', name: 'Ana Prueba', mine: true, avatar: profileFixture.avatar }] }];
  const page = await boot({ submitted: NEW, profileFixture, roomFixture });
  page.state('player.x = 410; player.y = 340; setRoomTab("equipo");');
  page.get('#edit-avatar').click();
  assert.equal(page.get('#room').dataset.stage, 'avatar');
  assert.equal(page.get('#cancel-avatar').hidden, false);
  page.get('#shirt-options').children[5].click();
  page.get('#cancel-avatar').click();
  assert.equal(page.get('#room').dataset.stage, 'room');
  assert.equal(page.state('look.outfit'), 1);
  assert.equal(page.state('activeTab'), 'equipo');
  assert.equal(page.state('player.x'), 410);
  assert.equal(page.calls.filter(call => call.name === 'save_student_avatar').length, 0);
  page.get('#edit-avatar').click();
  page.get('#shirt-options').children[6].click();
  page.get('#avatar-form').dispatch('submit');
  await page.settle();
  assert.equal(page.get('#room').dataset.stage, 'room');
  assert.equal(page.state('activeTab'), 'equipo');
  assert.equal(page.state('player.x'), 410);
  assert.equal(page.state('player.y'), 340);
  assert.equal(page.calls.find(call => call.name === 'save_student_avatar').body.p_avatar.outfit, 6);
});

test('an expired connection clears stale peers and recovers the live count', async () => {
  let failing = false;
  const sharedPresence = new Map();
  const student = (id, firstName) => ({ id, firstName, lastName: 'Prueba', topicId: null,
    avatar: { skin: 1, shirt: 1, hair: 'short' } });
  const ana = await boot({ submitted: NEW, profileFixture: student('student-a', 'Ana'),
    sharedPresence, presenceFailure: () => failing });
  const luis = await boot({ submitted: NEW, profileFixture: student('student-b', 'Luis'), sharedPresence });
  await ana.state('refreshPresence()');
  assert.equal(ana.frames.at(-1).peers.length, 1);
  failing = true; ana.advanceTime(16000);
  await ana.state('refreshPresence()');
  assert.equal(ana.frames.at(-1).peers.length, 0);
  assert.equal(ana.get('#online-count').textContent, 'Reconectando…');
  failing = false;
  await luis.state('refreshPresence()');
  await ana.state('refreshPresence()');
  assert.equal(ana.frames.at(-1).peers.length, 1);
  assert.equal(ana.get('#online-count').dataset.state, 'live');
  assert.equal(ana.get('#online-count').textContent, 'En el aula: 2');
});

test('a failed chat refresh preserves the loaded history and clears feedback on recovery', async () => {
  let failing = false;
  const profileFixture = { id: 'student-a', firstName: 'Ana', lastName: 'Prueba', topicId: 'team-1', avatar: { skin: 1 } };
  const roomFixture = [{ id: 'team-1', name: 'Equipo 1', position: 1, capacity: 3,
    members: [{ id: 'student-a', name: 'Ana Prueba', mine: true }] }];
  const page = await boot({ submitted: NEW, profileFixture, roomFixture,
    messages: [{ id: 1, senderId: 'other', body: 'Nos vemos en el aula.', mine: false }], chatFailure: () => failing });
  const box = page.get('#team-chat-messages');
  const history = box.children.slice();
  assert.equal(history[0].textContent, 'Nos vemos en el aula.');
  failing = true;
  await page.state('refreshChat()');
  assert.deepEqual(box.children, history);
  assert.equal(page.get('#chat-connection-status').hidden, false);
  failing = false;
  await page.state('refreshChat()');
  assert.deepEqual(box.children, history);
  assert.equal(page.get('#chat-connection-status').hidden, true);
});

test('a confirmed team choice updates membership and opens the team chat', async () => {
  const profileFixture = { id: 'student-a', firstName: 'Ana', lastName: 'Prueba', topicId: null,
    registrationOpen: true, avatar: { skin: 1 } };
  const roomFixture = [{ id: 'team-1', name: 'Arquitectura', position: 1, capacity: 3, members: [] }];
  const page = await boot({ submitted: NEW, profileFixture, roomFixture });
  page.state('topicPanel(topics[0])');
  const click = label => {
    const find = node => node.textContent === label ? node : node.children.map(find).find(Boolean);
    const button = page.get('#topic-dialog').children.map(find).find(Boolean);
    assert.ok(button, label); button.click();
  };
  click('Quiero este equipo'); click('Sí, unirme al equipo');
  await page.settle();
  assert.equal(page.state('profile.topicId'), 'team-1');
  assert.equal(page.get('#group-badge').textContent, 'Tu equipo: Arquitectura');
  assert.equal(page.get('#team-chat-host').hidden, false);
  assert.equal(roomFixture[0].members[0].id, 'student-a');
});

test('ambient creatures animate with an idle student and stop outside the visible classroom', async () => {
  const page = await boot({ submitted: NEW, motionReduced: false,
    profileFixture: { id: 'student-a', firstName: 'Ana', lastName: 'Prueba', topicId: null,
      avatar: { skin: 1, shirt: 0, hair: 'short' } } });
  assert.equal(page.pendingFrameCount(), 1);
  const before = page.frames.length, requests = page.calls.length;
  page.tick(); page.tick();
  assert.ok(page.frames.length >= before + 2, 'the map moves while the student stands still');
  assert.equal(page.calls.length, requests, 'animal animation does not query the database');
  page.state("setRoomTab('equipo')");
  assert.equal(page.pendingFrameCount(), 0);
  page.state("setRoomTab('aula')");
  assert.equal(page.pendingFrameCount(), 1);
  page.visibility(true);
  assert.equal(page.pendingFrameCount(), 0);
  page.visibility(false);
  await page.settle();
  assert.equal(page.pendingFrameCount(), 1);
  page.motion(true);
  assert.equal(page.pendingFrameCount(), 0);
  assert.equal(page.frames.at(-1).reducedMotion, true);
  page.motion(false);
  assert.equal(page.pendingFrameCount(), 1);
  page.leavePage();
  assert.equal(page.pendingFrameCount(), 0);
});

test('new students enter on free floor and can leave the entrance in every room layout', async () => {
  for (const count of [0, 1, 4, 40]) for (let student = 0; student < 18; student++) {
    const roomFixture = Array.from({ length: count }, (_, i) => ({ id: 'team-' + i,
      name: 'Grupo ' + (i + 1), position: i, capacity: 4, members: [] }));
    const page = await boot({ submitted: NEW, realLayout: true, roomFixture,
      profileFixture: { id: 'student-' + student, firstName: 'Ana', lastName: 'Prueba', topicId: null, avatar: { skin: 1 } } });
    const layout = page.state('layout'), player = page.frames.at(-1).player;
    assert.ok(isWalkable(player.x, player.y, layout), 'registration must not spawn the student inside a bench');
    assert.ok(canWalkSegment(player, layout.spawn, layout), 'the entrance connects to the central hall');
  }
});

test('a group refresh preserves the walk and opens the latest topic on arrival', async () => {
  const roomFixture = [{ id: 'team-1', name: 'Grupo 1', position: 1, capacity: 4, members: [] }];
  const page = await boot({ submitted: NEW, roomFixture, motionReduced: false,
    profileFixture: { id: 'student-a', firstName: 'Ana', lastName: 'Prueba', topicId: null, avatar: { skin: 1 } } });
  const layout = page.state('layout');
  page.get('#topic-buttons').children[0].click();
  assert.ok(page.state('path.length') > 0);
  roomFixture[0].members.push({ id: 'student-b', name: 'Luis Mora' });
  roomFixture[0].name = 'Trabajo actualizado';
  await page.state('refreshRoom()');
  assert.strictEqual(page.state('layout'), layout, 'membership updates reuse the geometry and animal routes');
  assert.ok(page.state('path.length') > 0, 'a new teammate must not stop a walking student');
  for (let frame = 0; frame < 100 && page.state('path.length'); frame++) page.tick();
  assert.equal(page.state('path.length'), 0);
  assert.equal(page.state('selectedTopic.name'), 'Trabajo actualizado');
  assert.equal(page.state('selectedTopic.members.length'), 1);
  assert.equal(page.get('#topic-dialog').open, true);
  page.state('walkTo({x:500,y:300})');
  roomFixture.push({ id: 'team-2', name: 'Grupo 2', position: 2, capacity: 3, members: [] });
  await page.state('refreshRoom()');
  assert.notStrictEqual(page.state('layout'), layout);
  assert.equal(page.state('path.length'), 0, 'a changed floor plan discards the old path');
});

test('team presence badges show online, offline and unknown connection states', async () => {
  const sharedPresence = new Map(); let failing = false;
  const roomFixture = [{ id: 'team-1', name: 'Grupo 1', position: 1, capacity: 3,
    members: [{ id: 'student-a', name: 'Ana Prueba', mine: true }, { id: 'student-b', name: 'Luis Mora' }] }];
  const page = await boot({ submitted: NEW, roomFixture, sharedPresence, presenceFailure: () => failing,
    profileFixture: { id: 'student-a', firstName: 'Ana', lastName: 'Prueba', topicId: 'team-1', avatar: { skin: 1 } } });
  const find = (node, id) => node.className === 'member-presence' && node.dataset.studentId === id
    ? node : node.children.map(child => find(child, id)).find(Boolean);
  const badge = id => find(page.get('#team-roster-host'), id);
  assert.equal(badge('student-a').textContent, 'Tú · en el aula');
  assert.equal(badge('student-b').textContent, 'Sin conexión');
  sharedPresence.set('student-b', { id: 'student-b', name: 'Luis', x: 400, y: 300, direction: 'down' });
  await page.state('refreshPresence()');
  assert.equal(badge('student-b').textContent, 'En el aula ahora');
  assert.equal(badge('student-b').dataset.connected, 'true');
  failing = true;
  await page.state('refreshPresence()');
  assert.equal(badge('student-b').textContent, 'Actualizando conexión…');
  assert.equal(badge('student-b').dataset.connected, 'unknown');
  failing = false; sharedPresence.delete('student-b');
  await page.state('refreshPresence()');
  assert.equal(badge('student-b').textContent, 'Sin conexión');
  assert.equal(badge('student-b').dataset.connected, 'false');
});

test('a delayed room response cannot restore a profile after leaving its course', async () => {
  const roomFixture = [{ id: 'old-team', name: 'Materia anterior', position: 1, capacity: 4, members: [] }];
  const page = await boot({ submitted: NEW, roomFixture,
    profileFixture: { id: 'student-a', firstName: 'Ana', lastName: 'Prueba', topicId: null, avatar: { skin: 1 } } });
  const pending = page.state(`(() => {
    const originalRpc = studentRpc;
    studentRpc = async (name, body) => {
      if (name === 'course_room') await new Promise(resolve => { globalThis.releaseRoom = resolve; });
      return originalRpc(name, body);
    };
    return refreshRoom();
  })()`);
  page.state("stopRoomPolling(); courseId = ''; profile = null; topics = []; show('registration'); releaseRoom();");
  await pending;
  assert.equal(page.state('profile'), null);
  assert.equal(page.state('topics.length'), 0);
  assert.equal(page.get('#room').dataset.stage, 'registration');
});

test('new students see first-time steps and returning students have a separate recovery action', async () => {
  const page = await boot({ submitted: NEW, signedIn: false });
  assert.equal(page.state('questions[questionIndex]'), 'firstName');
  assert.equal(page.get('#dialog-progress').textContent, 'PASO 1 DE 5 · REGISTRO POR PRIMERA VEZ');
  assert.equal(page.get('#dialog-description').textContent,
    'Escribe tus nombres para comenzar a crear tu perfil.');
  assert.equal(page.get('#next-question').hidden, false);
  const html = readFileSync(new URL('../live.html', import.meta.url), 'utf8');
  assert.match(html, /¿Ya habías ingresado antes a esta materia\?/);
  assert.match(html, /id="student-sign-in"[^>]*>Recuperar mi perfil anterior<\/button>/);
  assert.match(html, /id="next-question"[^>]*>Continuar →<\/button>/);
});

test('si el correo ya está inscrito con los mismos nombres aparece recuperar antes del teléfono',async()=>{
  const page=await boot({submitted:NEW,signedIn:false,emailHint:true});
  page.fields.firstName.value='Ana';page.fields.lastName.value='Pérez';
  page.fields.email.value='ana@ejemplo.com';page.fields.code.value=NEW;
  await page.get('#next-question').click(); // nombre
  await page.get('#next-question').click(); // apellido
  await page.get('#next-question').click(); // documento
  assert.equal(page.state("questions[questionIndex]"),'email');
  await page.get('#next-question').click();
  assert.equal(page.state("questions[questionIndex]"),'email','el flujo NO continúa al teléfono');
  assert.equal(page.get('#email-duplicate-notice').hidden,false);
  assert.equal(page.get('#next-question').disabled,true);
  assert.ok(page.calls.some(x=>x.name==='student_registration_email_hint'));
  assert.equal(page.calls.some(x=>x.name==='enroll_student_document'),false);
  await page.get('#email-duplicate-recover').click();
  assert.equal(page.localStorage.getItem('aula-student-recovery-code'),NEW);
  assert.equal(page.signOutCount(),0,'nunca cerrar la sesión sin permiso');
  page.fields.email.value='otro@ejemplo.com';
  page.fields.email.dispatch('input');
  assert.equal(page.get('#email-duplicate-notice').hidden,true);
  assert.equal(page.get('#next-question').disabled,false);
});
test('un correo nuevo no muestra el aviso y permite completar el registro',async()=>{
  const page=await boot({submitted:NEW,signedIn:false,emailHint:false});
  page.fields.firstName.value='Nuevo';page.fields.lastName.value='Alumno';
  page.fields.email.value='nuevo@ejemplo.com';page.fields.code.value=NEW;
  await page.get('#next-question').click();
  await page.get('#next-question').click();
  await page.get('#next-question').click();
  await page.get('#next-question').click(); // correo, después del documento
  assert.equal(page.state("questions[questionIndex]"),'phone');
  assert.equal(page.get('#email-duplicate-notice').hidden,true);
  assert.equal(page.get('#next-question').disabled,false);
});
test('aunque el aviso preliminar no encuentre coincidencia, Supabase bloquea el correo duplicado al final',async()=>{
  const page=await boot({submitted:NEW,signedIn:false,emailHint:false,
    enroll:()=>{throw new Error('Este correo ya tiene una inscripción en esta materia. Recupera tu cuenta anterior.');}});
  page.fields.firstName.value='Nombre';page.fields.lastName.value='Distinto';
  page.fields.email.value='repetido@ejemplo.com';page.fields.phone.value='61234567';
  page.fields.code.value=NEW;
  await page.get('#registration-form').dispatch('submit');
  await page.settle();
  assert.equal(page.get('#email-duplicate-notice').hidden,false);
  assert.equal(page.state("questions[questionIndex]"),'email');
  assert.equal(page.get('#next-question').disabled,true);
  assert.equal(page.get('#room').dataset.stage,'registration');
  assert.equal(page.signOutCount(),0);
});
test('a repeated phone with a new email stops before enrollment and offers recovery',async()=>{
  const page=await boot({submitted:NEW,signedIn:false,phoneHint:true});
  page.fields.firstName.value='Ana';page.fields.lastName.value='Prueba';
  page.fields.email.value='otro@ejemplo.invalid';page.fields.phone.value='+507 6000-0001';
  await page.get('#registration-form').dispatch('submit');await page.settle();
  assert.equal(page.state('questions[questionIndex]'),'phone');
  assert.equal(page.get('#email-duplicate-notice').hidden,false);
  assert.match(page.get('#registration-duplicate-title').textContent,/teléfono/);
  assert.equal(page.get('#finish-registration').disabled,true);
  assert.equal(page.calls.some(call=>call.name==='enroll_student_document'),false);
  await page.get('#email-duplicate-recover').click();
  assert.equal(page.localStorage.getItem('aula-student-recovery-code'),NEW);
  assert.equal(page.signOutCount(),0);
});
test('the server phone rejection blocks a changed name even when the preliminary hint misses',async()=>{
  const page=await boot({submitted:NEW,signedIn:false,phoneHint:false,enroll:()=>{
    throw Error('Este teléfono ya tiene una inscripción en esta materia. Recupera tu cuenta con el correo de tu registro anterior.');
  }});
  page.fields.firstName.value='Otro';page.fields.lastName.value='Nombre';
  page.fields.email.value='nuevo@ejemplo.invalid';page.fields.phone.value='6000-0001';
  await page.get('#registration-form').dispatch('submit');await page.settle();
  assert.equal(page.state('questions[questionIndex]'),'phone');
  assert.equal(page.get('#finish-registration').disabled,true);
  assert.equal(page.get('#room').dataset.stage,'registration');
});
test('a failed preliminary phone check still reaches the authoritative server guard',async()=>{
  const page=await boot({submitted:NEW,signedIn:false,phoneHintError:true,enroll:()=>{
    throw Error('Este teléfono ya tiene una inscripción en esta materia. Recupera tu cuenta con el correo de tu registro anterior.');
  }});
  page.fields.firstName.value='Ana';page.fields.lastName.value='Prueba';
  page.fields.email.value='nuevo@ejemplo.invalid';page.fields.phone.value='6000-0001';
  await page.get('#registration-form').dispatch('submit');await page.settle();
  assert.ok(page.calls.some(call=>call.name==='enroll_student_document'));
  assert.equal(page.get('#finish-registration').disabled,true);
});
test('correcting a repeated phone clears its warning and permits another attempt',async()=>{
  const page=await boot({submitted:NEW,signedIn:false,phoneHint:true});
  page.fields.firstName.value='Ana';page.fields.lastName.value='Prueba';
  page.fields.email.value='nuevo@ejemplo.invalid';page.fields.phone.value='6000-0001';
  await page.get('#registration-form').dispatch('submit');await page.settle();
  page.fields.phone.value='6000-0002';page.fields.phone.dispatch('input');
  assert.equal(page.get('#email-duplicate-notice').hidden,true);
  assert.equal(page.get('#finish-registration').disabled,false);
});
test('the shared contact notice is outside the email-only step so a phone conflict is visible',()=>{
  const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
  const emailStep=html.slice(html.indexOf('data-step="email"'),html.indexOf('data-step="phone"'));
  assert.doesNotMatch(emailStep,/id="email-duplicate-notice"/);
  assert.match(html,/id="registration-duplicate-title"/);
});
test('editing a phone while its check is pending discards the stale result',async()=>{
  let release;
  const page=await boot({submitted:NEW,signedIn:false,phoneHint:()=>new Promise(resolve=>{release=resolve;})});
  page.fields.firstName.value='Ana';page.fields.lastName.value='Prueba';
  page.fields.email.value='nuevo@ejemplo.invalid';page.fields.phone.value='6000-0001';
  await page.get('#registration-form').dispatch('submit');await page.settle();
  page.fields.phone.value='6000-0002';page.fields.phone.dispatch('input');
  assert.equal(page.get('#finish-registration').disabled,true);
  release(true);await page.settle();
  assert.equal(page.calls.some(call=>call.name==='enroll_student_document'),false);
  assert.equal(page.get('#email-duplicate-notice').hidden,true);
  assert.equal(page.get('#finish-registration').disabled,false);
});
test('a second submit cannot create another pending registration request',async()=>{
  let release;
  const page=await boot({submitted:NEW,signedIn:false,phoneHint:()=>new Promise(resolve=>{release=resolve;})});
  page.fields.firstName.value='Ana';page.fields.lastName.value='Prueba';
  page.fields.email.value='nuevo@ejemplo.invalid';page.fields.phone.value='6000-0001';
  await page.get('#registration-form').dispatch('submit');await page.settle();
  await page.get('#registration-form').dispatch('submit');await page.settle();
  assert.equal(page.calls.filter(call=>call.name==='student_registration_phone_hint').length,1);
  release(false);await page.settle();
  assert.equal(page.calls.filter(call=>call.name==='enroll_student_document').length,1);
});

test('document fields add cedula dashes and switch cleanly to passport',async()=>{
 const page=await boot({submitted:NEW,signedIn:false});
 page.fields.documentTome.value='0123';page.fields.documentEntry.value='00045';
 page.fields.documentTome.dispatch('input');
 assert.equal(page.fields.documentNumber.value,'8-0123-00045');
 assert.equal(page.state('documentDetails().p_document_number'),'8-123-45');
 page.fields.documentType.value='passport';page.fields.documentType.dispatch('change');
 assert.equal(page.get('#cedula-parts').hidden,true);
 assert.equal(page.fields.documentNumber.value,'');
 assert.equal(page.fields.documentNumber.readOnly,false);
 page.fields.documentNumber.value='ab-001234';page.fields.documentCountry.value='CO';
 assert.equal(page.state('documentDetails().p_document_number'),'AB001234');
 assert.equal(page.state('documentDetails().p_document_country'),'CO');
});
test('missing document never submits a new registration',async()=>{
 const page=await boot({submitted:NEW,signedIn:false});
 page.fields.documentTome.value='';
 await page.get('#registration-form').dispatch('submit');await page.settle();
 assert.equal(page.calls.length,0);
 assert.match(page.get('#registration-error').textContent,/cédula/);
});
test('duplicate document with a changed email and phone offers recovery instead of creating another avatar',async()=>{
 const page=await boot({submitted:NEW,signedIn:false,enroll:()=>{throw Error('Este documento ya tiene una cuenta. Recupera tu cuenta');}});
 page.fields.firstName.value='Otra';page.fields.lastName.value='Persona';
 page.fields.email.value='new@example.invalid';page.fields.phone.value='60000009';
 await page.get('#registration-form').dispatch('submit');await page.settle();
 assert.equal(page.state('questions[questionIndex]'),'documentNumber');
 assert.equal(page.get('#email-duplicate-notice').hidden,false);
 assert.equal(page.get('#next-question').disabled,true);
 assert.equal(page.get('#room').dataset.stage,'registration');
});
test('legacy students add a document without another enrollment or losing avatar and team',async()=>{
 const profileFixture={id:'legacy-a',firstName:'Ana',lastName:'Prueba',topicId:'team-a',avatar:{skin:2}};
 const page=await boot({submitted:NEW,documentRequired:true,profileFixture});
 assert.equal(page.state('completingDocument'),true);
 assert.equal(page.get('#room').dataset.stage,'registration');
 assert.equal(page.get('#edit-avatar').hidden,true);
 const enrollments=page.calls.filter(c=>c.name==='enroll_student_document').length;
 await page.get('#registration-form').dispatch('submit');await page.settle();
 assert.equal(page.calls.filter(c=>c.name==='enroll_student_document').length,enrollments);
 assert.equal(page.calls.filter(c=>c.name==='student_set_document').length,1);
 assert.equal(page.get('#room').dataset.stage,'room');
 assert.equal(page.state('profile.topicId'),'team-a');
 assert.equal(page.state('profile.avatar.skin'),2);
});
test('editing a document during the contact hint discards the pending enrollment',async()=>{
 let release;
 const page=await boot({submitted:NEW,signedIn:false,phoneHint:()=>new Promise(resolve=>release=resolve)});
 page.fields.firstName.value='Ana';page.fields.lastName.value='Prueba';page.fields.email.value='a@example.invalid';page.fields.phone.value='60000009';
 await page.get('#registration-form').dispatch('submit');await page.settle();
 page.fields.documentEntry.value='46';page.fields.documentEntry.dispatch('input');
 release(false);await page.settle();
 assert.equal(page.calls.some(c=>c.name==='enroll_student_document'),false);
 assert.equal(page.get('#finish-registration').disabled,false);
});
