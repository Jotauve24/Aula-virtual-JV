import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/teacher-auth.js',import.meta.url),'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm,'').replace(/^export /gm,'');
class Field {
 constructor(){this.value='';this.type='password';this.disabled=false;this.hidden=false;this.dataset={};this.textContent='';this.listeners=new Map();this.controls=[];}
 addEventListener(n,fn){this.listeners.set(n,fn);}
 setAttribute(n,v){this[n]=v;}
 reportValidity(){return this.valid!==false;}
 querySelectorAll(){return this.controls;}
 focus(){this.focused=true;}
 fire(n='click'){return this.listeners.get(n)?.({preventDefault(){},target:this});}
}
const tick=()=>new Promise(setImmediate);
function boot({signed=false,recovery=false,callbackError='',handlers={}}={}) {
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Field());return nodes.get(id);};
 const calls=[],views=[],notices=[];
 const login=get('#login'),form=get('#teacher-password-form');
 for(const id of ['#teacher-email','#teacher-password','#teacher-login-submit','#teacher-recover-password','#teacher-email-link','#google-login'])login.controls.push(get(id));
 for(const id of ['#teacher-new-password','#teacher-confirm-password','#teacher-password-save','#teacher-password-cancel'])form.controls.push(get(id));
 get('#teacher-email').value='DOCENTE@EXAMPLE.TEST';get('#teacher-password').value='fictional password';
 const toggle=get('#toggle');toggle.dataset.passwordToggle='teacher-password';login.controls.push(toggle);
 const invoke=name=>async(...args)=>{calls.push([name,...args]);if(handlers[name])await handlers[name](...args);};
 const controller=vm.runInNewContext(source+'\ninitTeacherAuth',{
  document:{querySelector:get,querySelectorAll:()=>[toggle]},configured:true,signedIn:()=>signed,
  teacherRecoveryPending:()=>recovery,teacherCallbackError:()=>callbackError,
  signInTeacherWithPassword:invoke('password'),resetTeacherPassword:invoke('recover'),sendCode:invoke('link'),
  updateTeacherPassword:invoke('update'),signOut:()=>calls.push(['logout']),signInWithGoogle:()=>calls.push(['google']),
  googleAvailable:async()=>false,teacherAuthError:e=>e.message
 })({show:id=>views.push(id),onSignedIn:invoke('panel'),onNotice:message=>notices.push(message)});
 return {get,calls,views,notices,controller};
}
test('teacher password entry is primary, deduplicates requests, and restores controls',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const page=boot({handlers:{password:()=>gate}});
 const form=page.get('#login');form.fire('submit');await tick();form.fire('submit');page.get('#teacher-recover-password').fire();await tick();
 assert.equal(page.calls.filter(c=>c[0]==='password').length,1);assert.equal(page.calls.filter(c=>c[0]==='recover').length,0);
 assert.deepEqual(page.calls[0],['password','docente@example.test','fictional password']);
 assert.equal(page.get('#teacher-password').disabled,true);assert.equal(form['aria-busy'],'true');
 release();await tick();assert.equal(page.get('#teacher-password').disabled,false);assert.equal(form['aria-busy'],'false');
 assert.equal(page.get('#teacher-password').value,'');assert.equal(page.calls.filter(c=>c[0]==='panel').length,1);
});
test('email-link and recovery actions validate only email, deduplicate sends, and show neutral confirmation',async()=>{
 for(const [id,action] of [['#teacher-email-link','link'],['#teacher-recover-password','recover']]){
  let release;const gate=new Promise(resolve=>release=resolve);const page=boot({handlers:{[action]:()=>gate}});
  page.get('#teacher-password').valid=false;page.get(id).fire();page.get(id).fire();await tick();
  assert.equal(page.calls.filter(c=>c[0]===action).length,1);release();await tick();
  assert.equal(page.views.at(-1),'verify');assert.match(page.get('#verify-message').textContent,/Si el correo tiene una cuenta/);
  assert.equal(page.get(id).disabled,false);page.get('#teacher-verify-back').fire();assert.equal(page.views.at(-1),'login');
 }
 const invalid=boot();invalid.get('#teacher-email').valid=false;invalid.get('#teacher-recover-password').fire();await tick();assert.equal(invalid.calls.length,0);
});
test('mail limits and wrong passwords stay visible beside usable login fields',async()=>{
 const page=boot({handlers:{recover:()=>{throw Error('Se alcanzó el límite de correos.');},password:()=>{throw Error('Revisa tu correo y contraseña.');}}});
 page.get('#teacher-recover-password').fire();await tick();
 assert.equal(page.views.at(-1),'login');assert.match(page.get('#teacher-auth-error').textContent,/límite/);
 assert.equal(page.get('#teacher-auth-error').hidden,false);assert.equal(page.get('#teacher-login-submit').disabled,false);
 page.get('#login').fire('submit');await tick();assert.match(page.get('#teacher-auth-error').textContent,/contraseña/);
});
test('a recovery callback opens the password form before loading the panel',async()=>{
 const page=boot({signed:true,recovery:true});await tick();assert.equal(page.views.at(-1),'password');assert.equal(page.calls.length,0);
 page.get('#teacher-new-password').value='new password';page.get('#teacher-confirm-password').value='different';
 page.get('#teacher-password-form').fire('submit');await tick();assert.equal(page.calls.length,0);assert.match(page.get('#teacher-password-error').textContent,/no coinciden/);
 page.get('#teacher-confirm-password').value='new password';page.get('#teacher-password-form').fire('submit');await tick();
 assert.deepEqual(page.calls.map(c=>c[0]),['update','panel']);assert.equal(page.get('#teacher-new-password').value,'');assert.equal(page.notices.length,1);
});
test('password saving prevents cancellation and supports retry after server rejection',async()=>{
 let release;let fail=true;const gate=new Promise(resolve=>release=resolve);
 const page=boot({recovery:true,handlers:{update:async()=>{if(fail){await gate;throw Error('Elige una contraseña más segura.');}}}});
 page.get('#teacher-new-password').value='new password';page.get('#teacher-confirm-password').value='new password';
 page.get('#teacher-password-form').fire('submit');await tick();page.get('#teacher-password-cancel').fire();
 assert.equal(page.views.at(-1),'password');assert.equal(page.calls.some(c=>c[0]==='logout'),false);
 release();await tick();assert.equal(page.get('#teacher-password-save').disabled,false);assert.match(page.get('#teacher-password-error').textContent,/más segura/);
 fail=false;page.get('#teacher-password-form').fire('submit');await tick();assert.equal(page.notices.length,1);
});
test('logout invalidates a pending login and resets password visibility',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const page=boot({handlers:{password:()=>gate}});
 page.get('#toggle').fire();assert.equal(page.get('#teacher-password').type,'text');assert.equal(page.get('#toggle')['aria-pressed'],'true');
 page.get('#login').fire('submit');await tick();page.controller.signOut();release();await tick();
 assert.equal(page.calls.some(c=>c[0]==='panel'),false);assert.equal(page.get('#teacher-password').type,'password');assert.equal(page.get('#teacher-password').value,'');
 assert.equal(page.get('#toggle')['aria-pressed'],'false');
});
test('logout allows a fresh attempt before an older network request finishes',async()=>{
 let release,n=0;const gate=new Promise(resolve=>release=resolve);
 const page=boot({handlers:{password:()=>++n===1?gate:undefined}});
 page.get('#login').fire('submit');await tick();page.controller.signOut();
 assert.equal(page.get('#teacher-login-submit').disabled,false);
 page.get('#teacher-password').value='another fictional password';page.get('#login').fire('submit');await tick();
 assert.equal(page.calls.filter(c=>c[0]==='panel').length,1);release();await tick();
 assert.equal(page.calls.filter(c=>c[0]==='panel').length,1);assert.equal(page.get('#teacher-login-submit').disabled,false);
});
