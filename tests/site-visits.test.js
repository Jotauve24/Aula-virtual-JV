import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteVisits,visitSnapshot} from '../assets/site-visits.js';
import {createVisitHandler} from '../supabase/functions/site-visits/index.ts';

const date='2026-11-02T15:00:00Z',origin='https://jotauve24.github.io';
const row=total=>({id:1,unique_visits:total,started_at:date,updated_at:date});
const total=value=>({total:value,startedAt:date,updatedAt:date});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

function setup({fetcher=async(url,options)=>json(options.method==='POST'?total(1):[row(1)]),Socket=true}={}) {
  const root=new EventTarget(),windowTarget=new EventTarget(),count={textContent:''};
  const host={dataset:{},querySelector:()=>count,setAttribute(name,value){this[name]=value;}};
  root.querySelector=()=>host;root.hidden=false;
  const calls=[],sockets=[],timers=new Map(),loops=new Map();let serial=0,clock=0;
  class FakeSocket {
    constructor(url){this.url=url;this.sent=[];sockets.push(this);}
    send(value){this.sent.push(JSON.parse(value));}
    close(){this.closed=true;}
    open(){this.onopen?.();}
    receive(event,payload,ref){this.onmessage?.({data:JSON.stringify({topic:'realtime:site-visit-totals',event,payload,ref})});}
    ready(){this.receive('system',{extension:'postgres_changes',status:'ok'});}
    change(value,extra={}){this.receive('postgres_changes',{data:{schema:'public',table:'site_visit_totals',type:'UPDATE',record:row(value),...extra}});}
  }
  const controller=createSiteVisits({root,windowTarget,fetcher:async(url,options)=>{calls.push({url,options});return fetcher(url,options);},
    Socket:Socket?FakeSocket:null,apiURL:'https://example.supabase.co',apiKey:'sb_publishable_test',
    now:()=>clock,setTimer:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id),
    setLoop:(fn,ms)=>{const id=++serial;loops.set(id,{fn,ms});return id;},clearLoop:id=>loops.delete(id)});
  return {controller,root,windowTarget,count,host,calls,sockets,timers,loops,
    clock:value=>{clock=value;},tick(ms){for(const [id,item] of [...timers])if(item.ms===ms){timers.delete(id);item.fn();}},
    loop(ms){for(const item of [...loops.values()])if(item.ms===ms)item.fn();}};
}

test('el total acepta cero real y rechaza datos ausentes, negativos, inseguros o malformados',()=>{
  assert.equal(visitSnapshot([row('0')]).total,0);assert.equal(visitSnapshot(total(123)).total,123);
  for(const value of [null,[],[row(1),row(2)],{},total(null),total(-1),total('1.5'),total(''),total(true),total(Number.MAX_SAFE_INTEGER+1),{total:1,startedAt:'invalid'}])assert.equal(visitSnapshot(value),null);
});
test('registra una visita general sin sesión y utiliza exclusivamente el agregado público para escuchar cambios',async()=>{
  const p=setup();p.controller.start();await p.controller.refresh();
  assert.equal(p.count.textContent,'1');assert.equal(p.calls.length,1);
  assert.equal(p.calls[0].options.credentials,'omit');assert.equal(p.calls[0].options.headers.Authorization,undefined);
  assert.equal(p.calls[0].options.body,'{}');
  const socket=p.sockets[0];assert.match(socket.url,/vsn=1.0.0/);socket.open();
  assert.deepEqual(socket.sent[0].payload.config.postgres_changes,[{event:'UPDATE',schema:'public',table:'site_visit_totals',filter:'id=eq.1'}]);
  socket.ready();await p.controller.refresh();assert.equal(p.host.dataset.state,'live');
  assert.equal(p.calls.filter(call=>call.options.method==='POST').length,1);
  socket.change(2);assert.equal(p.count.textContent,'2');
  socket.change(100,{record:{...row(100),id:2}});socket.change(100,{table:'students'});
  assert.equal(p.count.textContent,'2');p.controller.destroy();
});
test('una respuesta HTTP tardía no reduce el último total recibido por Realtime',async()=>{
  let resolve;
  const p=setup({fetcher:()=>new Promise(done=>{resolve=done;})});p.controller.start();
  p.sockets[0].open();p.sockets[0].ready();p.sockets[0].change(9);
  resolve(json(total(4)));await p.controller.refresh();assert.equal(p.count.textContent,'9');p.controller.destroy();
});
test('si no se verifica la visita lee el total, conserva cero y reintenta registrar después',async()=>{
  const p=setup({fetcher:async(url,options)=>options.method==='POST'?json({},503):json([row(0)]),Socket:false});
  p.controller.start();await p.controller.refresh();assert.equal(p.count.textContent,'0');assert.equal(p.host.dataset.state,'updating');
  p.loop(60000);await p.controller.refresh();assert.equal(p.calls.filter(call=>call.options.method==='POST').length,2);p.controller.destroy();
});
test('un fallo no se presenta como cero y conserva el último valor conocido al desconectarse',async()=>{
  let failing=true;
  const p=setup({fetcher:async()=>{if(failing)throw Error('Offline');return json(total(7));}});
  p.controller.start();await p.controller.refresh();assert.equal(p.count.textContent,'—');assert.equal(p.host.dataset.state,'unavailable');
  failing=false;await p.controller.refresh();p.sockets[0].open();p.sockets[0].ready();await flush();
  p.sockets[0].change(7);p.sockets[0].onclose();assert.equal(p.count.textContent,'7');assert.equal(p.host.dataset.state,'offline');
  assert.match(p.host.title,/Último total conocido/);p.controller.destroy();
});
test('suspender la página limpia conexiones y temporizadores; volver registra de nuevo sin multiplicar sockets',async()=>{
  const p=setup();p.controller.start();await p.controller.refresh();p.sockets[0].open();p.sockets[0].ready();await flush();
  p.root.hidden=true;p.root.dispatchEvent(new Event('visibilitychange'));
  assert.equal(p.sockets[0].closed,true);assert.equal(p.timers.size,0);assert.equal(p.loops.size,0);
  p.root.hidden=false;p.root.dispatchEvent(new Event('visibilitychange'));p.windowTarget.dispatchEvent(new Event('pageshow'));
  await p.controller.refresh();assert.equal(p.sockets.length,2);assert.equal(p.calls.filter(call=>call.options.method==='POST').length,2);
  p.controller.destroy();assert.equal(p.loops.size,0);assert.equal(p.timers.size,0);
  p.windowTarget.dispatchEvent(new Event('pageshow'));assert.equal(p.sockets.length,2);
});
test('las respuestas de una página suspendida se descartan aunque el transporte ignore abort',async()=>{
  let resolve;const p=setup({fetcher:()=>new Promise(done=>{resolve=done;})});p.controller.start();
  p.windowTarget.dispatchEvent(new Event('pagehide'));resolve(json(total(99)));await flush();
  assert.equal(p.count.textContent,'—');p.controller.destroy();
});
test('heartbeat detecta un socket estancado y la reconexión elimina el canal anterior',async()=>{
  const p=setup();p.controller.start();await p.controller.refresh();const old=p.sockets[0];old.open();old.ready();await flush();
  p.clock(20000);p.loop(20000);assert.equal(old.sent.at(-1).event,'heartbeat');
  p.clock(50000);p.loop(20000);assert.equal(old.closed,true);assert.equal(p.host.dataset.state,'offline');
  p.tick(1000);assert.equal(p.sockets.length,2);assert.equal(old.onmessage,null);p.controller.destroy();
});

function edge({fetcher}={}) {
  const calls=[];
  const handle=createVisitHandler({apiURL:'https://example.supabase.co',serviceKey:'server-secret-for-test',fetcher:async(url,options)=>{
    calls.push({url,options});return fetcher?fetcher(url,options):json(url.includes('/rpc/')?total(3):[row(2)]);
  }});
  const request=(method='POST',headers={},body='{}')=>new Request('https://example.supabase.co/functions/v1/site-visits',{
    method,headers:{origin,apikey:'sb_publishable_test',...headers},...(['GET','OPTIONS'].includes(method)?{}:{body})});
  return {handle,calls,request};
}
test('el servidor usa solo la IP del gateway, ignora IPs del cuerpo y no devuelve datos privados',async()=>{
  const p=edge(),response=await p.handle(p.request('POST',{'cf-connecting-ip':'192.0.2.4','x-forwarded-for':'198.51.100.8'},JSON.stringify({ip:'198.51.100.9'})));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),total(3));assert.equal(p.calls.length,2);
  assert.equal(p.calls[0].options.headers.Authorization,undefined);
  assert.equal(p.calls[1].options.body,JSON.stringify({p_ip:'192.0.2.4'}));assert.match(p.calls[1].options.headers.Authorization,/server-secret-for-test/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('no inventa una IP si falta el header verificado ni acepta redes, listas o direcciones inválidas',async()=>{
  for(const ip of ['', '192.0.2.4, 198.51.100.8','192.0.2.0/24','unknown','::1%eth0']) {
    const p=edge();assert.equal((await p.handle(p.request('POST',{'cf-connecting-ip':ip,'x-forwarded-for':'192.0.2.4'}))).status,503);
    assert.equal(p.calls.length,1);
  }
  const p=edge();assert.equal((await p.handle(p.request('POST',{'cf-connecting-ip':'2001:db8::4'}))).status,200);
});
test('autentica la clave pública antes de ejecutar RPC y rechaza origen y métodos ajenos',async()=>{
  const p=edge();
  for(const [method,headers,status] of [['POST',{origin:'https://other.invalid'},403],['POST',{origin:''},403],['POST',{apikey:'invalid'},401],['DELETE',{},405],['POST',{'content-length':'1025'},413]])
    assert.equal((await p.handle(p.request(method,headers))).status,status);
  assert.equal(p.calls.length,0);assert.equal((await p.handle(p.request('OPTIONS'))).status,204);assert.equal(p.calls.length,0);
  const invalid=edge({fetcher:async()=>json({},401)});
  assert.equal((await invalid.handle(invalid.request('POST',{'cf-connecting-ip':'192.0.2.4'}))).status,401);assert.equal(invalid.calls.length,1);
});
test('la consulta GET no registra visitas y errores del backend nunca devuelven un total falso',async()=>{
  const p=edge(),response=await p.handle(p.request('GET'));assert.deepEqual(await response.json(),total(2));assert.equal(p.calls.length,1);
  for(const malformed of [[],[{}],[row(-1)],[{...row(2),started_at:'invalid'}]]) {
    const bad=edge({fetcher:async()=>json(malformed)});assert.equal((await bad.handle(bad.request('GET'))).status,503);
  }
  const badRpc=edge({fetcher:async url=>json(url.includes('/rpc/')?{total:5}:[row(2)])});
  assert.equal((await badRpc.handle(badRpc.request('POST',{'cf-connecting-ip':'192.0.2.4'}))).status,503);
});
