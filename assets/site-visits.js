import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js?v=0.30.1';

const TOPIC='realtime:site-visit-totals';
const TABLE='site_visit_totals';
export function visitSnapshot(value) {
  const row=Array.isArray(value) ? value.length===1 && value[0] : value;
  const raw=row?.total ?? row?.unique_visits;
  if (typeof raw!=='number' && !(typeof raw==='string' && /^\d+$/.test(raw))) return null;
  const total=Number(raw), startedAt=row.startedAt || row.started_at;
  if (!Number.isSafeInteger(total)||total<0||typeof startedAt!=='string'||!Number.isFinite(Date.parse(startedAt))) return null;
  return {total,startedAt};
}

// Public aggregate only: no student/teacher session, visitor ID or IP in the client.
export function createSiteVisits({root=document,windowTarget=globalThis.window,fetcher=fetch,
  Socket=globalThis.WebSocket,apiURL=SUPABASE_URL,apiKey=SUPABASE_PUBLISHABLE_KEY,
  setTimer=setTimeout,clearTimer=clearTimeout,setLoop=setInterval,clearLoop=clearInterval,now=Date.now}={}) {
  const host=root.querySelector('[data-site-visits]');
  if (!host) return {start(){},destroy(){},refresh:async()=>{}};
  const count=host.querySelector('[data-visit-total]');
  const format=new Intl.NumberFormat('es-PA');
  let active=false,destroyed=false,epoch=0,latest=null,registered=false,phase='loading';
  let socket=null,retryTimer=0,joinTimer=0,heartbeat=0,poll=0,attempt=0,request=null;
  function render() {
    const value=latest ? format.format(latest.total) : '—';
    if (count.textContent!==value) count.textContent=value;
    host.dataset.state=phase;
    const since=latest ? ' desde '+new Intl.DateTimeFormat('es-PA',{day:'numeric',month:'short',year:'numeric'}).format(new Date(latest.startedAt)) : '';
    const status=phase==='live' ? 'Actualizado en tiempo real.'
      : phase==='unavailable' ? 'No disponible; se reintentará automáticamente.'
      : phase==='offline' ? 'Último total conocido; recuperando conexión.' : 'Actualización automática.';
    const description=`${latest ? value : 'Consultando'} ${latest?.total===1?'visita única':'visitas únicas'}${since}. Una por IP; quienes comparten una red cuentan una vez. ${status}`;
    if (host.title!==description) {host.title=description;host.setAttribute('aria-label',description);}
  }
  function apply(value) {
    const next=visitSnapshot(value);
    if (!next) throw new Error('Invalid total');
    // An earlier HTTP response cannot undo a newer Realtime increment.
    if (latest?.startedAt===next.startedAt && next.total<latest.total) return;
    latest=next; render();
  }
  async function read(signal) {
    const result=await fetcher(apiURL+'/rest/v1/'+TABLE+'?id=eq.1&select=unique_visits,started_at,updated_at',{
      headers:{apikey:apiKey},credentials:'omit',cache:'no-store',redirect:'error',signal});
    if (!result.ok) throw new Error('Counter unavailable');
    return result.json();
  }
  async function refresh() {
    if (!active||destroyed||request) return request?.promise;
    const version=epoch,controller=new AbortController(),entry={controller,promise:null};
    request=entry;
    entry.promise=(async()=>{
      let timeout=setTimer(()=>controller.abort(),10000);
      try {
        let value;
        if (!registered) {
          try {
            const response=await fetcher(apiURL+'/functions/v1/site-visits',{
              method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},body:'{}',
              credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
            if (!response.ok) throw new Error('Visit pending');
            value=await response.json();
            if (!visitSnapshot(value)) throw new Error('Invalid total');
            if (version===epoch) registered=true;
          } catch {if (controller.signal.aborted) return;value=await read(controller.signal);}
        } else value=await read(controller.signal);
        if (version!==epoch||!active||destroyed) return;
        apply(value);
        if (phase!=='live') {phase='updating';render();}
      } catch {
        if (version===epoch&&active&&!destroyed) {phase=latest?'offline':'unavailable';render();}
      } finally {clearTimer(timeout);if(request===entry)request=null;}
    })();
    return entry.promise;
  }
  function closeSocket() {
    clearTimer(joinTimer);clearLoop(heartbeat);joinTimer=heartbeat=0;
    if (socket) {
      const old=socket;socket=null;old.onopen=old.onmessage=old.onclose=old.onerror=null;
      try {old.close();} catch { /* A connection may still be opening. */ }
    }
  }
  function reconnect() {
    if (!active||destroyed) return;
    closeSocket();phase=latest?'offline':'unavailable';render();
    if (!retryTimer) retryTimer=setTimer(()=>{retryTimer=0;connect();},Math.min(30000,1000*2**Math.min(attempt++,5)));
  }
  function connect() {
    if (!active||destroyed||socket||!Socket) return;
    const version=epoch;
    let ws;
    try {
      const url=new URL(apiURL);url.protocol='wss:';url.pathname='/realtime/v1/websocket';
      url.searchParams.set('apikey',apiKey);url.searchParams.set('vsn','1.0.0');
      ws=new Socket(url.href);socket=ws;
    } catch {reconnect();return;}
    const current=()=>active&&!destroyed&&epoch===version&&socket===ws;
    let ref=1,lastMessage=now();
    const live=()=>{clearTimer(joinTimer);joinTimer=0;attempt=0;phase='live';render();void refresh();};
    const send=(topic,event,payload)=>ws.send(JSON.stringify({topic,event,payload,ref:String(++ref),...(topic===TOPIC?{join_ref:'1'}:{})}));
    joinTimer=setTimer(()=>{if(current())reconnect();},12000);
    ws.onopen=()=>{
      if (!current()) return;
      try {
        ws.send(JSON.stringify({topic:TOPIC,event:'phx_join',ref:'1',join_ref:'1',payload:{config:{
          broadcast:{ack:false,self:false},presence:{enabled:false},private:false,
          postgres_changes:[{event:'UPDATE',schema:'public',table:TABLE,filter:'id=eq.1'}]
        }}}));
      } catch {reconnect();return;}
      heartbeat=setLoop(()=>{
        if (!current()) return;
        if (now()-lastMessage>45000) {reconnect();return;}
        try {send('phoenix','heartbeat',{});} catch {reconnect();}
      },20000);
    };
    ws.onmessage=event=>{
      if (!current()) return;
      let message;try {message=JSON.parse(event.data);} catch {return;}
      lastMessage=now();
      if (message.topic!==TOPIC) return;
      if (message.event==='phx_reply'&&message.ref==='1') {
        if (message.payload?.status!=='ok') {reconnect();return;}
        if (message.payload.response?.postgres_changes?.length) live();
      } else if (message.event==='system'&&message.payload?.extension==='postgres_changes') {
        if (message.payload.status==='ok') live();else reconnect();
      } else if (['phx_error','phx_close'].includes(message.event)) reconnect();
      else if (message.event==='postgres_changes') {
        const data=message.payload?.data;
        if (data?.schema!=='public'||data.table!==TABLE||data.type!=='UPDATE'||Number(data.record?.id)!==1) return;
        try {apply(data.record);phase='live';render();} catch { /* Ignore malformed changes. */ }
      }
    };
    ws.onclose=ws.onerror=()=>{if(current())reconnect();};
  }
  function pause() {
    if (!active) return;
    active=false;epoch++;closeSocket();clearTimer(retryTimer);clearLoop(poll);retryTimer=poll=0;
    request?.controller.abort();request=null;
  }
  function start() {
    if (active||destroyed||root.hidden) return;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(apiURL)||!apiKey) {phase='unavailable';render();return;}
    active=true;epoch++;registered=false;phase=latest?'updating':'loading';render();
    void refresh();connect();poll=setLoop(()=>{void refresh();},60000);
  }
  const visibility=()=>{if(root.hidden)pause();else start();};
  const online=()=>{if(active){registered=false;void refresh();if(!socket)connect();}};
  root.addEventListener('visibilitychange',visibility);
  windowTarget?.addEventListener('pagehide',pause);windowTarget?.addEventListener('pageshow',start);windowTarget?.addEventListener('online',online);
  render();
  return {start,refresh,destroy(){
    pause();destroyed=true;root.removeEventListener('visibilitychange',visibility);
    windowTarget?.removeEventListener('pagehide',pause);windowTarget?.removeEventListener('pageshow',start);windowTarget?.removeEventListener('online',online);
  }};
}

if (typeof document!=='undefined') createSiteVisits().start();
