import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/supabase-client.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
function store(values={}){
  const map=new Map(Object.entries(values));
  return {getItem:key=>map.get(key)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
function start({pathname='/live.html',hash='',initial={},responseUser={id:'student-1',is_anonymous:true},fetchError=false,userFailure=null}={}){
  const localStorage=store(initial),sessionStorage=store();
  const called=[], historyCalls=[];
  const origin='https://jotauve24.github.io',base=origin+'/Aula-virtual-JV';
  const location={
    pathname:'/Aula-virtual-JV'+pathname, hash, search:'', origin,
    href:base+pathname+hash,assign(){throw Error('Unexpected navigation')}
  };
  const fetch=async(uri,options={})=>{
    called.push({uri,options});
    if(uri.includes('/auth/v1/user') && options.method!=='PUT' && userFailure)
      return {ok:false,status:userFailure.status,json:async()=>({code:userFailure.code})};
    if(fetchError)return {ok:false,status:400,json:async()=>({message:'Verificación pendiente'})};
    if(uri.includes('/auth/v1/user')&&options.method!=='PUT')
      return {ok:true,json:async()=>responseUser};
    if(uri.includes('/auth/v1/user')&&options.method==='PUT')
      return {ok:true,json:async()=>({user:responseUser})};
    if(uri.includes('/auth/v1/otp'))
      return {ok:true,json:async()=>({})};
    throw Error('Unexpected URL '+uri);
  };
  const context={
    SUPABASE_URL:'https://testproject.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example',
    localStorage,sessionStorage,location,history:{replaceState(...a){historyCalls.push(a)}},
    fetch,Date,URL,URLSearchParams
  };
  const api=vm.runInNewContext(source+'\n({studentSignedIn,studentSignOut,signedIn,protectStudentAccount,emailStudentLogin,studentAuthUser,studentCallbackError,studentAuthError})',context);
  return {api,localStorage,called,historyCalls};
}
const session={access_token:'student-token',refresh_token:'student-refresh',expires_at:Math.floor(Date.now()/1000)+3600};
const teacherSession={access_token:'teacher-token',refresh_token:'teacher-refresh',expires_at:Math.floor(Date.now()/1000)+3600};

test('student email callback saves only the STUDENT session, preserving existing teacher login',()=>{
  const initial={'aula-supabase-session':JSON.stringify(teacherSession)};
  const x=start({pathname:'/live.html',hash:'#access_token=student-token&refresh_token=student-refresh&expires_in=3600',initial});
  assert.equal(x.api.studentSignedIn(),true);
  assert.equal(x.api.signedIn(),true);
  assert.equal(JSON.parse(x.localStorage.getItem('aula-student-session')).access_token,'student-token');
  assert.equal(JSON.parse(x.localStorage.getItem('aula-supabase-session')).access_token,'teacher-token');
  assert.equal(x.historyCalls.length,1);
});
test('teacher callbacks preserve the existing teacher session behavior',()=>{
  const x=start({pathname:'/docente.html',hash:'#access_token=teacher-new&refresh_token=teacher-refresh'});
  assert.equal(x.api.signedIn(),true);
  assert.equal(x.api.studentSignedIn(),false);
});
test('email protection updates the CURRENT anonymous user rather than registering again',async()=>{
  const x=start({initial:{'aula-student-session':JSON.stringify(session)}});
  await x.api.protectStudentAccount('  ANA@EJEMPLO.COM ');
  assert.equal(x.called.length,1);
  assert.equal(x.called[0].options.method,'PUT');
  assert.match(x.called[0].uri,/\/auth\/v1\/user\?redirect_to=/);
  assert.match(decodeURIComponent(x.called[0].uri),/student_auth=protected/);
  assert.deepEqual(JSON.parse(x.called[0].options.body),{email:'ana@ejemplo.com'});
  assert.equal(x.called[0].options.headers.Authorization,'Bearer student-token');
  assert.equal(JSON.parse(x.localStorage.getItem('aula-student-session')).access_token,'student-token');
});
test('email login uses a magic-link email and keeps the teacher role separate',async()=>{
  const x=start({pathname:'/live.html'});
  await x.api.emailStudentLogin('  ANA@EJEMPLO.COM ');
  const request=x.called[0];
  assert.match(decodeURIComponent(request.uri),/student_auth=login/);
  assert.equal(JSON.parse(request.options.body).email,'ana@ejemplo.com');
  assert.equal(JSON.parse(request.options.body).create_user,true);
  assert.equal(x.api.studentSignedIn(),false);
});
test('signing out on the student side never signs out the teacher',()=>{
  const x=start({initial:{'aula-student-session':JSON.stringify(session),'aula-supabase-session':JSON.stringify(teacherSession)}});
  x.api.studentSignOut();
  assert.equal(x.api.studentSignedIn(),false);
  assert.equal(x.api.signedIn(),true);
});
test('failed protection preserves the original student session',async()=>{
  const x=start({initial:{'aula-student-session':JSON.stringify(session)},fetchError:true});
  await assert.rejects(async()=>x.api.protectStudentAccount('ana@ejemplo.com'),/Verificación pendiente/);
  assert.equal(x.api.studentSignedIn(),true);
});
test('a definitively rejected user credential can be recovered before its local expiry',async()=>{
  const x=start({initial:{'aula-student-session':JSON.stringify(session),'aula-supabase-session':JSON.stringify(teacherSession)},
    userFailure:{status:401,code:'user_not_found'}});
  await assert.rejects(x.api.studentAuthUser(),/Recupera el acceso/);
  assert.equal(x.api.studentSignedIn(),false);
  assert.equal(x.api.signedIn(),true);
});
test('an unavailable user endpoint never clears a valid saved session',async()=>{
  const x=start({initial:{'aula-student-session':JSON.stringify(session)},userFailure:{status:503}});
  await assert.rejects(x.api.studentAuthUser());
  assert.equal(x.api.studentSignedIn(),true);
});

test('recovery links preserve course and document intent across devices without disclosing identity data',async()=>{
  const x=start({initial:{'aula-student-recovery-code':'MAT-AAAAA-BBBBB-CCCCC','aula-student-document-recovery':'1'}});
  await x.api.emailStudentLogin('alumna@example.com');
  const redirect=new URL(x.called[0].uri).searchParams.get('redirect_to');
  const params=new URL(redirect).searchParams;
  assert.equal(params.get('recovery_code'),'MAT-AAAAA-BBBBB-CCCCC');
  assert.equal(params.get('recovery_document'),'1');
  assert.equal(params.has('email'),false);
  assert.equal(params.has('document_number'),false);
});
test('an expired student email link gives an explicit recovery message',()=>{
  const x=start({hash:'#error=access_denied&error_code=otp_expired'});
  assert.match(x.api.studentCallbackError(),/venció/);
  assert.equal(x.api.studentSignedIn(),false);
});
test('email rate limits explain retry and spam-folder checks',()=>{
  const x=start();
  assert.match(x.api.studentAuthError({status:429}),/Espera unos minutos/);
  assert.match(x.api.studentAuthError({code:'over_email_send_rate_limit'}),/correo no deseado/);
});

test('SMTP recipient restrictions are not reported as an existing account',()=>{
  const x=start();
  const message=x.api.studentAuthError({code:'email_address_not_authorized'});
  assert.match(message,/configuración del envío/);
  assert.doesNotMatch(message,/ya está asociado/);
});
