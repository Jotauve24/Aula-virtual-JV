import { createParticipantPalette, applyParticipantColor, participantAvatar, chatMessage } from './chat-ui.js?v=20261011b';

let context=()=>({}), selectedId='', tab='aula';
const $=selector=>document.querySelector(selector);
function el(tag,text='',css=''){const e=document.createElement(tag);e.textContent=text;if(css)e.className=css;return e;}
const team=()=>context().topics.find(t=>t.id===selectedId);
export function configureTeacherInspector(getContext){context=getContext;}
function closeDialog(){const d=$('#topic-dialog');if(d.open)d.close();d.hidden=true;}
function changeTab(name){
  tab=name;
  for(const button of document.querySelectorAll('[data-admin-tab]')){
    const current=button.dataset.adminTab===name;
    button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;
    $('#panel-'+button.dataset.adminTab).hidden=!current;
  }
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
    card.append(title,presence,el('small','Datos de contacto protegidos'));
    list.append(card);
  }
  if(!topic.members.length)list.append(el('p','Sin integrantes por ahora.','empty-team'));
  panel.append(list,el('p','Comprobación docente: aquí ves los mismos integrantes que vería un estudiante del equipo, sin inscribirte ni ocupar un cupo.','field-hint'));
  const openChat=el('button','Abrir chat del grupo →','button secondary');openChat.type='button';openChat.addEventListener('click',()=>changeTab('chat'));
  panel.append(openChat);
  return panel;
}
function previewChat(topic){
  const panel=el('section','','team-chat');
  const header=el('div','','team-chat-header');
  const icon=el('span','···','team-chat-icon');icon.setAttribute('aria-hidden','true');
  const heading=el('div','','team-chat-heading');
  heading.append(el('span','CHAT DEL EQUIPO · VISTA DE PRUEBA','eyebrow'),el('h2',topic.name));
  header.append(icon,heading,el('span','Vista de demostración','chat-private-badge'));
  panel.append(header,el('p','Puedes comprobar el diseño y la navegación. Los mensajes reales continúan siendo privados para sus integrantes.','chat-description'));
  const messages=el('div','','chat-messages');messages.setAttribute('role','log');messages.tabIndex=0;
  const palette=createParticipantPalette([{name:'Participante A'},{name:'Participante B'}]);
  const examples=[
    {id:1,name:'Participante A',body:'¿Cómo organizamos las tareas de este equipo?',createdAt:'2026-10-14T15:30:00-05:00',mine:false},
    {id:2,name:'Participante B',body:'Podemos dividir el trabajo y revisar los avances.',createdAt:'2026-10-14T15:32:00-05:00',mine:false}
  ];
  for(const item of examples)messages.append(chatMessage(item,palette(item.name),()=>{}));
  panel.append(messages,el('p','Mensajes ilustrativos: no son conversaciones reales del grupo. Desde esta vista no se envía ni se descarga información estudiantil.','field-hint'));
  return panel;
}
export function renderSelectedTeam(){
  const c=context(),picked=team(),online=new Set(c.peers.map(p=>p.id));
  $('#group-badge').textContent=picked?'Vista de prueba: '+picked.name:'Administrador · Sin grupo seleccionado';
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
    rosterHost.replaceChildren(el('p','Pulsa una mesa o elige un grupo para visualizar su equipo.','empty-team'));
    chatHost.replaceChildren(el('p','Selecciona un grupo para comprobar el diseño de su chat.','empty-team'));
    return;
  }
  rosterHost.replaceChildren(roster(picked,online));
  chatHost.replaceChildren(previewChat(picked));
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
