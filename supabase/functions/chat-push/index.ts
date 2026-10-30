import webpush from 'npm:web-push@3.6.7';

const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store' };
const reply = (status:number, data:unknown) => new Response(JSON.stringify(data), {status,headers});
function allowedEndpoint(value:string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
      (url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' ||
       url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}

// This webhook authenticates its own high-entropy token in a service-only RPC.
// Browser sessions cannot call either dispatch RPC or retrieve subscriptions.
Deno.serve(async (request:Request) => {
  if (request.method !== 'POST') return reply(405, {error:'Method not allowed'});
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 4096) return reply(413, {error:'Too large'});
  let input;
  try { const text = await request.text(); if (text.length > 4096) return reply(413,{error:'Too large'}); input=JSON.parse(text); }
  catch { return reply(400, {error:'Invalid request'}); }
  if (!/^\d{1,19}$/.test(String(input.message_id)) || !/^[a-f0-9]{64}$/.test(input.token || '')) return reply(401,{error:'Unauthorized'});
  const api = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!api || !key) return reply(503,{error:'Unavailable'});
  const rpc = async (name:string, body:unknown) => {
    const result = await fetch(api + '/rest/v1/rpc/' + name, {method:'POST',
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    if (!result.ok) throw new Error('Dispatch unavailable');
    return result.status === 204 ? null : result.json();
  };
  try {
    const job = await rpc('chat_push_claim', {p_message_id:String(input.message_id),p_hook_token:input.token});
    if (!job) return reply(200,{sent:0});
    const payload = JSON.stringify({courseId:job.courseId,topicId:job.topicId,messageId:String(input.message_id)});
    const expired:string[] = [];
    let sent = 0, failed = 0;
    const subscriptions = job.subscriptions || [];
    // Bound parallelism and lifetime; a failed push never rejects a chat message.
    for (let offset=0;offset<subscriptions.length;offset+=8) {
      await Promise.all(subscriptions.slice(offset,offset+8).map(async (subscription:{endpoint:string,keys:unknown}) => {
        if (!allowedEndpoint(subscription.endpoint)) { failed++; return; }
        try {
          const details = webpush.generateRequestDetails(subscription,payload,{
            vapidDetails:{subject:'https://jotauve24.github.io/Aula-virtual-JV/',publicKey:job.vapid.publicKey,privateKey:job.vapid.privateKey},
            TTL:3600,urgency:'normal',contentEncoding:'aes128gcm'
          });
          const result = await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,
            redirect:'error',signal:AbortSignal.timeout(8000)});
          if (result.ok) sent++;
          else if ([404,410].includes(result.status)) expired.push(subscription.endpoint);
          else failed++;
          await result.body?.cancel();
        } catch { failed++; }
      }));
    }
    await rpc('chat_push_finish', {p_message_id:String(input.message_id),p_expired_endpoints:expired,p_sent:sent,p_failed:failed});
    return reply(200,{sent,failed});
  } catch { return reply(401,{error:'Dispatch rejected'}); }
});
