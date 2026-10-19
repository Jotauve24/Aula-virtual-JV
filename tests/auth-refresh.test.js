import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../assets/supabase-client.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const TEST_URL='https://testproject.supabase.co';
const initialSession=(name,expired=true)=>({
  access_token:name+'-access',refresh_token:name+'-refresh',
  expires_at:Math.floor(Date.now()/1000)+(expired?-30:3600)
});
function storage(seed={}){
  const data=new Map(Object.entries(seed));
  return {getItem:key=>data.get(key)||null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key)};
}
function browser({student=true,teacher=false}={}){
  const initial={};
  if(student)initial['aula-student-session']=JSON.stringify(initialSession('student'));
  if(teacher)initial['aula-supabase-session']=JSON.stringify(initialSession('teacher'));
  const localStorage=storage(initial),sessionStorage=storage();
  let releases=[],refreshCount=0,rpcCount=0,signupCount=0,failNext=false;
  const fetch=async(uri,options={})=>{
    if(uri.includes('/auth/v1/token')){
      refreshCount++;
      if(failNext){
        const failure=failNext;failNext=false;
        if(failure.delayed)await new Promise(resolve=>releases.push(resolve));
        return {ok:false,status:failure.status||503,json:async()=>({message:'Temporalmente indisponible',code:failure.code})};
      }
      await new Promise(resolve=>releases.push(resolve));
      const body=JSON.parse(options.body);
      return {ok:true,json:async()=>({
        access_token:'new-'+body.refresh_token,
        refresh_token:'next-'+body.refresh_token,
        expires_in:3600
      })};
    }
    if(uri.includes('/auth/v1/signup')) {
      signupCount++;
      await new Promise(resolve=>releases.push(resolve));
      return {ok:true,json:async()=>({...initialSession('new-student',false),user:{is_anonymous:true}})};
    }
    if(uri.includes('/rest/v1/rpc/')) {
      rpcCount++;
      return {ok:true,json:async()=>({ok:true})};
    }
    throw Error('Unexpected request: '+uri);
  };
  const context=vm.createContext({
    SUPABASE_URL:TEST_URL,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
    location:{hash:'',pathname:'/Aula-virtual-JV/live.html',search:'',origin:'https://aula.example',href:'https://aula.example/live.html'},
    history:{replaceState(){}},localStorage,sessionStorage,fetch,Date,URL,URLSearchParams
  });
  const api=vm.runInContext(code+'\n({studentRpc,rpc,studentSignOut,signOut,studentSignedIn,signedIn,signInStudentAnonymously})',context);
  return {
    api, localStorage,
    get refreshCount(){return refreshCount;},
    get rpcCount(){return rpcCount;},
    get signupCount(){return signupCount;},
    resolveNext(){const fn=releases.shift();assert.ok(fn,'expected refresh request');fn();},
    failOnce(options={}){failNext=options;}
  };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('simultaneous chat and presence RPCs refresh the student session only once',async()=>{
  const app=browser();
  const requests=[app.api.studentRpc('team_chat_read'),app.api.studentRpc('classroom_presence_ping'),app.api.studentRpc('course_room')];
  await settle();
  assert.equal(app.refreshCount,1);
  app.resolveNext();
  await Promise.all(requests);
  assert.equal(app.rpcCount,3);
  assert.equal(JSON.parse(app.localStorage.getItem('aula-student-session')).refresh_token,'next-student-refresh');
});
test('a delayed refresh cannot restore a student after signing out',async()=>{
  const app=browser();
  const pending=app.api.studentRpc('team_chat_read');
  await settle();
  app.api.studentSignOut();
  app.resolveNext();
  await assert.rejects(pending,/La sesión se cerró/);
  assert.equal(app.api.studentSignedIn(),false);
  assert.equal(app.rpcCount,0);
});
test('a refresh from a previous account never overwrites a newer login',async()=>{
  const app=browser();
  const pending=app.api.studentRpc('course_room');
  await settle();
  const newIdentity=initialSession('different',false);
  app.localStorage.setItem('aula-student-session',JSON.stringify(newIdentity));
  app.resolveNext();
  await pending;
  assert.equal(JSON.parse(app.localStorage.getItem('aula-student-session')).refresh_token,newIdentity.refresh_token);
});
test('student and teacher token refreshes stay independent',async()=>{
  const app=browser({student:true,teacher:true});
  const a=app.api.studentRpc('course_room'),b=app.api.rpc('my_courses');
  await settle();
  assert.equal(app.refreshCount,2);
  app.resolveNext();app.resolveNext();
  await Promise.all([a,b]);
  assert.ok(JSON.parse(app.localStorage.getItem('aula-student-session')).refresh_token.startsWith('next-'));
  assert.ok(JSON.parse(app.localStorage.getItem('aula-supabase-session')).refresh_token.startsWith('next-'));
});
test('a failed token refresh can be retried after network recovery',async()=>{
  const app=browser();
  app.failOnce();
  await assert.rejects(app.api.studentRpc('team_chat_read'),/Temporalmente indisponible/);
  const retry=app.api.studentRpc('team_chat_read');
  await settle();
  app.resolveNext();await retry;
  assert.equal(app.refreshCount,2);
});
test('a revoked student credential is cleared without touching the teacher login',async()=>{
  const app=browser({teacher:true});
  app.failOnce({status:400,code:'refresh_token_not_found'});
  await assert.rejects(app.api.studentRpc('my_profile'),/Recupera el acceso/);
  assert.equal(app.api.studentSignedIn(),false);
  assert.equal(app.api.signedIn(),true);
  assert.equal(app.rpcCount,0);
});
test('rate limits preserve the original credential for a later retry',async()=>{
  const app=browser();
  app.failOnce({status:429});
  await assert.rejects(app.api.studentRpc('my_profile'));
  assert.equal(app.api.studentSignedIn(),true);
  assert.equal(JSON.parse(app.localStorage.getItem('aula-student-session')).refresh_token,'student-refresh');
});
test('a late rejection of the old refresh token cannot clear a newer email login',async()=>{
  const app=browser();
  app.failOnce({status:400,code:'refresh_token_already_used',delayed:true});
  const request=app.api.studentRpc('my_profile');
  await settle();
  const verified=initialSession('verified-student',false);
  app.localStorage.setItem('aula-student-session',JSON.stringify(verified));
  app.resolveNext();await request;
  assert.equal(JSON.parse(app.localStorage.getItem('aula-student-session')).access_token,verified.access_token);
});
test('an incomplete expired credential allows the student to start recovery again',async()=>{
  const app=browser();
  app.localStorage.setItem('aula-student-session',JSON.stringify({access_token:'expired',expires_at:1}));
  await assert.rejects(app.api.studentRpc('my_profile'),/Recupera el acceso/);
  assert.equal(app.api.studentSignedIn(),false);
});
test('simultaneous registration requests share a single anonymous signup',async()=>{
  const app=browser({student:false});
  const attempts=[app.api.signInStudentAnonymously(),app.api.signInStudentAnonymously(),app.api.signInStudentAnonymously()];
  await settle();assert.equal(app.signupCount,1);
  app.resolveNext();await Promise.all(attempts);
  assert.equal(app.api.studentSignedIn(),true);
});
test('a pending anonymous signup cannot overwrite a verified session',async()=>{
  const app=browser({student:false});
  const attempt=app.api.signInStudentAnonymously();
  await settle();
  const verified=initialSession('verified-student',false);
  app.localStorage.setItem('aula-student-session',JSON.stringify(verified));
  app.resolveNext();await attempt;
  assert.equal(JSON.parse(app.localStorage.getItem('aula-student-session')).access_token,verified.access_token);
});
