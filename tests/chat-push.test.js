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

function worker({existing=false}={}){
 const listeners={},notices=[],actions=[];
 const client={frameType:'top-level',url:'https://aula.example/Aula-virtual-JV/live.html',focus:async()=>actions.push('focus'),postMessage:value=>actions.push(value)};
 const self={registration:{scope:'https://aula.example/Aula-virtual-JV/',showNotification:async(...args)=>notices.push(args)},
  clients:{claim:async()=>{},matchAll:async()=>existing?[client]:[],openWindow:async url=>actions.push(url)},
  skipWaiting(){},addEventListener:(type,fn)=>{listeners[type]=fn;}};
 vm.runInNewContext(readFileSync(new URL('../chat-worker.js',import.meta.url),'utf8'),{self,URL});
 return {notices,actions,async fire(type,data){let pending;listeners[type]({...data,waitUntil:p=>pending=p});await pending;}};
}
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

function settingsHarness({permission='default',saveFailure=false}={}){
 const events=[],calls=[];let subscribed=false;
 class Element{constructor(){this.children=[];this.handlers={};this.parentElement={addEventListener(){}};}append(...items){this.children.push(...items);}setAttribute(){}addEventListener(type,fn){this.handlers[type]=fn;}}
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/qa-only',toJSON:()=>({endpoint:'qa'}),unsubscribe:async()=>{events.push('unsubscribe');return true;}};
 const registration={pushManager:{getSubscription:async()=>subscribed?subscription:null,subscribe:async()=>{events.push('subscribe');subscribed=true;return subscription;}}};
 const Notification={permission,requestPermission(){events.push('permission');this.permission='granted';return Promise.resolve('granted');}};
 const navigator={userAgent:'Android',platform:'Linux',maxTouchPoints:1,serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}};
 const window={Notification,PushManager:function(){},isSecureContext:true};window.top={navigator,matchMedia:()=>({matches:false})};
 const source=readFileSync(new URL('../assets/chat-push.js',import.meta.url),'utf8').replaceAll('import.meta.url',"'https://aula.example/Aula-virtual-JV/assets/chat-push.js'").replace(/^export /gm,'');
 const api=vm.runInNewContext(source+'\ncreateChatPushSettings;',{document:{createElement:()=>new Element()},window,navigator,Notification,matchMedia:()=>({matches:false}),URL,Uint8Array,atob});
 const rpc=async(name,body)=>{calls.push({name,body});if(name==='student_push_config')return {enabled:true,publicKey:'BAAAAAAAAAAAAAAAAAAAAA'};if(saveFailure&&name==='student_push_subscribe')throw Error('offline');};
 const settings=api({rpc,signedIn:()=>true}),host=new Element();settings.mount(host);
 const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
 return {events,calls,settings,host,settle};
}
test('el permiso solo se pide desde Activar y antes de esperar otra operación',async()=>{
 const h=settingsHarness();h.settings.setContext({courseId:'c',topicId:'t'});await h.settle();
 assert.deepEqual(h.events,[],'preparar no pide permiso');
 const click=h.host.children[3].handlers.click();assert.equal(h.events[0],'permission');await click;
 assert.deepEqual(h.events,['permission','subscribe']);assert.equal(h.calls.at(-1).name,'student_push_subscribe');
 assert.match(h.host.children[2].textContent,/Activas en este dispositivo/);
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
