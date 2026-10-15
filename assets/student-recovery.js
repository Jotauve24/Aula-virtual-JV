import {
  studentSignedIn, studentRpc, studentAuthUser, protectStudentAccount, emailStudentLogin
} from './supabase-client.js?v=20261015u';

const $ = selector => document.querySelector(selector);
const dialog = $('#student-account-dialog'), area = $('#account-dialog-content');
const error = $('#account-dialog-error'), message = $('#account-dialog-message');
const validCourseId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const element = (tag, text='', className='') => {
  const node=document.createElement(tag);
  if(text) node.textContent=text;
  if(className) node.className=className;
  return node;
};
let working=false;
function resetNotice() {
  error.hidden=true;error.textContent='';
  message.hidden=true;message.textContent='';
}
function setNotice(value,kind='info') {
  const node=kind==='error'?error:message;
  node.textContent=value;node.hidden=false;
}
function openDialog(title,intro) {
  resetNotice();
  $('#account-dialog-title').textContent=title;
  $('#account-dialog-intro').textContent=intro;
  area.replaceChildren();
  if(!dialog.open)dialog.showModal();
}
function action(label,onClick,variant='secondary') {
  const button=element('button',label,'button '+variant+' student-account-action');
  button.type='button';
  button.addEventListener('click',()=>void onClick(button));
  return button;
}
async function runAction(button,work) {
  if(working)return;
  working=true;button.disabled=true;resetNotice();
  try {await work();}catch(e){setNotice(e.message||'No pudimos completar la solicitud. Inténtalo después.','error');}
  finally{working=false;button.disabled=false;}
}
$('#student-account-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});

async function openProtection() {
  if(!studentSignedIn())return openSignIn();
  openDialog('Protege tu cuenta','Verifica un correo que controles. Así podrás recuperar tu equipo y avatar desde otro navegador.');
  const user=await studentAuthUser().catch(()=>null);
  if(!user){setNotice('No pudimos comprobar tu sesión. Vuelve a intentarlo.','error');return;}
  if(!user.is_anonymous && user.email_confirmed_at) {
    area.append(element('p','Esta cuenta ya tiene un correo verificado: '+user.email,'student-account-success'));
    return;
  }
  const form=document.createElement('form');
  const label=element('label','Correo electrónico para recuperar tu cuenta');label.htmlFor='protect-email';
  const input=document.createElement('input');
  input.id='protect-email';input.type='email';input.name='email';input.autocomplete='email';
  input.placeholder='tucorreo@ejemplo.com';input.maxLength=254;input.required=true;
  const note=element('p','Si el correo registrado en tu materia es compartido, puedes elegir otro correo propio. Tu inscripción no cambia.','student-account-hint');
  const submit=element('button','Enviar verificación','button primary');submit.type='submit';
  form.append(label,input,note,submit);
  form.addEventListener('submit',event=>{event.preventDefault();void runAction(submit,async()=>{
    await protectStudentAccount(input.value);
    form.hidden=true;
    setNotice('Enviamos un enlace de verificación. Ábrelo desde tu correo. No cierres esta sesión hasta verificarla.');
  });});
  area.append(form);
  input.focus();
}
function openSignIn() {
  openDialog('Ya tengo una cuenta','Si protegiste tu cuenta anteriormente, entra con tu correo verificado. No tendrás que registrarte otra vez.');
  if(studentSignedIn()) {
    area.append(element('p','Ya tienes una sesión iniciada en este navegador. Si es tu perfil habitual, protégelo antes de cambiar de cuenta.','student-account-hint'));
    area.append(action('Proteger mi cuenta',openProtection,'primary'));
    return;
  }
  const form=document.createElement('form');
  const label=element('label','Correo con el que protegiste tu cuenta');label.htmlFor='student-login-email';
  const input=document.createElement('input');input.id='student-login-email';input.name='email';
  input.type='email';input.autocomplete='email';input.required=true;input.maxLength=254;
  input.placeholder='nombre@correo.com';
  const note=element('p','Si todavía no verificaste tu correo, recibirás un enlace para crear el acceso seguro. Tu equipo antiguo se recuperará con autorización docente.','student-account-hint');
  const button=element('button','Enviarme enlace de acceso','button primary');
  button.type='submit';
  form.append(label,input,note,button);
  form.addEventListener('submit',event=>{event.preventDefault();void runAction(button,async()=>{
    await emailStudentLogin(input.value);
    form.hidden=true;
    setNotice('Revisa el correo electrónico y abre el enlace. Volverás a AulaVirtualJv para continuar.');
  });});
  area.append(form);
  input.focus();
}
function openOwnedCourse(id) {
  if(!validCourseId(id))return;
  const url=new URL('live.html',location.href);
  url.searchParams.set('resume_id',id);
  location.assign(url.toString());
}
function showOwnedCourses(courses,caption='') {
  openDialog('Tu espacio está guardado',
    caption||'Encontramos las materias asociadas a tu cuenta. Elige la que quieres abrir.');
  for(const course of courses) {
    const row=action(course.course_name+' →',()=>openOwnedCourse(course.course_id),'secondary');
    area.append(row);
  }
  area.append(element('p','Tu grupo, avatar y conversaciones seguirán como los dejaste.','student-account-hint'));
}
async function openRecoveryRequest() {
  openDialog('Recuperar mi perfil','Si ya estabas inscrito, envía una solicitud al docente para recuperar ese mismo perfil sin duplicarlo.');
  const account=await studentAuthUser().catch(()=>null);
  if(!account || account.is_anonymous || !account.email_confirmed_at){
    setNotice('Confirma primero el enlace que llegó a tu correo.','error');return;
  }
  area.append(element('p','Cuenta verificada: '+account.email,'student-account-success'));
  const form=document.createElement('form');
  const label=element('label','Código de tu materia');label.htmlFor='recover-course-code';
  const input=document.createElement('input');input.type='text';input.id='recover-course-code';input.name='code';
  input.placeholder='MAT-XXXXX-XXXXX-XXXXX';input.required=true;input.maxLength=48;
  input.autocapitalize='characters';
  input.value=sessionStorage.getItem('aula-course-code')||
    localStorage.getItem('aula-student-course-code')||'';
  const note=element('p','El docente confirmará qué estudiante eres. El correo por sí solo no permite apropiarse de un equipo.','student-account-hint');
  const submit=element('button','Solicitar recuperación','button primary');submit.type='submit';
  form.append(label,input,note,submit);
  form.addEventListener('submit',event=>{event.preventDefault();void runAction(submit,async()=>{
    const code=input.value.trim().toUpperCase().replace(/\s/g,'');
    if(!/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code))
      throw new Error('Revisa el código de tu materia.');
    const result=await studentRpc('student_request_profile_recovery',{p_code:code});
    if(result.status==='active'){
      await checkRecovered();return;
    }
    form.hidden=true;
    setNotice(result.status==='pending'?
      'Solicitud enviada. Tu docente la revisará. Cuando esté aprobada, vuelve aquí y pulsa «Comprobar recuperación».':
      'La solicitud no está aprobada todavía. Consulta con tu docente.');
  });});
  area.append(form,action('Comprobar recuperación',checkRecovered));
}
async function checkRecovered() {
  if(!studentSignedIn())return openSignIn();
  const courses=await studentRpc('student_owned_courses');
  if(!Array.isArray(courses) || !courses.length){
    resetNotice();setNotice('Aún no encontramos una materia recuperada en esta cuenta. Si ya enviaste una solicitud, espera la aprobación docente.');
    return;
  }
  showOwnedCourses(courses);
}
async function onEmailReturn() {
  const flag=new URLSearchParams(location.search).get('student_auth');
  if(!['login','protected'].includes(flag))return;
  // Never automatically switch an existing classroom session merely due to a redirect.
  if(!studentSignedIn()){
    openDialog('Confirma tu acceso','No pudimos completar el enlace. Abre nuevamente el correo o solicita otro.');
    setNotice('No se encontró una sesión de acceso válida.','error');return;
  }
  const own=await studentRpc('student_owned_courses').catch(()=>null);
  if(!own){
    openDialog('No se pudo comprobar la cuenta','Intenta abrir el enlace de nuevo.');
    return;
  }
  if(own.length===1){
    // This is safe even when opened in a fresh browser: ownership is server-verified.
    if($('#room').dataset.stage!=='room')openOwnedCourse(own[0].course_id);
    return;
  }
  if(own.length>1){showOwnedCourses(own);return;}
  await openRecoveryRequest();
}
$('#student-sign-in').addEventListener('click',openSignIn);
$('#protect-account').addEventListener('click',()=>void openProtection());
async function syncProtectButton() {
  const button=$('#protect-account');
  if(!studentSignedIn() || $('#room').dataset.stage!=='room'){button.hidden=true;return;}
  button.hidden=false;button.textContent='Proteger mi cuenta';
  try{
    const u=await studentAuthUser();
    if(u && !u.is_anonymous && u.email_confirmed_at){
      button.textContent='Cuenta protegida ✓';
      button.title='Tu correo está verificado. Puedes volver desde otros dispositivos.';
    }
  }catch{ /* Keep the optional protection button available. */ }
}
const target=$('#room');
const observer=new MutationObserver(()=>{ if(target.dataset.stage==='room')void syncProtectButton(); });
observer.observe(target,{attributes:true,attributeFilter:['data-stage']});
void onEmailReturn();
if(target.dataset.stage==='room')void syncProtectButton();
