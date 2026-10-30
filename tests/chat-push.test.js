import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {pushAvailability} from '../assets/chat-push.js';

test('iPhone requiere instalación, Android usa capacidades y un permiso bloqueado no se solicita otra vez',()=>{
 const base={secure:true,supported:true,appleMobile:false,standalone:false,permission:'default'};
 assert.equal(pushAvailability(base),'available');
 assert.equal(pushAvailability({...base,appleMobile:true}),'install');
 assert.equal(pushAvailability({...base,appleMobile:true,standalone:true}),'available');
 assert.equal(pushAvailability({...base,permission:'denied'}),'denied');
 assert.equal(pushAvailability({...base,supported:false}),'unsupported');
 assert.equal(pushAvailability({...base,secure:false}),'insecure');
});

function worker({existing=false,noBadging=false,badgingFails=false,indexedDB}={}){
 const listeners={},notices=[],actions=[],badges=[],visible=[];
 const client={frameType:'top-level',url:'https://aula.example/Aula-virtual-JV/live.html',focus:async()=>actions.push('focus'),postMessage:value=>actions.push(value)};
 const self={indexedDB,navigator:noBadging?{}:{setAppBadge:async()=>{if(badgingFails)throw Error('Denied');badges.push('set');},clearAppBadge:async()=>badges.push('clear')},
  registration:{scope:'https://aula.example/Aula-virtual-JV/',showNotification:async(...args)=>{notices.push(args);visible.push({...args[1],closed:false,close(){this.closed=true;}});},getNotifications:async()=>visible.filter(n=>!n.closed)},
  clients:{claim:async()=>{},matchAll:async()=>existing?[client]:[],openWindow:async url=>actions.push(url)},
  skipWaiting(){},addEventListener:(type,fn)=>{listeners[type]=fn;}};
 vm.runInNewContext(readFileSync(new URL('../chat-worker.js',import.meta.url),'utf8'),{self,URL});
 return {notices,actions,badges,visible,async fire(type,data){let pending;listeners[type]({...data,waitUntil:p=>pending=p});await pending;}};
}

const badgeCourse='11111111-1111-4111-8111-111111111111',badgeTeam='22222222-2222-4222-8222-222222222222',otherBadgeTeam='33333333-3333-4333-8333-333333333333';
const badgePush=(id,topicId=badgeTeam)=>({data:{json:()=>({courseId:badgeCourse,topicId,messageId:String(id)})}});
const badgeRead=(id,topicId=badgeTeam)=>({source:{url:'https://aula.example/Aula-virtual-JV/live.html'},data:{type:'aula:chat-badge',courseId:badgeCourse,topicId,unread:false,lastSeenId:String(id)}});
test('un mensaje nuevo activa el indicador del icono sin sustituir la notificación visible',async()=>{
 const w=worker();await w.fire('push',badgePush(10));assert.equal(w.badges.at(-1),'set');assert.equal(w.notices.length,1);
});
test('leer un equipo conserva la alerta de otro y al leer ambos se limpia el icono',async()=>{
 const w=worker();await w.fire('push',badgePush(10));await w.fire('push',badgePush(11,otherBadgeTeam));
 await w.fire('message',badgeRead(10));assert.equal(w.badges.at(-1),'set');assert.equal(w.visible[0].closed,true);assert.equal(w.visible[1].closed,false);
 await w.fire('message',badgeRead(11,otherBadgeTeam));assert.equal(w.badges.at(-1),'clear');assert.equal(w.visible[1].closed,true);
});
test('una respuesta atrasada no quita el indicador ni cierra la notificación de un mensaje posterior',async()=>{
 const w=worker();await w.fire('push',badgePush(20));await w.fire('message',badgeRead(19));
 assert.equal(w.badges.at(-1),'set');assert.equal(w.visible[0].closed,false);
 await w.fire('message',badgeRead(20));assert.equal(w.badges.at(-1),'clear');
});
test('un push retrasado de un mensaje ya leído no restaura el indicador',async()=>{
 const w=worker();await w.fire('message',badgeRead(30));await w.fire('push',badgePush(29));
 assert.equal(w.badges.at(-1),'clear');assert.equal(w.notices.length,1);
});
test('un mensaje propio más reciente no activa por sí solo el indicador',async()=>{
 const w=worker();await w.fire('message',{...badgeRead(70),data:{...badgeRead(70).data,lastMessageId:'71'}});
 assert.equal(w.badges.at(-1),'clear');
});
test('salir limpia todos los indicadores y no acepta órdenes desde otro sitio',async()=>{
 const w=worker();await w.fire('push',badgePush(40));
 await w.fire('message',{source:{url:'https://other.invalid/'},data:{type:'aula:chat-badge-reset'}});
 assert.equal(w.badges.at(-1),'set');assert.equal(w.visible[0].closed,false);
 await w.fire('message',{source:{url:'https://aula.example/Aula-virtual-JV/live.html'},data:{type:'aula:chat-badge-reset'}});
 assert.equal(w.badges.at(-1),'clear');assert.equal(w.visible[0].closed,true);
});
test('Android sin Badging API conserva el aviso del sistema y lo cierra al leer',async()=>{
 const w=worker({noBadging:true});await w.fire('push',badgePush(50));assert.equal(w.notices.length,1);
 await w.fire('message',badgeRead(50));assert.equal(w.visible[0].closed,true);
 const blocked=worker({badgingFails:true});await blocked.fire('push',badgePush(51));assert.equal(blocked.notices.length,1);
});
function badgeDatabaseFixture(){
 const rows=new Map();
 const db={createObjectStore(){},transaction(){
  const tx={};tx.objectStore=()=>({clear:()=>rows.clear(),put:value=>rows.set(value.key,{...value}),getAll(){
   const request={};queueMicrotask(()=>{request.result=[...rows.values()].map(r=>({...r}));request.onsuccess();queueMicrotask(()=>tx.oncomplete());});return request;
  }});return tx;
 }};
 return {rows,open(){const request={};queueMicrotask(()=>{request.result=db;request.onupgradeneeded?.();request.onsuccess();});return request;}};
}
test('el indicador de otra materia sobrevive al reinicio del service worker',async()=>{
 const database=badgeDatabaseFixture(),before=worker({indexedDB:database});
 await before.fire('push',badgePush(60));await before.fire('push',badgePush(61,otherBadgeTeam));
 const after=worker({indexedDB:database});await after.fire('message',badgeRead(60));assert.equal(after.badges.at(-1),'set');
 await after.fire('message',badgeRead(61,otherBadgeTeam));assert.equal(after.badges.at(-1),'clear');
 assert.doesNotMatch(JSON.stringify([...database.rows.values()]),/body|name|email|phone/);
});
test('un push siempre muestra un aviso visible y no expone el contenido privado del mensaje',async()=>{
 const w=worker();await w.fire('push',{data:{json:()=>({courseId:'11111111-1111-4111-8111-111111111111',topicId:'22222222-2222-4222-8222-222222222222',body:'Texto confidencial'})}});
 assert.equal(w.notices.length,1);assert.equal(w.notices[0][0],'AulavirtualJV');
 assert.doesNotMatch(JSON.stringify(w.notices),/confidencial/);
 assert.match(w.notices[0][1].icon,/Aula-virtual-JV\/assets\/icons/);
});
test('un aviso malformado conserva un texto genérico y no ejecuta URLs externas',async()=>{
 const w=worker();await w.fire('push',{data:{json:()=>{throw Error('Invalid');}}});assert.equal(w.notices.length,1);
 await w.fire('notificationclick',{notification:{data:{courseId:'https://evil.invalid',topicId:'javascript:alert(1)'},close(){}}});
 assert.equal(w.actions[0],'https://aula.example/Aula-virtual-JV/live.html');
});
test('al tocar un aviso se reutiliza la ventana existente y se conserva el borrador',async()=>{
 const w=worker({existing:true});await w.fire('notificationclick',{notification:{data:{courseId:'c',topicId:'t'},close(){}}});
 assert.equal(w.actions[0],'focus');assert.equal(w.actions[1].type,'aula:chat-notification');assert.equal(w.actions.length,2);
});

function settingsHarness({permission='default',permissionResult='granted',saveFailure=false,
 configReady,enabled=true,appleMobile=false,installed=false,existingSubscription=false,preferences=new Map()}={}){
 const events=[],calls=[],badgeMessages=[];let subscribed=existingSubscription;
 class Element{constructor(){this.children=[];this.handlers={};this.parentElement={addEventListener(){}};}append(...items){this.children.push(...items);}setAttribute(){}addEventListener(type,fn){this.handlers[type]=fn;}}
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/qa-only',toJSON:()=>({endpoint:'qa'}),unsubscribe:async()=>{events.push('unsubscribe');return true;}};
 const registration={active:{postMessage:value=>badgeMessages.push(value)},pushManager:{getSubscription:async()=>subscribed?subscription:null,subscribe:async()=>{events.push('subscribe');subscribed=true;return subscription;}}};
 const Notification={permission,requestPermission(){events.push('permission');this.permission=permissionResult;return Promise.resolve(permissionResult);}};
 const navigator={userAgent:appleMobile?'iPhone':'Android',platform:'Linux',maxTouchPoints:1,serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}};
 const window={Notification,PushManager:function(){},isSecureContext:true};window.top={navigator,matchMedia:()=>({matches:installed})};
 const localStorage={getItem:key=>preferences.get(key),setItem:(key,value)=>preferences.set(key,value)};
 const source=readFileSync(new URL('../assets/chat-push.js',import.meta.url),'utf8').replaceAll('import.meta.url',"'https://aula.example/Aula-virtual-JV/assets/chat-push.js'").replace(/^export /gm,'');
 const api=vm.runInNewContext(source+'\ncreateChatPushSettings;',{document:{createElement:()=>new Element()},window,navigator,Notification,localStorage,matchMedia:()=>({matches:false}),URL,Uint8Array,atob});
 const rpc=async(name,body)=>{calls.push({name,body});if(name==='student_push_config')return configReady||{enabled,publicKey:'BAAAAAAAAAAAAAAAAAAAAA'};if(saveFailure&&name==='student_push_subscribe')throw Error('offline');};
 const settings=api({rpc,signedIn:()=>true}),host=new Element();settings.mount(host);
 const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
 return {events,calls,badgeMessages,settings,host,settle,preferences};
}
test('preparar no pide permiso y la activación manual lo solicita antes de esperar otra operación',async()=>{
 const h=settingsHarness();h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();
 assert.deepEqual(h.events,[],'preparar no pide permiso');
 const click=h.host.children[3].handlers.click();assert.equal(h.events[0],'permission');await click;
 assert.deepEqual(h.events,['permission','subscribe']);assert.equal(h.calls.at(-1).name,'student_push_subscribe');
 assert.match(h.host.children[2].textContent,/Activas en este dispositivo/);
});
test('abrir Chat pide permiso en el mismo gesto aunque la preparación esté pendiente, sin duplicar clics',async()=>{
 let release;const configReady=new Promise(resolve=>{release=resolve;});
 const h=settingsHarness({configReady});h.settings.setContext({courseId:'c',topicId:'t'});
 assert.deepEqual(h.events,[]);
 const requested=h.settings.requestFromChat();assert.deepEqual(h.events,['permission']);
 await h.settings.requestFromChat();assert.deepEqual(h.events,['permission']);
 release({enabled:true,publicKey:'BAAAAAAAAAAAAAAAAAAAAA'});await requested;
 assert.deepEqual(h.events,['permission','subscribe']);
 assert.equal(h.calls.filter(call=>call.name==='student_push_subscribe').length,1);
 await h.settings.requestFromChat();assert.deepEqual(h.events,['permission','subscribe']);
});
test('descartar el permiso no interrumpe el chat ni vuelve a preguntar al reabrir o recargar; la campana permite reintentar',async()=>{
 const h=settingsHarness({permissionResult:'default'});h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();
 await h.settings.requestFromChat();await h.settings.requestFromChat();
 assert.deepEqual(h.events,['permission']);assert.match(h.host.children[2].textContent,/Puedes seguir usando el chat/);
 const reloaded=settingsHarness({preferences:h.preferences});reloaded.settings.setContext({courseId:'c',topicId:'t'});await reloaded.settle();
 await reloaded.settings.requestFromChat();assert.deepEqual(reloaded.events,[]);
 await reloaded.host.children[3].handlers.click();assert.deepEqual(reloaded.events,['permission','subscribe']);
});
test('un permiso rechazado no se vuelve a pedir y deja disponible el uso del chat',async()=>{
 const h=settingsHarness({permissionResult:'denied'});h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();
 await h.settings.requestFromChat();await h.settings.requestFromChat();
 assert.deepEqual(h.events,['permission']);assert.match(h.host.children[2].textContent,/permiso está bloqueado/);
});
test('sin equipo, con el servicio deshabilitado o sin instalar en iPhone no pide permisos',async()=>{
 const noTeam=settingsHarness();await noTeam.settings.requestFromChat();assert.deepEqual(noTeam.events,[]);
 for(const options of [{enabled:false},{appleMobile:true}]){
  const h=settingsHarness(options);h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();
  await h.settings.requestFromChat();assert.deepEqual(h.events,[]);
 }
});
test('un iPhone instalado solicita permiso desde Chat y activa los avisos si se acepta',async()=>{
 const h=settingsHarness({appleMobile:true,installed:true});h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();
 await h.settings.requestFromChat();assert.deepEqual(h.events,['permission','subscribe']);
});
test('un permiso ya concedido no se vuelve a pedir y desactivar evita reactivar al abrir o recargar',async()=>{
 const h=settingsHarness({permission:'granted'});h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();
 await h.settings.requestFromChat();assert.deepEqual(h.events,['subscribe']);
 await h.host.children[4].handlers.click();await h.settings.requestFromChat();assert.deepEqual(h.events,['subscribe','unsubscribe']);
 const reloaded=settingsHarness({permission:'granted',existingSubscription:true,preferences:h.preferences});reloaded.settings.setContext({courseId:'c',topicId:'t'});await reloaded.settle();
 await reloaded.settings.requestFromChat();assert.deepEqual(reloaded.events,[]);
 assert.equal(reloaded.calls.some(call=>call.name==='student_push_subscribe'),false);
 await reloaded.host.children[3].handlers.click();assert.deepEqual(reloaded.events,['subscribe']);
});
test('salir mientras se prepara la primera activación cancela la suscripción del contexto anterior',async()=>{
 let release;const h=settingsHarness({configReady:new Promise(resolve=>{release=resolve;})});
 h.settings.setContext({courseId:'c',topicId:'t'});const requested=h.settings.requestFromChat();await h.settings.logout();
 release({enabled:true,publicKey:'BAAAAAAAAAAAAAAAAAAAAA'});await requested;
 assert.deepEqual(h.events,['permission']);assert.equal(h.calls.some(call=>call.name==='student_push_subscribe'),false);
});
test('si falla el registro del dispositivo, no muestra notificaciones activas',async()=>{
 const h=settingsHarness({saveFailure:true});h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();await h.host.children[3].handlers.click();
 assert.match(h.host.children[2].textContent,/No se activaron/);assert.equal(h.host.children[3].hidden,false);
});
test('desactivar elimina la suscripción del servidor y del navegador',async()=>{
 const h=settingsHarness();h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();await h.host.children[3].handlers.click();
 await h.host.children[4].handlers.click();assert.equal(h.calls.at(-1).name,'student_push_unsubscribe');assert.equal(h.events.at(-1),'unsubscribe');
 assert.equal(h.host.children[4].hidden,true);
});
test('el indicador usa la conversación actual y su lectura solo después de activar los avisos',async()=>{
 const h=settingsHarness();h.settings.setContext({courseId:badgeCourse,topicId:badgeTeam});await h.settle();
 h.settings.setUnread(2,{lastMessageId:'72',lastSeenId:'70'});assert.equal(h.badgeMessages.length,0);
 await h.host.children[3].handlers.click();assert.equal(h.badgeMessages.at(-1).unread,true);assert.equal(h.badgeMessages.at(-1).lastMessageId,'72');
 h.settings.setUnread(0,{lastMessageId:'72',lastSeenId:'72'});assert.equal(h.badgeMessages.at(-1).unread,false);assert.equal(h.badgeMessages.at(-1).lastSeenId,'72');
 await h.settings.logout();assert.equal(h.badgeMessages.at(-1).type,'aula:chat-badge-reset');
});
