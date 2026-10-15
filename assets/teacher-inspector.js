import { createParticipantPalette, applyParticipantColor, participantAvatar, chatMessage } from './chat-ui.js?v=20261011b';
import { rpc, downloadTeacherTeamFile } from './supabase-client.js?v=20261014q';

let context=()=>({}), selectedId='', tab='aula', readingChat=false;
let chatTimer=0;
const $=selector=>document.querySelector(selector);
function el(tag,text='',css=''){const e=document.createElement(tag);e.textContent=text;if(css)e.className=css;return e;}
const team=()=>context().topics.find(t=>t.id===selectedId);
export function configureTeacherInspector(getContext){
  context=getContext;
  if(!chatTimer) chatTimer=setInterval(()=>{
    if(tab==='chat' && !document.hidden) refreshTeacherChat();
  },6000);
}
function closeDialog(){const d=$('#topic-dialog');if(d.open)d.close();d.hidden=true;}
function changeTab(name){
  tab=name;
  for(const button of document.querySelectorAll('[data-admin-tab]')){
    const current=button.dataset.adminTab===name;
    button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;
    $('#panel-'+button.dataset.adminTab).hidden=!current;
  }
  if(name==='chat') refreshTeacherChat();
}
document.querySelectorAll('[data-admin-tab]').forEach(button=>{
  button.addEventListener('click',()=>changeTab(button.dataset.adminTab));
  button.addEventListener('keydown',event=>{
    const all=[...document.querySelectorAll('[data-admin-tab]')];
    let n=all.indexOf(button);
    if(event.key==='ArrowRight')n=(n+1)%all.length;
    else if(event.key==='ArrowLeft')n=(n+all.length-1)%all.length;
    else if(event.key==='Home')n=0;
    else if(event.key==='End')n=all.length-1;
    else return;
    event.preventDefault();changeTab(all[n].dataset.adminTab);all[n].focus();
  });
});
function selectTeam(id,next='equipo'){
  selectedId=id;closeDialog();renderSelectedTeam();changeTab(next);
}
export function inspectTopic(topic){
  changeTab('aula');
  const dialog=$('#topic-dialog');
  const title=el('h2',topic.name);title.id='topic-title';
  const people=el('ul','','member-list');
  for(const m of topic.members)people.append(el('li',m.name));
  for(let i=topic.members.length;i<topic.capacity;i++)people.append(el('li','Lugar disponible','free'));
  const actions=el('div','','admin-inspector-actions');
  const buttons=[
    ['Ver mi equipo',()=>selectTeam(topic.id)],
    ['Ver chat',()=>selectTeam(topic.id,'chat')],
    ['Caminar a la mesa',()=>{const c=context(),i=c.topics.findIndex(t=>t.id===topic.id);closeDialog();c.walkTo(c.layout.rooms[i].arrival);}],
    ['Cerrar',closeDialog]
  ];
  for(const [name,fn] of buttons){const b=el('button',name,'button secondary');b.type='button';b.addEventListener('click',fn);actions.append(b);}
  dialog.replaceChildren(el('span','VISTA ADMINISTRADOR','eyebrow'),title,
    el('p',topic.instructions||'Todavía no hay indicaciones.'),
    el('span',topic.members.length+' de '+topic.capacity+' integrantes','side-tag'),people,actions);
  dialog.hidden=false;if(!dialog.open)dialog.showModal();
  context().status('Inspeccionando '+topic.name);
}
$('#topic-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
function roster(topic,online){
  const panel=el('section','','team-roster-panel');
  panel.append(el('span','VISTA DE ESTUDIANTE · INSPECCIÓN','eyebrow'),
    el('h3',topic.name),el('p',topic.instructions||'El docente no añadió indicaciones.'),
    el('h4','Tus compañeros'));
  const list=el('div','','team-roster');
  const palette=createParticipantPalette(topic.members);
  for(const member of topic.members){
    const card=el('div','','team-member');applyParticipantColor(card,palette(member.id||member.name));
    const title=el('div','','team-member-identity');
    title.append(participantAvatar(member.name),el('strong',member.name));
    const presence=el('span',online.has(member.id)?'En el aula ahora':'Sin conexión','member-presence');
    presence.dataset.connected=online.has(member.id)?'true':'false';
    presence.dataset.adminStudentId=member.id;
    card.append(title,presence,el('small','Datos de contacto protegidos'));
    list.append(card);
  }
  if(!topic.members.length)list.append(el('p','Sin integrantes por ahora.','empty-team'));
  panel.append(list,el('p','Comprobación docente: aquí ves los mismos integrantes que vería un estudiante del equipo, sin inscribirte ni ocupar un cupo.','field-hint'));
  const openChat=el('button','Abrir chat del grupo →','button secondary');openChat.type='button';openChat.addEventListener('click',()=>changeTab('chat'));
  panel.append(openChat);
  return panel;
}
function realChatPanel(topic){
  const panel=el('section','','team-chat');
  const header=el('div','','team-chat-header');
  const icon=el('span','···','team-chat-icon');icon.setAttribute('aria-hidden','true');
  const heading=el('div','','team-chat-heading');
  heading.append(el('span','CHAT DEL EQUIPO','eyebrow'),el('h2',topic.name));
  header.append(icon,heading,el('span','Supervisión docente','chat-private-badge'));
  panel.append(header,el('p','Conversación real de este equipo. La cuenta docente puede consultar mensajes y archivos, pero no enviar ni modificar nada.','chat-description'));
  const messages=el('div','Cargando conversación…','chat-messages');
  messages.id='teacher-chat-messages';messages.setAttribute('role','log');messages.tabIndex=0;
  panel.append(messages);
  const form=el('div','','chat-form admin-disabled-chat-form');
  const input=el('input');input.placeholder='Solo los integrantes pueden escribir aquí';input.disabled=true;
  const attach=el('button','Adjuntar','button secondary');attach.disabled=true;attach.type='button';
  const send=el('button','Enviar','button primary');send.disabled=true;send.type='button';
  form.append(input,attach,send);
  panel.append(form,el('p','Acceso de supervisión del docente autorizado. Solo los estudiantes integrantes pueden participar.','field-hint'));
  return panel;
}
async function refreshTeacherChat(){
  const topic=team(),c=context(),box=$('#teacher-chat-messages');
  if(!topic||!c.courseId||!box||!box.isConnected||readingChat)return;
  const topicId=topic.id,courseId=c.courseId;
  readingChat=true;
  try{
    const messages=await rpc('teacher_team_chat_read',{p_course_id:courseId,p_topic_id:topicId});
    if(!Array.isArray(messages)) throw new Error('Respuesta inesperada del servidor');
    if(team()?.id!==topicId||context().courseId!==courseId||!box.isConnected)return;
    const sig=JSON.stringify(messages);
    if(box.dataset.signature===sig)return;
    const scroll=box.scrollHeight-box.scrollTop-box.clientHeight<70;
    const palette=createParticipantPalette(topic.members);
    box.replaceChildren(...(messages.length ? messages.map(msg=>
      chatMessage(msg,palette(msg.senderId||msg.name),downloadTeacherTeamFile))
      : [el('p','Todavía no hay mensajes en este grupo.','chat-empty')]));
    box.dataset.signature=sig;
    if(scroll)box.scrollTop=box.scrollHeight;
  }catch(error){
    if(team()?.id===topicId&&box.isConnected){
      const message=el('p','No se pudo cargar el chat: '+error.message,'chat-empty');
      if(!box.dataset.signature)box.replaceChildren(message);
    }
  }finally{readingChat=false;}
}
export function renderSelectedTeam(){
  const c=context(),picked=team(),online=new Set(c.peers.map(p=>p.id));
  $('#group-badge').textContent=picked?'Vista docente: '+picked.name:'Administrador · Sin grupo seleccionado';
  for(const card of $('#teacher-topics').querySelectorAll('details')){
    const id=card.dataset.topicId;
    let button=card.querySelector('.admin-view-group');
    if(!button){
      button=el('button','Ver equipo y chat ↗','button secondary admin-view-group');button.type='button';
      card.append(button);
    }
    button.onclick=()=>selectTeam(id);
  }
  const rosterHost=$('#team-roster-host'),chatHost=$('#team-chat-host');
  if(!picked){
    delete chatHost.dataset.topicId;
    rosterHost.replaceChildren(el('p','Pulsa una mesa o elige un grupo para visualizar su equipo.','empty-team'));
    chatHost.replaceChildren(el('p','Selecciona un grupo para consultar su conversación.','empty-team'));
    return;
  }
  rosterHost.replaceChildren(roster(picked,online));
  if(chatHost.dataset.topicId!==picked.id){
    chatHost.dataset.topicId=picked.id;
    chatHost.replaceChildren(realChatPanel(picked));
  }
  if(tab==='chat')refreshTeacherChat();
}
export function drawZombie(canvas,player,walking,time=0){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.save();ctx.imageSmoothingEnabled=false;
  const x=Math.round(player.x)-17,y=Math.round(player.y)-48;
  const step=walking?Math.round(Math.sin(time/85)*2):0;
  const pixel=(dx,dy,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x+dx,y+dy,w,h);};
  pixel(8,4,18,18,'#527e46');pixel(10,3,14,3,'#729e5b');
  pixel(7,9,2,11,'#456b3b');pixel(26,9,2,11,'#456b3b');
  if(player.direction==='up'){pixel(12,9,10,5,'#426b3e');}
  else{pixel(11,12,4,4,'#eff9d4');pixel(20,12,4,4,'#eff9d4');
       pixel(12,13,2,2,'#253c1f');pixel(21,13,2,2,'#253c1f');pixel(15,19,6,2,'#304d2b');}
  pixel(13,21,8,3,'#527e46');
  pixel(8,24,18,14,'#2b9794');pixel(5,25,4,12,'#2b9794');pixel(26,25,4,12,'#2b9794');
  pixel(5,36,4,4,'#527e46');pixel(26,36,4,4,'#527e46');
  pixel(10,38,6,8-step,'#424575');pixel(19,38,6,8+step,'#424575');
  pixel(9,45-step,8,3,'#222d43');pixel(18,45+step,8,3,'#222d43');
  ctx.restore();
}
