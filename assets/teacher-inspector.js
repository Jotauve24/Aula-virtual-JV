import { createParticipantPalette, applyParticipantColor, participantAvatar, chatMessage } from './chat-ui.js?v=0.14.0';
import { ATTACHMENT_ACCEPT, attachmentInfo, fileSizeLabel } from './attachments.js?v=0.14.0';
import { createDemoExperience, DEMO_STUDENT } from './teacher-demo-state.js?v=0.14.0';

// Same visual workflow as students, but entirely local to the teacher's browser.
const $=selector=>document.querySelector(selector);
const el=(tag,value='',css='')=>{
  const node=document.createElement(tag);
  if(value)node.textContent=value;
  if(css)node.className=css;
  return node;
};
const demo=createDemoExperience();
let context=()=>({}), activeTab='aula', demoUnread=0;
let demoChatPaint=null, noticeTimer=0;
const selectedTeam=()=>context().topics.find(t=>t.id===demo.chosenId)||null;

export const isDemoTeam=id=>demo.chosenId===id;
export function configureTeacherInspector(getContext) {
  context=getContext;
  $('#restart-demo')?.addEventListener('click',resetDemonstration);
  $('#demo-message-trigger')?.addEventListener('click',simulateIncomingMessage);
  $('#demo-chat-alert-open')?.addEventListener('click',()=>changeTab('chat'));
}
function renderDemoNotice() {
  const active=!!selectedTeam();
  const button=$('#demo-message-trigger');
  if(button)button.hidden=!active;
  const pill=$('#demo-chat-unread');
  if(pill){
    pill.hidden=!demoUnread;
    pill.textContent=demoUnread>99?'99+':String(demoUnread);
  }
  const alert=$('#demo-chat-alert');
  if(alert){
    alert.hidden=!demoUnread || activeTab==='chat';
    $('#demo-chat-alert-text').textContent=demoUnread===1?
      'Tienes 1 mensaje nuevo de un compañero de ejemplo.':
      'Tienes '+demoUnread+' mensajes nuevos de tu compañero de ejemplo.';
  }
}
function simulateIncomingMessage(){
  const topic=selectedTeam();
  if(!topic||!demo.receive(topic.id))return;
  if(activeTab!=='chat'){
    demoUnread++;
    renderDemoNotice();
    const banner=$('#demo-chat-alert');
    if(banner && !banner.hidden){
      banner.classList.remove('chat-just-arrived');
      void banner.offsetWidth;
      banner.classList.add('chat-just-arrived');
      clearTimeout(noticeTimer);
      noticeTimer=setTimeout(()=>banner.classList.remove('chat-just-arrived'),1150);
    }
    document.dispatchEvent(new CustomEvent('aulajv:chat-received',{detail:{count:1,demo:true}}));
  }
  demoChatPaint?.();
  context().status('Mensaje ficticio recibido. Entra a Chat para mostrarlo.');
}
function closeTopic(){
  const dialog=$('#topic-dialog');
  if(dialog.open)dialog.close();
  dialog.hidden=true;
}
function changeTab(tab) {
  if(!['aula','equipo','chat'].includes(tab))return;
  activeTab=tab;
  for(const button of document.querySelectorAll('[data-admin-tab]')) {
    const selected=button.dataset.adminTab===tab;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
    $('#panel-'+button.dataset.adminTab).hidden=!selected;
  }
  if(tab==='chat'){
    demoUnread=0;
    clearTimeout(noticeTimer);
    $('#demo-chat-alert')?.classList.remove('chat-just-arrived');
  }
  renderDemoNotice();
  if(tab==='aula')context().draw?.();
}
document.querySelectorAll('[data-admin-tab]').forEach(button=>{
  button.addEventListener('click',()=>changeTab(button.dataset.adminTab));
  button.addEventListener('keydown',event=>{
    const all=[...document.querySelectorAll('[data-admin-tab]')];
    let i=all.indexOf(button);
    if(event.key==='ArrowRight')i=(i+1)%all.length;
    else if(event.key==='ArrowLeft')i=(i+all.length-1)%all.length;
    else if(event.key==='Home')i=0;
    else if(event.key==='End')i=all.length-1;
    else return;
    event.preventDefault();changeTab(all[i].dataset.adminTab);all[i].focus();
  });
});
function refreshDemo() {
  context().syncDemo?.();
  renderSelectedTeam();
}
export function resetDemonstration(){
  demo.reset();
  demoUnread=0;
  demoChatPaint=null;
  clearTimeout(noticeTimer);
  closeTopic();
  changeTab('aula');
  refreshDemo();
  context().status('Demostración reiniciada. Elige un grupo para comenzar.');
}
function joinTeam(topic){
  if(!demo.choose(topic))return;
  closeTopic();
  refreshDemo();
  changeTab('aula');
  inspectTopic(topic); $('#view-my-team')?.focus();
  context().status('Te uniste al equipo de '+topic.name+' (solo demostración).');
}
function memberList(topic){
  const ul=el('ul','','member-list');
  const members=demo.members(topic);
  for(const person of members)ul.append(el('li',person.name+(person.mine?' · Tú':'')));
  for(let i=members.length;i<topic.capacity;i++)ul.append(el('li','Lugar disponible','free'));
  return ul;
}
export function inspectTopic(topic,confirmation=false){
  changeTab('aula');
  const dialog=$('#topic-dialog');
  const mine=isDemoTeam(topic.id),chosen=!!demo.chosenId;
  const members=demo.members(topic),full=members.length>=topic.capacity;
  const header=el('div','','topic-dialog-heading');
  const close=el('button','×','topic-close');
  close.type='button';close.setAttribute('aria-label','Cerrar tema');
  close.addEventListener('click',closeTopic);
  header.append(el('span','TEMA DE TU MATERIA','eyebrow'),close);
  const title=el('h2',topic.name);title.id='topic-title';
  const count=el('span',members.length+' de '+topic.capacity+' integrantes'+(mine?' · Tu equipo':''),'side-tag');
  const nodes=[header,title,el('p',topic.instructions||'Sin indicaciones todavía.'),count,memberList(topic)];
  if(mine) {
    nodes.push(el('p','Ya formas parte de este equipo. Tu lugar está guardado.'));
    const viewTeam=el('button','Ver mi equipo →','button primary team-open-button');
    viewTeam.id='view-my-team';viewTeam.type='button';
    viewTeam.addEventListener('click',()=>{closeTopic();changeTab('equipo');$('#tab-equipo').focus();});
    nodes.push(viewTeam);
  }
  else if(chosen) nodes.push(el('p','Ya perteneces a otro equipo. Puedes consultar este tema y sus integrantes.'));
  else if(full) nodes.push(el('p','Este equipo está completo.'));
  else if(confirmation){
    const box=el('div','','join-confirmation');
    box.setAttribute('role','group');box.setAttribute('aria-labelledby','join-confirm-title');
    const mark=el('span','!','join-confirm-icon');mark.setAttribute('aria-hidden','true');
    const label=el('h3','Confirma tu elección');label.id='join-confirm-title';label.tabIndex=-1;
    const explain=el('p','¿Seguro que quieres pertenecer a '+topic.name+'? Después solo el docente podrá cambiarte de equipo.');
    const actions=el('div','','join-confirm-actions');
    const cancel=el('button','No, volver','button secondary');cancel.type='button';
    cancel.addEventListener('click',()=>inspectTopic(topic));
    const join=el('button','Sí, unirme al equipo','button danger');join.type='button';
    join.addEventListener('click',()=>joinTeam(topic));
    actions.append(cancel,join);
    box.append(mark,label,explain,actions);
    nodes.push(box);
  }else{
    const choose=el('button','Quiero este equipo','button primary');
    choose.type='button';choose.addEventListener('click',()=>inspectTopic(topic,true));
    nodes.push(choose);
  }
  const back=el('button','Ver todos los temas','button secondary');back.type='button';
  back.addEventListener('click',closeTopic);nodes.push(back);
  if(mine){
    const change=el('details','','team-change');
    change.append(el('summary','¿Necesitas cambiar de equipo?'),
      el('p','En el aula real, el docente debe liberar tu lugar. Aquí puedes usar «Reiniciar demostración» para empezar de nuevo.'));
    nodes.push(change);
  }
  const error=el('p','','field-error');error.id='topic-error';error.hidden=true;
  error.setAttribute('role','alert');nodes.push(error);
  dialog.replaceChildren(...nodes);
  dialog.hidden=false;
  if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
  if(confirmation)dialog.querySelector('#join-confirm-title')?.focus();
  context().status('Estás viendo el tema '+topic.name+'.');
}
$('#topic-dialog').addEventListener('cancel',event=>{event.preventDefault();closeTopic();});

// Keep exactly the same CSS class structure and labels as the student roster.
function teamRosterPanel(topic){
  const members=demo.members(topic);
  const section=el('section','','team-roster-panel');
  section.append(el('span','TU EQUIPO','eyebrow'),el('h3',topic.name));
  const sharingCard=el('div','','share-contact-card');
  sharingCard.dataset.sharing=String(demo.sharing);
  const heading=el('div','','share-contact-heading');
  const icon=el('span','✉','share-contact-icon');icon.setAttribute('aria-hidden','true');
  const headingText=el('div');
  headingText.append(el('span','TU PRIVACIDAD','share-contact-eyebrow'),
    el('h4','¿Quieres compartir tu teléfono con tu equipo?','share-contact-title'));
  heading.append(icon,headingText);
  const explanation=el('p','Tu correo siempre es visible para los integrantes de tu equipo. Activa esta opción si también quieres compartir tu teléfono.','share-contact-description');
  const label=el('label','','share-contact');
  const input=document.createElement('input');input.type='checkbox';
  input.checked=demo.sharing;input.setAttribute('aria-label','Sí, compartir mi teléfono con mi equipo');
  const text=el('span','Sí, compartir mi teléfono con mi equipo');
  label.append(input,text);
  const state=el('span',demo.sharing?'Teléfono visible para mi equipo':'Teléfono privado','share-contact-status');
  state.setAttribute('role','status');
  sharingCard.append(heading,explanation,label,state);
  section.append(sharingCard,
    el('p',topic.instructions||'El docente todavía no añadió indicaciones.'),
    el('h4','Tus compañeros'));
  const roster=el('div','','team-roster');
  const palette=createParticipantPalette(members);
  for(const member of members){
    const card=el('div','','team-member');
    applyParticipantColor(card,palette(member.id||member.name));
    const identity=el('div','','team-member-identity');
    identity.append(participantAvatar(member.name),el('strong',member.name+(member.mine?' · Tú':'')));
    card.append(identity);
    const presence=el('span',member.mine?'Tú · en el aula':
      context().peers.some(peer=>peer.id===member.id)?'En el aula ahora':'Sin conexión','member-presence');
    presence.dataset.connected=member.mine||context().peers.some(peer=>peer.id===member.id)?'true':'false';
    if(!member.mine)presence.dataset.adminStudentId=member.id;
    card.append(presence);
    if(member.mine){const email=el('a',DEMO_STUDENT.email);email.href='mailto:'+DEMO_STUDENT.email;card.append(email);}
    if(member.mine&&demo.sharing){
      const phone=el('a',DEMO_STUDENT.phone);phone.href='tel:'+DEMO_STUDENT.phone.replace(/\D/g,'');
      card.append(phone);
    }else card.append(el('small','Teléfono privado · usa el correo o el chat'));
    roster.append(card);
  }
  section.append(roster);
  input.addEventListener('change',()=>{
    demo.share(input.checked);
    sharingCard.dataset.sharing=String(demo.sharing);
    state.textContent=demo.sharing?'Teléfono visible para mi equipo':'Teléfono privado';
    // Rebuild only the roster so that the checkbox stays focused.
    const replacement=el('div','','team-roster');
    for(const person of demo.members(topic)){
      const card=el('div','','team-member');
      applyParticipantColor(card,palette(person.id||person.name));
      const identity=el('div','','team-member-identity');
      identity.append(participantAvatar(person.name),el('strong',person.name+(person.mine?' · Tú':'')));
      card.append(identity);
      const presence=el('span',person.mine?'Tú · en el aula':
        context().peers.some(peer=>peer.id===person.id)?'En el aula ahora':'Sin conexión','member-presence');
      presence.dataset.connected=person.mine||context().peers.some(peer=>peer.id===person.id)?'true':'false';
      if(!person.mine)presence.dataset.adminStudentId=person.id;
      card.append(presence);
      if(person.mine){const email=el('a',DEMO_STUDENT.email);email.href='mailto:'+DEMO_STUDENT.email;card.append(email);}
      if(person.mine&&demo.sharing){
        const phone=el('a',DEMO_STUDENT.phone);phone.href='tel:'+DEMO_STUDENT.phone.replace(/\D/g,'');
        card.append(phone);
      }else card.append(el('small','Teléfono privado · usa el correo o el chat'));
      replacement.append(card);
    }
    roster.replaceChildren(...replacement.childNodes);
  });
  return section;
}

function downloadExample(attachment){
  const file=demo.file(attachment.path);
  if(!file)throw new Error('Este archivo de prueba ya no está disponible.');
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.href=url;link.download=attachment.name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function demoChatPanel(topic){
  const section=el('section','','team-chat');
  section.setAttribute('aria-labelledby','team-chat-title');
  const header=el('div','','team-chat-header');
  const icon=el('span','···','team-chat-icon');icon.setAttribute('aria-hidden','true');
  const heading=el('div','','team-chat-heading');
  const title=el('h2',topic.name);title.id='team-chat-title';
  heading.append(el('span','CHAT DEL EQUIPO','eyebrow'),title);
  header.append(icon,heading,el('span','Equipo y docente','chat-private-badge'));
  section.append(header,el('p','Cada integrante tiene su color. Aquí pueden ponerse de acuerdo.','chat-description'));
  const messages=el('div','','chat-messages');
  messages.setAttribute('role','log');
  messages.setAttribute('aria-label','Mensajes de demostración del equipo');
  messages.tabIndex=0;messages.id='team-chat-messages';
  const paint=()=>{
    const palette=createParticipantPalette([...demo.members(topic),{id:'sample-peer',name:'Compañero de ejemplo'}]);
    const list=demo.messages(topic.id);
    messages.replaceChildren(...list.map(msg=>chatMessage(msg,palette(msg.senderId||msg.name),downloadExample)));
    messages.scrollTop=messages.scrollHeight;
  };
  paint();
  demoChatPaint=paint;
  const form=el('form','','chat-form');form.id='team-chat-form';
  const label=el('label','Escribe a tu equipo');label.htmlFor='team-chat-input';
  const input=document.createElement('input');
  input.type='text';input.id='team-chat-input';input.name='message';
  input.placeholder='Escribe un mensaje…';input.maxLength=500;
  const attachment=document.createElement('input');
  attachment.type='file';attachment.id='team-chat-file';
  attachment.accept=ATTACHMENT_ACCEPT;attachment.hidden=true;
  const attach=el('button','Adjuntar','button secondary chat-attach');attach.type='button';
  const send=el('button','Enviar','button primary');send.type='submit';
  const preview=el('div','','attachment-preview');preview.hidden=true;
  const fileName=el('span');
  const remove=el('button','Quitar','attachment-remove');remove.type='button';
  const help=el('p','Un archivo por mensaje · hasta 10 MB. Imágenes, PDF, Word, Excel, PowerPoint, TXT, CSV o ZIP.','attachment-help');
  const error=el('p','','field-error');error.hidden=true;error.setAttribute('role','alert');
  preview.append(fileName,remove);
  let selectedFile=null,selectedInfo=null;
  attach.addEventListener('click',()=>attachment.click());
  remove.addEventListener('click',()=>{
    selectedFile=null;selectedInfo=null;attachment.value='';preview.hidden=true;
  });
  attachment.addEventListener('change',()=>{
    const file=attachment.files?.[0];if(!file)return;
    try{
      const info=attachmentInfo(file);
      selectedFile=file;selectedInfo=info;
      fileName.textContent=info.name+' · '+fileSizeLabel(info.size);
      preview.hidden=false;error.hidden=true;
    }catch(e){
      attachment.value='';selectedFile=null;selectedInfo=null;
      error.textContent=e.message;error.hidden=false;preview.hidden=true;
    }
  });
  form.append(label,input,attach,send,attachment,preview,help,error);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const body=input.value.trim();
    if(!body&&!selectedFile){
      error.textContent='Escribe un mensaje o adjunta un archivo.';
      error.hidden=false;return;
    }
    if(demo.send(topic.id,body,selectedFile,selectedInfo)){
      input.value='';selectedFile=null;selectedInfo=null;
      attachment.value='';preview.hidden=true;error.hidden=true;
      paint();input.focus();
    }
  });
  section.append(messages,form,
    el('p','Chat de demostración: los mensajes y archivos de esta pantalla son ficticios y no llegan a los estudiantes.','field-hint'));
  return section;
}
export function renderSelectedTeam(){
  const topic=selectedTeam();
  $('#group-badge').textContent=topic?'Tu equipo: '+topic.name:'Tu equipo: sin asignar';
  renderDemoNotice();
  const nodes=$('#teacher-topics').querySelectorAll('details');
  for(const detail of nodes){
    let button=detail.querySelector('.admin-view-group');
    if(!button){
      button=el('button','Abrir tema','button secondary admin-view-group');
      button.type='button';detail.append(button);
    }
    button.onclick=()=>inspectTopic(context().topics.find(t=>t.id===detail.dataset.topicId));
  }
  const roster=$('#team-roster-host'),chat=$('#team-chat-host');
  if(!topic){
    roster.replaceChildren(el('p','Elige un grupo en «Aula y temas» para ver aquí a tus compañeros.','empty-team'));
    chat.replaceChildren(el('p','Elige un equipo en «Aula y temas» para conversar.','empty-team'));
    delete chat.dataset.topicId;
    demoChatPaint=null;
    return;
  }
  roster.replaceChildren(teamRosterPanel(topic));
  if(chat.dataset.topicId!==topic.id){
    chat.dataset.topicId=topic.id;
    chat.replaceChildren(demoChatPanel(topic));
  }
}
