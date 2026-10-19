import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/student-recovery.js',import.meta.url),'utf8')
  .replace(/^import \{[\s\S]*?\} from '[^']+';\s*/,'');
const ownedCourse='11111111-1111-4111-8111-111111111111';
class Element {
  constructor(tag='div'){this.tagName=tag;this.value='';this.textContent='';this.dataset={stage:'registration'};
    this.hidden=false;this.children=[];this.listeners=new Map();this.open=false;this.disabled=false;
  }
  addEventListener(type,callback){this.listeners.set(type,callback);}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  setAttribute(){}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function browser({pending={status:'pending'},own=[],search='',storedCode='',confirmed=true,anonymous=false,hasEnrollment=false}={}){
  const elements=new Map();
  const get=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
  const memory=new Map(storedCode?[['aula-student-course-code',storedCode]]:[]);
  const localStorage={getItem:key=>memory.get(key)||null};
  const sessionStorage={getItem:()=>null};
  const events=[],rpcCalls=[],navigations=[];
  const origin='https://jotauve24.github.io';
  const location={
    origin,search,
    href:origin+'/Aula-virtual-JV/live.html'+search,
    assign:url=>navigations.push(url)
  };
  const studentRpc=async(name,args)=>{
    rpcCalls.push({name,args});
    if(name==='student_has_any_enrollment')return hasEnrollment;
    if(name==='student_owned_courses')return own;
    if(name==='student_complete_profile_recovery')return pending;
    if(name==='student_request_profile_recovery')return pending;
    throw Error('Unexpected RPC: '+name);
  };
  const context=vm.createContext({
    document:{querySelector:get,createElement:tag=>new Element(tag)},
    studentSignedIn:()=>true,studentRpc,
    studentAuthUser:async()=>({id:'verified',email:'alumno@ejemplo.com',is_anonymous:anonymous,email_confirmed_at:confirmed&&!anonymous?'2026-10-15':null}),
    protectStudentAccount:async()=>{},
    emailStudentLogin:async()=>{},
    localStorage,sessionStorage,location,URL,URLSearchParams,
    MutationObserver:class{observe(){}},
  });
  vm.runInContext(source,context,{filename:'student-recovery.js'});
  return {
    get,context,rpcCalls,navigations,
    check:()=>vm.runInContext('checkRecovered()',context),
    settle:async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);}
  };
}
test('an eligible pending recovery immediately opens its ORIGINAL classroom',async()=>{
  const page=browser({pending:{status:'recovered',course_id:ownedCourse}});
  await page.check();
  assert.deepEqual(page.rpcCalls.map(x=>x.name),
    ['student_owned_courses','student_complete_profile_recovery']);
  assert.equal(page.navigations.length,1);
  assert.match(page.navigations[0],new RegExp('resume_id='+ownedCourse));
  assert.match(page.get('#account-dialog-message').textContent,/recuperada/);
});
test('ambiguous verified email never selects somebody else automatically',async()=>{
  const page=browser();
  await page.check();
  assert.equal(page.navigations.length,0);
  assert.match(page.get('#account-dialog-message').textContent,/docente/);
});
test('protected students still resume their own course without a new recovery',async()=>{
  const page=browser({own:[{course_id:ownedCourse,course_name:'Sistemas I'}]});
  await page.check();
  assert.deepEqual(page.rpcCalls.map(x=>x.name),['student_owned_courses']);
  assert.equal(page.get('#account-dialog-title').textContent,'Tu espacio está guardado');
});
test('the verified email callback finishes an existing pending request automatically',async()=>{
  const page=browser({search:'?student_auth=login',pending:{status:'recovered',course_id:ownedCourse}});
  await page.settle();
  assert.equal(page.navigations.length,1);
  assert.ok(page.rpcCalls.some(x=>x.name==='student_complete_profile_recovery'));
});
test('email callback with the stored course code attempts safe automatic matching',async()=>{
  const page=browser({search:'?student_auth=login',storedCode:'MAT-AAAAA-BBBBB-CCCCC',
    pending:{status:'recovered',course_id:ownedCourse}});
  await page.settle();
  assert.equal(page.navigations.length,1);
});

test('no-match recovery gives clear guidance without promising unreviewable teacher approval',async()=>{
  const page=browser({pending:{status:'not_found'}});
  await vm.runInContext('openRecoveryRequest()',page.context);
  const form=page.get('#account-dialog-content').children.find(item=>item.tagName==='form');
  assert.ok(form,'verified student gets the recovery form');
  const input=form.children.find(item=>item.tagName==='input');
  input.value='MAT-AAAAA-BBBBB-CCCCC';
  form.listeners.get('submit')({preventDefault(){}});
  await page.settle();
  assert.ok(page.rpcCalls.some(call=>call.name==='student_request_profile_recovery'));
  assert.match(page.get('#account-dialog-error').textContent,/No encontramos una inscripción/);
  assert.match(page.get('#account-dialog-error').textContent,/solicita ayuda al docente/);
  assert.doesNotMatch(page.get('#account-dialog-message').textContent,/solicitud de respaldo/);
  assert.equal(page.navigations.length,0);
});
test('historic pending requests with no email match never falsely promise a teacher inbox',async()=>{
  const page=browser({pending:{status:'pending',reason:'not_found'}});
  await vm.runInContext('openRecoveryRequest()',page.context);
  const form=page.get('#account-dialog-content').children.find(item=>item.tagName==='form');
  form.children.find(item=>item.tagName==='input').value='MAT-AAAAA-BBBBB-CCCCC';
  form.listeners.get('submit')({preventDefault(){}});
  await page.settle();
  assert.match(page.get('#account-dialog-error').textContent,/No encontramos una inscripción/);
  assert.equal(page.navigations.length,0);
});

test('legacy orphan claim reports no matching profile rather than waiting for docente approval',async()=>{
  const page=browser({pending:{status:'not_found'}});
  await page.check();
  assert.match(page.get('#account-dialog-error').textContent,/No encontramos un perfil/);
  assert.doesNotMatch(page.get('#account-dialog-message').textContent,/docente podrá ayudarte/);
  assert.equal(page.navigations.length,0);
});

test('sesión anónima SIN inscripción puede abrir el formulario para recuperar la anterior',async()=>{
  const page=browser({anonymous:true,hasEnrollment:false});
  await page.get('#student-sign-in').listeners.get('click')();
  assert.equal(page.get('#student-account-dialog').open,true);
  assert.match(page.get('#account-dialog-title').textContent,/Recuperar mi cuenta/);
  assert.ok(page.get('#account-dialog-content').children.some(child=>child.tagName==='form'));
  assert.deepEqual(page.rpcCalls.map(x=>x.name),['student_has_any_enrollment']);
});
test('sesión anónima CON inscripción no se sustituye al intentar recuperar otra cuenta',async()=>{
  const page=browser({anonymous:true,hasEnrollment:true});
  await page.get('#student-sign-in').listeners.get('click')();
  assert.equal(page.get('#student-account-dialog').open,true);
  assert.ok(page.get('#account-dialog-content').children.some(child=>
    child.textContent==='Proteger mi cuenta'));
  assert.equal(page.get('#account-dialog-content').children.some(child=>child.tagName==='form'),false);
});
