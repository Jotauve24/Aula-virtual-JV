import { DEMO_CODE, DEMO_PROFILES, SKINS, SHIRTS, normalizeCode, normalizeSearch, formatPhone, validateProfile, createTopics, joinTopic, escapeHTML as esc } from './model.js';
import { avatarSVG, drawWorld, findPath, isWalkable } from './world.js';

const main=document.querySelector('#main');
const initialMarkup=main.innerHTML;
const dialog=document.querySelector('#info-dialog');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let animation=0;
let screen='login';
let state=freshState();
function freshState(){return {profile:null,avatar:{skin:1,shirt:0,hair:'short'},groupId:null,topics:createTopics(),player:{x:400,y:300,direction:'down'},path:[],chat:null,editingInRoom:false};}
function shortName(){return `${state.profile.firstName.trim().split(/\s+/)[0]} ${state.profile.lastName.trim().split(/\s+/)[0]}`;}
function stopAnimation(){cancelAnimationFrame(animation);animation=0;}
function focusHeading(){main.querySelector('h1')?.setAttribute('tabindex','-1');main.querySelector('h1')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
function showInfo(title,body){document.querySelector('#dialog-title').textContent=title;document.querySelector('#dialog-text').textContent=body;dialog.showModal();}
document.querySelector('#about-demo').addEventListener('click',()=>showInfo('Estamos dando el primer paso.','Esta versión permite probar el ingreso con DEMO2026, editar un perfil ficticio, crear un avatar y recorrer el aula. No hay materias reales activas. Los datos, equipos y chats de prueba se borran al salir o recargar; nadie más los recibe. Usa únicamente datos de ejemplo.'));
dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.querySelector('.dialog-done').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
function bindExit(){main.querySelector('[data-exit]')?.addEventListener('click',reset);}
function notice(){return '<div class="demo-notice"><span><strong>Recorrido de prueba.</strong> Usa datos ficticios. Nada se guarda al salir.</span><button type="button" data-exit>Salir de la prueba</button></div>';}
function steps(active){return `<ol class="steps" aria-label="Progreso">${['Tu perfil','Tus datos','Tu avatar'].map((s,i)=>`<li class="${active===i?'active':''}" ${active===i?'aria-current="step"':''}><b>${i+1}</b>${s}</li>`).join('')}</ol>`;}
function flow(content,active){stopAnimation();main.innerHTML=`<section class="flow-shell">${notice()}${steps(active)}${content}</section>`;bindExit();focusHeading();}
function reset(){stopAnimation();state=freshState();screen='login';main.innerHTML=initialMarkup;document.title='Ingreso de estudiantes · Aula Encuentro';bindLogin();document.querySelector('#course-code').focus();window.scrollTo({top:0,behavior:'instant'});}

function bindLogin(){
  const input=document.querySelector('#course-code'), error=document.querySelector('#code-error');
  document.querySelector('#enter-course').disabled=false;
  document.querySelector('#course-form').addEventListener('submit',event=>{
    event.preventDefault();const code=normalizeCode(input.value);input.value=code;
    if(code!==DEMO_CODE){
      error.textContent=!code?'Escribe el código de tu materia para continuar.':!/^[A-Z0-9-]{4,24}$/.test(code)?'Revisa el código: utiliza entre 4 y 24 letras, números o guiones.':'Todavía no hay materias reales activas. Para conocer el aula, usa DEMO2026.';
      error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;
    }
    state=freshState();renderProfiles();
  });
  input.addEventListener('input',()=>{error.hidden=true;input.removeAttribute('aria-invalid');});
  document.querySelector('#open-demo').addEventListener('click',()=>{input.value=DEMO_CODE;document.querySelector('#course-form').requestSubmit();});
  document.querySelector('#code-help').addEventListener('click',()=>showInfo('Un código para cada materia.','Tu docente te compartirá el código de la clase. Todos los estudiantes de esa materia usarán el mismo. En esta primera versión puedes probar con DEMO2026; los códigos de materias reales aún no están habilitados.'));
  const canvas=document.querySelector('#preview-map');let last=0;
  function tick(time){if(screen!=='login')return;if(time-last>45){drawWorld(canvas,{decorative:true,time:reducedMotion.matches?0:time});last=time;}if(!reducedMotion.matches&&!document.hidden)animation=requestAnimationFrame(tick);}
  drawWorld(canvas,{decorative:true});if(!reducedMotion.matches)animation=requestAnimationFrame(tick);
}
function renderProfiles(){
  screen='profiles';document.title='Elige tu perfil de prueba · Aula Encuentro';
  flow('<span class="eyebrow">SISTEMAS I · MATERIA DE EJEMPLO</span><h1 class="flow-title">Encuentra tu nombre.</h1><p class="flow-subtitle">Tu docente podrá cargar la lista de la clase. Por ahora, elige un perfil ficticio.</p><div class="flow-card"><label for="profile-search">Buscar estudiante de ejemplo</label><input class="search-field" id="profile-search" type="search" placeholder="Nombre o apellido" autocomplete="off"><div class="profile-grid" id="profile-list"></div><p class="field-hint">Elegir un nombre aquí solo abre una demostración; no verifica una identidad.</p></div>',0);
  const list=document.querySelector('#profile-list');
  function display(value=''){
    const found=DEMO_PROFILES.filter(p=>normalizeSearch(`${p.firstName} ${p.lastName}`).includes(normalizeSearch(value)));
    list.innerHTML=found.length?found.map(p=>`<button type="button" class="profile-button" data-profile="${p.id}">${avatarSVG(p)}<span><strong>${p.firstName} ${p.lastName}</strong><small>Perfil ficticio · Sin equipo</small></span><span class="profile-arrow" aria-hidden="true">↗</span></button>`).join(''):'<p class="search-empty" role="status">No aparece ese nombre en la lista de ejemplo.</p>';
  }
  display();document.querySelector('#profile-search').addEventListener('input',event=>display(event.target.value));
  list.addEventListener('click',event=>{
    const button=event.target.closest('[data-profile]');if(!button)return;
    const p=DEMO_PROFILES.find(p=>p.id===button.dataset.profile);const number=DEMO_PROFILES.indexOf(p)+1;
    state.profile={id:p.id,firstName:p.firstName,lastName:p.lastName,document:`0-000-00${number}`,phone:`0000-000${number}`};
    state.avatar={skin:p.skin,shirt:p.shirt,hair:p.hair};renderProfileForm();
  });
}
function renderProfileForm(){
  screen='details';const p=state.profile;
  flow(`<button class="back-button" type="button" id="back-profiles">← Elegir otro perfil</button><span class="eyebrow">CONFIRMA TU INFORMACIÓN</span><h1 class="flow-title">Antes de entrar, tus datos.</h1><p class="flow-subtitle">Aunque tu nombre ya aparezca, podrás corregirlo. En esta prueba conserva datos ficticios.</p><form id="profile-form" class="flow-card" novalidate><div class="field-row">${field('firstName','Nombres correctos',p.firstName,'text',80)}${field('lastName','Apellidos correctos',p.lastName,'text',100)}</div><div class="field-row">${field('document','Cédula de ejemplo',p.document,'text',32)}${field('phone','Número de teléfono',p.phone,'tel',9,'Ocho dígitos, con formato XXXX-XXXX.')}</div><div class="form-bottom"><p>El teléfono y la cédula no aparecerán sobre el avatar ni en el listado de equipos.</p><button class="button primary" type="submit">Confirmar datos y crear avatar <span aria-hidden="true">→</span></button></div></form>`,1);
  document.querySelector('#back-profiles').addEventListener('click',renderProfiles);
  const phone=document.querySelector('#phone');phone.addEventListener('input',()=>{const before=phone.selectionStart,previous=phone.value;phone.value=formatPhone(previous);if(before===previous.length)phone.setSelectionRange(phone.value.length,phone.value.length);});
  document.querySelector('#profile-form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.target;const updated={...state.profile};
    for(const key of ['firstName','lastName','document','phone'])updated[key]=form.elements.namedItem(key).value.trim();
    const errors=validateProfile(updated);
    for(const key of ['firstName','lastName','document','phone']){
      const el=form.elements.namedItem(key),error=document.querySelector(`#${key}-error`);error.textContent=errors[key]||'';error.hidden=!errors[key];el.setAttribute('aria-invalid',errors[key]?'true':'false');
    }
    if(Object.keys(errors).length){form.elements.namedItem(Object.keys(errors)[0]).focus();return;}
    state.profile=updated;renderAvatar();
  });
}
function field(id,label,value,type,length,hint=''){
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${esc(value)}" maxlength="${length}" autocomplete="off" ${type==='tel'?'inputmode="numeric" placeholder="XXXX-XXXX"':''} aria-describedby="${id}-error${hint?' '+id+'-hint':''}" required>${hint?`<p class="field-hint" id="${id}-hint">${hint}</p>`:''}<p class="field-error" id="${id}-error" role="alert" hidden></p></div>`;
}
function renderAvatar(){
  screen='avatar';
  flow(`<button class="back-button" type="button" id="back-details">← ${state.editingInRoom?'Volver al aula':'Revisar mis datos'}</button><span class="eyebrow">DALE TU TOQUE</span><h1 class="flow-title">Así te verán en el aula.</h1><p class="flow-subtitle">Elige cómo quieres que sea tu personaje.</p><div class="flow-card"><div class="avatar-layout"><div class="avatar-preview"><div id="avatar-image">${avatarSVG(state.avatar)}</div><strong>${esc(shortName())}</strong></div><div class="avatar-controls"><fieldset><legend>Tono de piel</legend><div class="swatches">${SKINS.map((c,i)=>swatch('skin',i,c,['Claro','Medio claro','Medio oscuro','Oscuro'][i])).join('')}</div></fieldset><fieldset><legend>Color de ropa</legend><div class="swatches">${SHIRTS.map((c,i)=>swatch('shirt',i,c,['Verde','Azul','Terracota','Mostaza','Lila'][i])).join('')}</div></fieldset><fieldset><legend>Cabello</legend><div class="hair-options">${[['short','Corto'],['long','Largo'],['curly','Rizado']].map(([key,name])=>`<button type="button" class="hair-option" data-look="hair" data-value="${key}" aria-pressed="${state.avatar.hair===key}">${name}</button>`).join('')}</div></fieldset></div></div><div class="form-bottom"><p>Ya puedes caminar y descubrir los espacios de cada tema.</p><button type="button" class="button primary" id="enter-room">${state.editingInRoom?'Volver a mi aula':'Entrar al aula de prueba'} <span aria-hidden="true">↗</span></button></div></div>`,2);
  main.querySelectorAll('[data-look]').forEach(button=>button.addEventListener('click',()=>{
    const kind=button.dataset.look;state.avatar[kind]=kind==='hair'?button.dataset.value:Number(button.dataset.value);
    main.querySelectorAll(`[data-look="${kind}"]`).forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector('#avatar-image').innerHTML=avatarSVG(state.avatar);
  }));
  document.querySelector('#back-details').addEventListener('click',()=>state.editingInRoom?renderRoom():renderProfileForm());
  document.querySelector('#enter-room').addEventListener('click',renderRoom);
}
function swatch(kind,index,color,name){return `<button type="button" class="swatch" data-look="${kind}" data-value="${index}" style="background:${color}" aria-label="${name}" aria-pressed="${state.avatar[kind]===index}"></button>`;}

const people={emma:{name:'Emma',status:'Busco equipo',skin:0,shirt:2,hair:'long',x:320,y:294,available:true},leo:{name:'Leo',status:'Ocupado',skin:2,shirt:1,hair:'short',x:404,y:374,available:false}};
function renderRoom(){
  stopAnimation();screen='room';state.path=[];state.chat=null;state.editingInRoom=false;document.title='Aula de prueba · Aula Encuentro';
  main.innerHTML=`<section class="room-shell">${notice()}<div class="room-header"><div class="room-heading"><span class="eyebrow">DEMO2026 · AULA DE PRUEBA</span><h1>Sistemas I</h1></div><div class="room-header-actions"><span class="group-badge" id="group-badge"></span><button type="button" class="button secondary" id="edit-avatar">Mi avatar</button></div></div><div class="room-layout"><div><div class="room-map-container"><div class="room-map" id="room-map"><canvas id="world" width="800" height="560" tabindex="0" role="img" aria-label="Aula interactiva. Usa las flechas o WASD para caminar; también puedes tocar el suelo. Los botones de los temas abren sus equipos."></canvas><div id="topic-buttons"></div><button class="person-action" data-person="emma" style="left:40%;top:57%" aria-label="Hablar con Emma, busca equipo">Emma · Busco equipo</button><button class="person-action" data-person="leo" style="left:50.5%;top:72%" aria-label="Leo, ocupado">Leo · Ocupado</button></div><div class="room-tools"><p class="movement-hint">Toca el suelo para caminar.<br>También puedes usar <strong>↑ ↓ ← →</strong> o <strong>W A S D</strong>.</p><div class="dpad" aria-label="Mover tu avatar"><button type="button" data-direction="up" aria-label="Caminar arriba">↑</button><button type="button" data-direction="left" aria-label="Caminar a la izquierda">←</button><button type="button" data-direction="down" aria-label="Caminar abajo">↓</button><button type="button" data-direction="right" aria-label="Caminar a la derecha">→</button></div></div></div><div class="room-status" id="room-status" role="status">Acércate a un tema para ver sus integrantes y elegir equipo.</div></div><aside class="room-side" aria-label="Temas, personas y conversaciones"><div id="side-content"></div><p class="side-footer">Personajes, cupos y conversaciones de ejemplo. Esta prueba funciona solo en tu pantalla.</p></aside></div></section>`;
  bindExit();updateRoomLabels();homePanel();draw();focusHeading();
  document.querySelector('#edit-avatar').addEventListener('click',()=>{state.editingInRoom=true;renderAvatar();});
  document.querySelector('#topic-buttons').addEventListener('click',event=>{const button=event.target.closest('[data-topic]');if(button)openTopic(button.dataset.topic);});
  main.querySelectorAll('[data-person]').forEach(button=>button.addEventListener('click',()=>openPerson(button.dataset.person)));
  main.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>moveDirection(button.dataset.direction)));
  document.querySelector('#world').addEventListener('click',event=>{
    const bounds=event.currentTarget.getBoundingClientRect();goTo({x:(event.clientX-bounds.left)/bounds.width*800,y:(event.clientY-bounds.top)/bounds.height*560});
  });
}
function topicMembers(topic){return state.groupId===topic.id?[...topic.members,shortName()]:topic.members;}
function updateRoomLabels(){
  document.querySelector('#group-badge').textContent=state.groupId?`Tu equipo: ${state.topics.find(t=>t.id===state.groupId).name}`:'Tu equipo: sin asignar';
  document.querySelector('#topic-buttons').innerHTML=state.topics.map(t=>`<button type="button" class="map-action ${state.groupId===t.id?'is-mine':''}" data-topic="${t.id}" style="left:${t.x/8}%;top:${t.y/5.6}%"><strong>${t.name}</strong><small>${topicMembers(t).length===t.capacity?'Equipo completo':`${topicMembers(t).length} de ${t.capacity} lugares`}</small></button>`).join('');
}
function side(html){document.querySelector('#side-content').innerHTML=html;}
function status(message){const el=document.querySelector('#room-status');if(el)el.textContent=message;}
function homePanel(){
  side(`<span class="eyebrow">HOLA, ${esc(state.profile.firstName.split(' ')[0].toLocaleUpperCase('es'))}</span><h2>Encuentra tu lugar.</h2><p>Explora los temas. Para pertenecer a un equipo, abre su espacio y confirma tu elección.</p><div class="topic-list">${state.topics.map(t=>`<button type="button" data-pick-topic="${t.id}">${t.name}<span>${topicMembers(t).length}/${t.capacity} lugares</span></button>`).join('')}</div><p class="field-hint">Caminar por otro espacio no cambia tu equipo.</p>`);
  document.querySelectorAll('[data-pick-topic]').forEach(b=>b.addEventListener('click',()=>openTopic(b.dataset.pickTopic)));
}
function openTopic(id){const topic=state.topics.find(t=>t.id===id);goTo(topic.target);topicPanel(topic);}
function topicPanel(topic,confirm=false){
  const mine=state.groupId===topic.id, members=topicMembers(topic), full=members.length>=topic.capacity;
  side(`<span class="eyebrow">ESPACIO ${topic.index}</span><h2>${topic.name}</h2><p>${topic.description}</p><span class="side-tag">${members.length} de ${topic.capacity} integrantes${mine?' · Tu equipo':''}</span><ul class="member-list">${members.map(name=>`<li>${esc(name)}</li>`).join('')}${Array.from({length:Math.max(0,topic.capacity-members.length)},()=>'<li class="free">Lugar disponible</li>').join('')}</ul>${mine?'<button class="button secondary" type="button" id="leave-group">Dejar este equipo</button>':full?'<p>Este equipo está completo. Explora los otros espacios.</p>':state.groupId?'<p>Ya tienes un equipo. Si quieres cambiar, primero sal de él.</p>':confirm?'<p>¿Confirmas que quieres formar parte de este equipo?</p><button class="button primary" type="button" id="confirm-join">Sí, unirme al equipo</button>':'<button class="button primary" type="button" id="ask-join">Quiero este equipo</button>'}<button class="button secondary" type="button" id="all-topics">${confirm?'Cancelar':'Ver todos los temas'}</button>`);
  document.querySelector('#all-topics').addEventListener('click',homePanel);
  document.querySelector('#ask-join')?.addEventListener('click',()=>topicPanel(topic,true));
  document.querySelector('#confirm-join')?.addEventListener('click',()=>{
    const result=joinTopic(state.topics,state.groupId,topic.id);if(!result.ok){topicPanel(topic);return;}
    state.groupId=topic.id;updateRoomLabels();topicPanel(topic);status(`Te uniste al equipo de ${topic.name}. Puedes seguir explorando.`);
  });
  document.querySelector('#leave-group')?.addEventListener('click',()=>{
    side(`<span class="eyebrow">CAMBIAR DE EQUIPO</span><h2>¿Dejar ${topic.name}?</h2><p>Tu lugar volverá a estar disponible y quedarás sin equipo.</p><button class="button primary" type="button" id="confirm-leave">Sí, dejar el equipo</button><button class="button secondary" type="button" id="cancel-leave">Conservar mi lugar</button>`);
    document.querySelector('#cancel-leave').addEventListener('click',()=>topicPanel(topic));
    document.querySelector('#confirm-leave').addEventListener('click',()=>{state.groupId=null;updateRoomLabels();topicPanel(topic);status('Ahora estás sin equipo. Puedes elegir otro tema.');});
  });
}
function openPerson(id){
  const person=people[id];state.chat=null;goTo({x:person.x+40,y:person.y});
  side(`<span class="eyebrow">PERSONAJE DE EJEMPLO</span>${avatarSVG(person,'person-icon')}<h2>${person.name}</h2><span class="side-tag">${person.status}</span><p>${person.available?'Puedes pedirle una conversación. El chat se abrirá cuando acepte.':'Ahora está ocupado. Podrás solicitar una conversación cuando esté disponible.'}</p><button class="button primary" type="button" id="ask-chat" ${person.available?'':'disabled'}>Solicitar chat</button><button class="button secondary" type="button" id="close-person">Volver a los temas</button>`);
  document.querySelector('#close-person').addEventListener('click',homePanel);
  document.querySelector('#ask-chat').addEventListener('click',()=>{if(person.available)requestChat(id);});
}
function requestChat(id){
  const person=people[id];state.chat={personId:id,status:'pending',messages:[]};
  side(`<span class="eyebrow">SOLICITUD DE CHAT</span><h2>Esperando a ${person.name}…</h2><p class="chat-example-note">En esta prueba tú simulas la respuesta. No se ha enviado una solicitud real.</p><button class="button primary" type="button" id="accept-chat">Simular que acepta</button><button class="button secondary" type="button" id="decline-chat">Simular que rechaza</button><button class="text-button" type="button" id="cancel-chat">Cancelar solicitud</button>`);
  document.querySelector('#accept-chat').addEventListener('click',()=>{if(state.chat?.status!=='pending')return;state.chat.status='accepted';chatPanel();status(`Conversación de prueba abierta con ${person.name}.`);});
  document.querySelector('#decline-chat').addEventListener('click',()=>{state.chat=null;homePanel();status(`${person.name} rechazó la solicitud de ejemplo.`);});
  document.querySelector('#cancel-chat').addEventListener('click',()=>openPerson(id));
}
function chatPanel(){
  if(state.chat?.status!=='accepted')return;
  const person=people[state.chat.personId];
  side(`<span class="eyebrow">CHAT DE PRUEBA</span><h2>Conversación con ${person.name}</h2><p class="chat-example-note">Los mensajes solo se muestran aquí. No se envían a otra persona.</p><div class="chat-messages" id="chat-messages" role="log" aria-live="polite"></div><form class="chat-form" id="chat-form"><label class="screen-reader-only" for="chat-input">Mensaje de ejemplo</label><input id="chat-input" maxlength="300" autocomplete="off" placeholder="Escribe un mensaje de ejemplo"><button class="button primary" type="submit">Mostrar mensaje</button></form><button class="button secondary" type="button" id="close-chat">Cerrar conversación</button>`);
  function messages(){const el=document.querySelector('#chat-messages');el.innerHTML=state.chat.messages.map(m=>`<div class="chat-message mine"><small>Tú</small>${esc(m)}</div>`).join('');el.scrollTop=el.scrollHeight;}
  messages();document.querySelector('#chat-form').addEventListener('submit',event=>{event.preventDefault();const input=document.querySelector('#chat-input');const value=input.value.trim();if(!value||state.chat?.status!=='accepted')return;state.chat.messages.push(value);state.chat.messages=state.chat.messages.slice(-30);input.value='';messages();input.focus();});
  document.querySelector('#close-chat').addEventListener('click',()=>{state.chat=null;homePanel();status('Conversación de prueba cerrada.');});
}
function draw(time=0){const canvas=document.querySelector('#world');if(canvas)drawWorld(canvas,{labels:false,player:{...state.player,...state.avatar},walking:state.path.length>0,time});}
function goTo(target){
  state.path=findPath(state.player,target);
  if(!state.path.length){status('Elige un lugar libre del suelo para caminar.');return;}
  if(reducedMotion.matches){const last=state.path.at(-1);state.player={...state.player,...last};state.path=[];draw();return;}
  stopAnimation();let previous=0;
  function walk(time){
    if(screen!=='room'||!state.path.length){draw(time);return;}
    const dt=previous?Math.min((time-previous)/1000,.05):.016;previous=time;
    const next=state.path[0],dx=next.x-state.player.x,dy=next.y-state.player.y,distance=Math.hypot(dx,dy),speed=135*dt;
    state.player.direction=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
    if(distance<=speed){state.player.x=next.x;state.player.y=next.y;state.path.shift();}else{state.player.x+=dx/distance*speed;state.player.y+=dy/distance*speed;}
    draw(time);if(state.path.length)animation=requestAnimationFrame(walk);
  }
  animation=requestAnimationFrame(walk);
}
function moveDirection(direction){
  const delta={up:[0,-20],down:[0,20],left:[-20,0],right:[20,0]}[direction];if(!delta)return;
  const target={x:Math.round(state.player.x/20)*20+delta[0],y:Math.round(state.player.y/20)*20+delta[1]};
  if(isWalkable(target.x,target.y)){state.player.direction=direction;goTo(target);}else status('Hay mobiliario en ese lugar. Rodea la mesa por el pasillo.');
}
document.addEventListener('keydown',event=>{
  if(screen!=='room'||dialog.open||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  const direction={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'}[event.key];
  if(direction){event.preventDefault();moveDirection(direction);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAnimation();else if(screen==='login'){drawWorld(document.querySelector('#preview-map'),{decorative:true});}else if(screen==='room'){state.path=[];draw();}});
window.addEventListener('pagehide',stopAnimation);
bindLogin();
