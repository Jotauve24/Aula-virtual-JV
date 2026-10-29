import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/supabase-client.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const key='aula-supabase-session', studentKey='aula-student-session';
const recoveryToken='e30.'+Buffer.from(JSON.stringify({sub:'fictional-teacher-id'})).toString('base64url')+'.test';
const credential=name=>({access_token:name+'-access',refresh_token:name+'-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600});
const storage=seed=>{const data=new Map(Object.entries(seed||{}));return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
function app({hash='',path='docente.html',teacher=false,fetch:handler}={}) {
  const localStorage=storage({[studentKey]:JSON.stringify(credential('student')),...(teacher?{[key]:JSON.stringify(credential('teacher'))}:{})});
  const sessionStorage=storage(),calls=[],cleaned=[];
  const context={SUPABASE_URL:'https://testproject.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
    location:{hash,pathname:'/Aula-virtual-JV/'+path,search:'?materia=private-course',origin:'https://aula.example',href:'https://aula.example/Aula-virtual-JV/'+path+'?materia=private-course'},
    localStorage,sessionStorage,history:{replaceState:(...args)=>cleaned.push(args[2])},Date,URL,URLSearchParams,atob,
    fetch:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body||'{}')});return handler?handler(url,options):{ok:true,json:async()=>({...credential('new-teacher'),user:{is_anonymous:false}})};}};
  const api=vm.runInNewContext(source+'\n({signInTeacherWithPassword,resetTeacherPassword,updateTeacherPassword,teacherRecoveryPending,teacherCallbackError,teacherAuthError,sendCode,signOut,studentSignOut,signedIn})',context);
  return {api,localStorage,sessionStorage,calls,cleaned,
    reload:()=>vm.runInNewContext(source+'\nteacherRecoveryPending()', {...context,location:{...context.location,hash:''}})};
}
test('password login normalizes only email and saves only the teacher session',async()=>{
 const page=app(),student=page.localStorage.getItem(studentKey);
 await page.api.signInTeacherWithPassword(' DOCENTE@EXAMPLE.TEST ','  private test password  ');
 assert.match(page.calls[0].url,/\/auth\/v1\/token\?grant_type=password$/);
 assert.deepEqual(page.calls[0].body,{email:'docente@example.test',password:'  private test password  '});
 assert.equal(JSON.parse(page.localStorage.getItem(key)).access_token,'new-teacher-access');
 assert.equal(page.localStorage.getItem(studentKey),student);
 assert.doesNotMatch(page.localStorage.getItem(key),/private test password/);
});
test('a rejected or malformed password response preserves previous credentials',async()=>{
 for (const data of [{ok:false,status:400,json:async()=>({code:'invalid_credentials',msg:'Invalid login credentials'})},{ok:true,json:async()=>({user:{is_anonymous:true}})}]) {
  const page=app({teacher:true,fetch:async()=>data}),before=page.localStorage.getItem(key);
  await assert.rejects(page.api.signInTeacherWithPassword('teacher@example.test','incorrect'));
  assert.equal(page.localStorage.getItem(key),before);
 }
});
test('a late password response cannot undo logout or a newer login',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let calls=0;
 const page=app({fetch:async()=>{const n=++calls;if(n===1)await gate;return {ok:true,json:async()=>credential('login-'+n)};}});
 const older=page.api.signInTeacherWithPassword('first@example.test','first');
 await page.api.signInTeacherWithPassword('second@example.test','second');release();
 await assert.rejects(older);assert.equal(JSON.parse(page.localStorage.getItem(key)).access_token,'login-2-access');
 let done;const another=app({fetch:()=>new Promise(resolve=>done=()=>resolve({ok:true,json:async()=>credential('late')}))});
 const pending=another.api.signInTeacherWithPassword('test@example.test','secret');another.api.signOut();done();
 await assert.rejects(pending);assert.equal(another.localStorage.getItem(key),null);assert.ok(another.localStorage.getItem(studentKey));
});
test('teacher email alternatives never create accounts and use a clean teacher callback',async()=>{
 const page=app();await page.api.sendCode(' A@EXAMPLE.TEST ');await page.api.resetTeacherPassword(' A@EXAMPLE.TEST ');
 assert.equal(page.calls[0].body.create_user,false);
 assert.match(page.calls[1].url,/\/auth\/v1\/recover\?/);
 for (const call of page.calls) {
  const url=new URL(call.url);assert.equal(url.searchParams.get('redirect_to'),'https://aula.example/Aula-virtual-JV/docente.html');
  assert.equal(call.body.email,'a@example.test');
 }
 assert.equal(page.localStorage.getItem(key),null);
});
test('recovery is scoped to the teacher session, survives reload, and removes callback secrets',()=>{
 const hash='#access_token='+recoveryToken+'&refresh_token=recovery-refresh&type=recovery&expires_in=3600';
 const page=app({hash});assert.equal(page.api.teacherRecoveryPending(),true);
 assert.equal(page.sessionStorage.getItem('aula-teacher-password-recovery'),'fictional-teacher-id');
 assert.equal(page.reload(),true);
 assert.deepEqual(page.cleaned,['/Aula-virtual-JV/docente.html?materia=private-course']);
 assert.equal(JSON.parse(page.localStorage.getItem(studentKey)).access_token,'student-access');
 const student=app({hash,path:'live.html',teacher:true});assert.equal(student.api.teacherRecoveryPending(),false);
 assert.equal(JSON.parse(student.localStorage.getItem(key)).access_token,'teacher-access');
 page.api.signOut();assert.equal(page.api.teacherRecoveryPending(),false);
});
test('password changes use the teacher bearer, require authentication, and clear recovery only on success',async()=>{
 const page=app({hash:'#access_token='+recoveryToken+'&refresh_token=refresh&type=recovery'}),student=page.localStorage.getItem(studentKey);
 await assert.rejects(page.api.updateTeacherPassword('short'),/8/);assert.equal(page.calls.length,0);
 await page.api.updateTeacherPassword('a secure fictional password');
 assert.equal(page.calls[0].method,'PUT');assert.match(page.calls[0].url,/\/auth\/v1\/user$/);
 assert.equal(page.calls[0].headers.Authorization,'Bearer '+recoveryToken);
 assert.deepEqual(page.calls[0].body,{password:'a secure fictional password'});
 assert.equal(page.api.teacherRecoveryPending(),false);assert.equal(page.localStorage.getItem(studentKey),student);
 const guest=app();await assert.rejects(guest.api.updateTeacherPassword('a secure fictional password'));assert.equal(guest.calls.length,0);
 const failed=app({hash:'#access_token='+recoveryToken+'&refresh_token=refresh&type=recovery',fetch:async()=>({ok:false,status:422,json:async()=>({code:'weak_password'})})});
 await assert.rejects(failed.api.updateTeacherPassword('a secure fictional password'));assert.equal(failed.api.teacherRecoveryPending(),true);
});
test('a recovery flag never follows a different account signed in from another tab',()=>{
 const page=app({hash:'#access_token='+recoveryToken+'&refresh_token=refresh&type=recovery'});
 assert.equal(page.api.teacherRecoveryPending(),true);
 page.localStorage.setItem(key,JSON.stringify(credential('different-account')));
 assert.equal(page.api.teacherRecoveryPending(),false);
});
test('expired links and mail throttling have useful Spanish messages without raw callback details',()=>{
 const page=app({hash:'#error=access_denied&error_code=otp_expired&error_description=private-data'});
 assert.match(page.api.teacherCallbackError(),/venció/);assert.doesNotMatch(page.api.teacherCallbackError(),/private-data/);assert.equal(page.cleaned.length,1);
 assert.match(page.api.teacherAuthError({status:429,code:'over_email_send_rate_limit'}),/límite de correos/);
 assert.match(page.api.teacherAuthError({status:400,code:'invalid_credentials'}),/correo y contraseña/);
 assert.match(page.api.teacherAuthError({status:503,message:'raw backend failure'}),/conexión/);
});
