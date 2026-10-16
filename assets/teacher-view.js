import './embed.js?v=20261012a';
import { configureTeacherInspector, inspectTopic, renderSelectedTeam, isDemoTeam } from './teacher-inspector.js?v=20261015b';
import { configured, signedIn, rpc } from './supabase-client.js?v=20261014q';
import { drawWorld, roomTheme } from './world.js?v=20261016a';
import { createRoomLayout, findPath, canWalkSegment, isWalkable } from './world-layout.js?v=20261014m';

const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const queryCourseId = new URLSearchParams(location.search).get('materia') || '';
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryCourseId);
const teacherAvatar = Object.freeze({ character:'zombie' });
let courseId = '', topics = [], layout = createRoomLayout(0), player = { x: 400, y: 300, direction: 'up' };
let seated = [], peers = [], path = [], animation = 0, previousFrame = 0, lastDraw = 0;
let lastPresence = 0, state = 'pending', pingRunning = false, roomRunning = false;
let pingTimer = 0, roomTimer = 0, destroyed = false;
let selectedTeamId = '';

function status(value) { $('#room-status').textContent = value; }
function fail(value) {
  destroyed = true; clearInterval(pingTimer); clearInterval(roomTimer);
  cancelAnimationFrame(animation);
  $('#loading').hidden = true; $('#room').hidden = true; $('#error-view').hidden = false;
  $('#error-text').textContent = value;
}
function sortTopics(values) {
  return values.sort((a,b) => (a.position || 0)-(b.position || 0) || a.id.localeCompare(b.id));
}
function onlineIds() { return new Set(peers.map(peer => peer.id)); }
function renderRoster() {
  const online = onlineIds(), host = $('#teacher-topics');
  const nodes = topics.map(topic => {
    const details = document.createElement('details'); details.className = 'teacher-view-topic';
    details.dataset.topicId = topic.id;
    const summary = document.createElement('summary');
    const title = document.createElement('span'); title.textContent = topic.name;
    const count = document.createElement('small'); count.textContent = topic.members.length + '/' + topic.capacity + ' cupos';
    summary.append(title, count); details.append(summary);
    const instructions = document.createElement('p'); instructions.className = 'teacher-view-topic-summary';
    instructions.textContent = topic.instructions || 'Sin indicaciones todavía.';
    details.append(instructions);
    const members = document.createElement('ul'); members.className = 'teacher-view-members';
    for (const member of [...topic.members].sort((a,b)=>String(a.id).localeCompare(String(b.id)))) {
      const row = document.createElement('li');
      const name = document.createElement('span'); name.textContent = member.name;
      const presence = document.createElement('span'); presence.className = 'teacher-view-presence';
      presence.dataset.studentId = member.id;
      row.append(name,presence); members.append(row);
    }
    if (!topic.members.length) {
      const empty = document.createElement('li'); empty.textContent = 'Sin integrantes todavía.';
      members.append(empty);
    }
    details.append(members); return details;
  });
  const open = new Set([...host.querySelectorAll('details[open]')].map(node => node.dataset.topicId));
  host.replaceChildren(...nodes);
  host.querySelectorAll('details').forEach(node => { node.open = open.has(node.dataset.topicId); });
  renderPresenceSummary();
}
function renderPresenceSummary() {
  const online = state === 'live' ? onlineIds() : null;
  $('#online-count').dataset.state = state === 'live' ? 'live' : 'reconnecting';
  const text = state === 'live' ? `En el aula: ${peers.length + 1}` : 'Reconectando…';
  $('#online-count').textContent = text;
  $('#roster-status').textContent = state === 'live'
    ? `${peers.length} estudiante${peers.length === 1 ? '' : 's'} conectado${peers.length === 1 ? '' : 's'} · docente presente`
    : 'Actualizando la conexión de estudiantes…';
  document.querySelectorAll('[data-admin-student-id]').forEach(node => {
    const active=online?.has(node.dataset.adminStudentId);
    node.dataset.connected=online?(active?'true':'false'):'unknown';
    node.textContent=online?(active?'En el aula ahora':'Sin conexión'):'Actualizando conexión…';
  });
  document.querySelectorAll('[data-student-id]').forEach(node => {
    const active = online?.has(node.dataset.studentId);
    node.dataset.online = active ? 'true' : 'false';
    node.textContent = online ? (active ? 'En el aula' : 'Sin conexión') : 'Comprobando…';
  });
}
function renderTopicButtons() {
  const host = $('#topic-buttons');
  host.replaceChildren(...topics.map((topic, index) => {
    const room = layout.rooms[index], button = document.createElement('button'), theme = roomTheme(index);
    button.type = 'button'; button.className = 'map-action'+(isDemoTeam(topic.id)?' is-mine':'');
    button.style.left = room.label.x / layout.width * 100 + '%';
    button.style.top = room.label.y / layout.height * 100 + '%';
    button.style.setProperty('--table-accent',theme.accent);
    button.style.setProperty('--table-soft',theme.card);
    const occupancy = (topic.members.length + Number(isDemoTeam(topic.id))) + '/' + topic.capacity;
    button.title = `${topic.name}: ${occupancy} estudiantes. Abrir el grupo.`;
    button.setAttribute('aria-label',button.title);
    const name = document.createElement('strong'); name.textContent = topic.name;
    const capacity = document.createElement('small'); capacity.textContent = occupancy + ' lugares';
    button.append(name,capacity);
    button.addEventListener('click',() => inspectTopic(topic));
    return button;
  }));
}
function applyTopics(rows) {
  const ordered = sortTopics(Array.isArray(rows) ? rows : []);
  const oldIds = topics.map(row=>row.id).join(',');
  const nextIds = ordered.map(row=>row.id).join(',');
  const geometryChanged = oldIds !== nextIds;
  topics = ordered;
  if (geometryChanged) {
    layout = createRoomLayout(topics.length);
    path = [];
    if (!isWalkable(player.x,player.y,layout)) player = { ...layout.spawn, direction: 'up' };
  }
  seated = topics.flatMap((topic, roomIndex) => [...topic.members]
    .sort((a,b) => String(a.id).localeCompare(String(b.id)))
    .map((member,seatIndex) => ({id:member.id,roomIndex,seatIndex,avatar:member.avatar||{}})));
  $('#room-map').style.aspectRatio = layout.width + ' / ' + layout.height;
  
  renderTopicButtons(); renderRoster(); renderSelectedTeam(); draw();
}
function draw(time = 0) {
  if (destroyed || $('#room').hidden || $('#panel-aula').hidden) return;
  const connected = state === 'live' ? onlineIds() : new Set();
  drawWorld($('#world'), { layout, labels:false, actors:false,
    player: { ...player, ...teacherAvatar, id:'teacher-local' }, hidePlayerName:true,
    peers: state === 'live' ? peers : [],
    seated: state === 'live' ? seated.filter(member => !connected.has(member.id)) : [],
    seatCounts: topics.map(topic => topic.members.length),
    walking:path.length>0, time, ambientTime:reducedMotion.matches?0:Date.now(),
    reducedMotion:reducedMotion.matches });
}
function loop(time) {
  if (destroyed || document.hidden) { animation = 0; return; }
  const dt = previousFrame ? Math.min((time - previousFrame)/1000,.05) : .016;
  previousFrame = time;
  if (path.length) {
    const next = path[0], dx = next.x-player.x, dy = next.y-player.y;
    const distance = Math.hypot(dx,dy), step = 135*dt;
    player.direction = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
    if (distance <= step) { player.x = next.x; player.y = next.y; path.shift(); }
    else { player.x += dx/distance*step; player.y += dy/distance*step; }
    if (!path.length) status('Llegaste a tu destino.');
  }
  if (path.length || !reducedMotion.matches && time - lastDraw >= 55) {
    draw(time); lastDraw = time;
  }
  animation = requestAnimationFrame(loop);
}
function beginAnimation() {
  if (destroyed || document.hidden || animation || reducedMotion.matches) return;
  previousFrame = 0;
  animation = requestAnimationFrame(loop);
}
function walkTo(target) {
  const route = findPath(player,target,layout);
  if (!route.length) { status('Selecciona un lugar libre del suelo.'); return; }
  if (reducedMotion.matches) {
    player = { ...player,...route.at(-1) }; path=[]; draw(); return;
  }
  path = route; beginAnimation();
}
function moveDirection(direction) {
  const [dx,dy] = {up:[0,-20],down:[0,20],left:[-20,0],right:[20,0]}[direction];
  const target = {x:Math.round(player.x/20)*20+dx,y:Math.round(player.y/20)*20+dy};
  if (canWalkSegment(player,target,layout)) {
    player.direction=direction;walkTo(target);
  } else status('Hay una pared o un mueble. Busca un pasillo.');
}
$('#world').addEventListener('click',event => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX-bounds.left)/bounds.width*layout.width;
  const y = (event.clientY-bounds.top)/bounds.height*layout.height;
  const index = layout.rooms.findIndex(room => x>=room.desk.x&&x<=room.desk.x+room.desk.w&&y>=room.desk.y&&y<=room.desk.y+room.desk.h);
  if(index >= 0 && topics[index]) inspectTopic(topics[index]);
  else walkTo({x,y});
});
document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click',()=>moveDirection(button.dataset.direction)));
document.addEventListener('keydown',event=>{
  if ($('#room').hidden || $('#panel-aula').hidden || document.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape' && $('#topic-dialog').open) { event.preventDefault(); $('#topic-dialog').close();$('#topic-dialog').hidden=true; return; }
  if ($('#topic-dialog').open) return;
  if (event.target.closest('button,a,input,textarea,select,summary,[contenteditable="true"]')) return;
  const dir = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',W:'up',s:'down',S:'down',a:'left',A:'left',d:'right',D:'right'}[event.key];
  if (dir) {event.preventDefault();moveDirection(dir);}
});
async function refreshPresence() {
  if (destroyed || document.hidden || pingRunning || !courseId) return;
  if (lastPresence && Date.now()-lastPresence>15000) { state='reconnecting';peers=[];renderPresenceSummary();draw(); }
  pingRunning = true;
  try {
    const result = await rpc('teacher_classroom_presence_ping',{
      p_course_id:courseId,p_x:Math.round(player.x),p_y:Math.round(player.y),p_direction:player.direction
    });
    if (destroyed) return;
    peers = (Array.isArray(result)?result:[]).filter(row => row && typeof row.id==='string' &&
      Number.isFinite(row.x) && Number.isFinite(row.y) && row.x>=28 && row.x<=layout.width-28 &&
      row.y>=28 && row.y<=layout.height-28);
    state='live';lastPresence=Date.now();renderPresenceSummary();draw();
  } catch(error) {
    if (destroyed) return;
    if (/Materia deshabilitada|Acceso denegado|Acceso docente requerido/.test(error.message)) {
      fail('Esta materia ya no está disponible para tu cuenta docente.'); return;
    }
    state='reconnecting';peers=[];renderPresenceSummary();draw();
  } finally {pingRunning=false;}
}
async function refreshRoom() {
  if (destroyed || document.hidden || roomRunning || !courseId) return;
  roomRunning=true;
  try {
    const rows = await rpc('course_room',{p_course_id:courseId});
    if (destroyed) return;
    if (JSON.stringify(rows)!==JSON.stringify(topics)) applyTopics(rows);
  } catch(error) {
    if (/Materia deshabilitada|No perteneces|Acceso denegado/.test(error.message))
      fail('No tienes acceso a esta materia o ya fue deshabilitada.');
  } finally {roomRunning=false;}
}
document.addEventListener('visibilitychange',()=>{
  if (document.hidden) {cancelAnimationFrame(animation);animation=0;path=[];}
  else if (!destroyed) {beginAnimation();refreshPresence();refreshRoom();}
});
reducedMotion.addEventListener('change',()=>{
  if(reducedMotion.matches){
    path=[];
    cancelAnimationFrame(animation);
    animation=0;
  } else beginAnimation();
  draw();
});
$('#back-panel').addEventListener('click', async event=>{
  if (!courseId) return;
  event.preventDefault();
  const target = event.currentTarget.href;
  try { await rpc('teacher_classroom_presence_leave',{p_course_id:courseId}); } catch { /* expires automatically */ }
  location.assign(target);
});
async function initialize() {
  if (!configured) {fail('La conexión con Supabase no está configurada.');return;}
  if (!signedIn()) {fail('Primero inicia sesión en el panel docente con tu cuenta autorizada.');return;}
  if (!validId) {fail('La dirección no contiene una materia válida.');return;}
  $('#back-panel').href = './docente.html?materia=' + encodeURIComponent(queryCourseId);
  try {
    const overview = await rpc('teacher_overview',{p_course_id:queryCourseId});
    if (!overview?.course?.active) {fail('La materia está deshabilitada o no está disponible.');return;}
    const rows = await rpc('course_room',{p_course_id:queryCourseId});
    courseId = queryCourseId;
    $('#course-title').textContent = overview.course.name;
    document.title = 'Sala docente · ' + overview.course.name + ' · AulaVirtualJv';
    $('#loading').hidden=true;$('#room').hidden=false;
    applyTopics(rows);
    player = { ...layout.spawn, direction:'up' };
    draw();beginAnimation();
    await refreshPresence();
    pingTimer=setInterval(refreshPresence,2500);
    roomTimer=setInterval(refreshRoom,15000);
  } catch(error) { fail('No se pudo abrir la sala. Comprueba tu sesión docente e inténtalo nuevamente.'); }
}
configureTeacherInspector(()=>({ topics, layout, peers, state, courseId, walkTo, status, draw, syncDemo:()=>{renderTopicButtons();renderRoster();} }));
initialize();
