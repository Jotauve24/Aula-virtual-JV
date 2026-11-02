import { isIP } from 'node:net';

const APP_ORIGIN = 'https://jotauve24.github.io';
type Options = { apiURL:string; serviceKey:string; fetcher?:typeof fetch };
function validTotal(value:unknown):value is number|string {
  return (typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value))&&Number.isSafeInteger(Number(value))&&Number(value)>=0;
}
const validDate=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));

// This endpoint authenticates the public API key against the Data API itself.
// The server credential and raw address never appear in the public response.
export function createVisitHandler({apiURL,serviceKey,fetcher=fetch}:Options) {
  return async (request:Request) => {
    const origin=request.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
      'Access-Control-Allow-Origin':APP_ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'apikey, content-type','Access-Control-Max-Age':'600'};
    const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
    if (origin && origin!==APP_ORIGIN) return reply(403,{error:'Origin not allowed'});
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (!['GET','POST'].includes(request.method)) return reply(405,{error:'Method not allowed'});
    if (request.method==='POST' && origin!==APP_ORIGIN) return reply(403,{error:'Origin required'});
    if (Number(request.headers.get('content-length')||0)>1024) return reply(413,{error:'Too large'});
    const clientKey=request.headers.get('apikey')||'';
    if (clientKey.length>2048 || !/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/.test(clientKey))
      return reply(401,{error:'Invalid API key'});
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(apiURL) || !serviceKey)
      return reply(503,{error:'Counter unavailable'});
    try {
      // Key rotation works without redeploying: the gateway validates this key.
      const stats=await fetcher(apiURL+'/rest/v1/site_visit_totals?id=eq.1&select=unique_visits,started_at,updated_at',{
        headers:{apikey:clientKey},signal:AbortSignal.timeout(8000),redirect:'error'});
      if (!stats.ok) { await stats.body?.cancel(); return reply(stats.status===429?429:stats.status===401||stats.status===403?401:503,{error:'Counter unavailable'}); }
      const rows=await stats.json();
      if (!Array.isArray(rows)||rows.length!==1||!validTotal(rows[0]?.unique_visits)||!validDate(rows[0]?.started_at)||!validDate(rows[0]?.updated_at)) return reply(503,{error:'Counter unavailable'});
      if (request.method==='GET') return reply(200,{total:rows[0].unique_visits,startedAt:rows[0].started_at,updatedAt:rows[0].updated_at});

      // Supabase's Cloudflare gateway sets this header. Do not trust a body IP,
      // X-Forwarded-For supplied by callers, or a fallback proxy/loopback address.
      const ip=request.headers.get('cf-connecting-ip')||'';
      if (!isIP(ip) || /[%\s,/]/.test(ip)) return reply(503,{error:'Visit could not be verified'});
      const result=await fetcher(apiURL+'/rest/v1/rpc/register_site_visit',{
        method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},
        body:JSON.stringify({p_ip:ip}),signal:AbortSignal.timeout(8000),redirect:'error'});
      if (!result.ok) { await result.body?.cancel(); return reply(503,{error:'Counter unavailable'}); }
      const saved=await result.json();
      if (!validTotal(saved?.total)||!validDate(saved?.startedAt)||!validDate(saved?.updatedAt)) return reply(503,{error:'Counter unavailable'});
      return reply(200,{total:saved.total,startedAt:saved.startedAt,updatedAt:saved.updatedAt});
    } catch { return reply(503,{error:'Counter unavailable'}); }
  };
}

if (typeof Deno!=='undefined') Deno.serve(createVisitHandler({
  apiURL:Deno.env.get('SUPABASE_URL')||'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}));
