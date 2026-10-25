import {
  studentSignedIn, studentRpc, studentAuthUser, protectStudentAccount, emailStudentLogin
} from './supabase-client.js?v=0.14.0';

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
async function openSignIn() {
  openDialog('Recuperar mi cuenta','Verifica el correo asociado a tu inscripción anterior. El enlace permite recuperar tu avatar y grupo sin crear otro estudiante.');
  if(studentSignedIn()) {
    // A new registration can hold a fresh anonymous session with NO owned
    // profiles. Such an empty session must not block verified-email recovery.
    // An anonymous session that owns ANY group (even inactive courses) must
    // remain protected to avoid losing an existing student's credentials.
    try {
      const user=await studentAuthUser();
      const verified=user && !user.is_anonymous && user.email_confirmed_at;
      if(verified && localStorage.getItem('aula-student-document-recovery')) {
        await studentRpc('student_recover_document_account');
        const recoveredCourses=await studentRpc('student_owned_courses');
        if(recoveredCourses.length) {
          showOwnedCourses(recoveredCourses);
          setNotice('Tu cuenta está recuperada. Puedes abrir tus materias y usar esta misma cuenta para inscribirte en otra.');
          localStorage.removeItem('aula-student-document-recovery'); return;
        }
      }
      if(verified && localStorage.getItem('aula-student-recovery-code')) {
        await openRecoveryRequest();
        return;
      }
      const courses=await studentRpc('student_owned_courses');
      if(Array.isArray(courses) && courses.length) {
        showOwnedCourses(courses);
        area.append(action(verified?'Recuperar otra materia':'Proteger mi cuenta',
          verified?openRecoveryRequest:openProtection,'primary'));
        return;
      }
      if(!verified && await studentRpc('student_has_any_enrollment')) {
        area.append(element('p','Este navegador ya tiene un perfil registrado. Para no perderlo, protégelo con tu correo antes de cambiar de cuenta.','student-account-hint'));
        area.append(action('Proteger mi cuenta',openProtection,'primary'));
        return;
      }
      if(verified) {
        await openRecoveryRequest();
        return;
      }
    }catch {
      if(studentSignedIn()) {
        setNotice('No pudimos comprobar si este navegador conserva otra inscripción. Inténtalo nuevamente para no perder tu perfil.','error');
        return;
      }
      // An expired/revoked credential was cleared by the Auth client. Let the
      // student request a verified link instead of leaving recovery blocked.
    }
  }
  const form=document.createElement('form');
  const label=element('label','Correo con el que protegiste tu cuenta');label.htmlFor='student-login-email';
  const input=document.createElement('input');input.id='student-login-email';input.name='email';
  input.type='email';input.autocomplete='email';input.required=true;input.maxLength=254;
  input.placeholder='nombre@correo.com';
  const note=element('p','Si aún no protegiste tu cuenta, recibirás un enlace de verificación. Si el correo identifica un único perfil, recuperarás tu equipo automáticamente.','student-account-hint');
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
  localStorage.removeItem('aula-student-recovery-code');
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
  openDialog('Recuperar mi perfil','Introduce el código de tu materia. Si el correo verificado identifica tu inscripción, recuperarás el perfil en este momento, sin crear otro.');
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
  input.value=localStorage.getItem('aula-student-recovery-code')||
    sessionStorage.getItem('aula-course-code')||
    localStorage.getItem('aula-student-course-code')||'';
  const note=element('p','Si tu correo corresponde a un único perfil de esta materia, recuperarás el acceso inmediatamente. Si está compartido, necesitaremos comprobar a quién pertenece.','student-account-hint');
  const submit=element('button','Recuperar mi cuenta','button primary');submit.type='submit';
  form.append(label,input,note,submit);
  form.addEventListener('submit',event=>{event.preventDefault();void runAction(submit,async()=>{
    const code=input.value.trim().toUpperCase().replace(/\s/g,'');
    if(!/^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code))
      throw new Error('Revisa el código de tu materia.');
    const result=await studentRpc('student_request_profile_recovery',{p_code:code});
    if(result.status==='recovered' || result.status==='active'){
      setNotice('¡Perfil recuperado! Entrando a tu materia con tu grupo y avatar…');
      openOwnedCourse(result.course_id);return;
    }
    if(result.status==='protected'){
      setNotice('Este perfil ya tiene una cuenta protegida. Ingresa con el correo que utilizaste para protegerla.','error');
      return;
    }
    if(result.status==='pending' && result.reason==='in_use'){
      setNotice('El perfil original sigue abierto en otro dispositivo. Cierra esa aula y vuelve a comprobar en unos segundos.');
      return;
    }
    if(result.status==='not_found' || (result.status==='pending' && result.reason==='not_found')){
      setNotice('No encontramos una inscripción vinculada a ese correo en esta materia. Comprueba el correo que utilizaste al registrarte; si era otro, solicita ayuda al docente para verificar tu identidad. Tu perfil original se conserva.','error');
      return;
    }
    form.hidden=true;
    setNotice('No pudimos identificar un único perfil con ese correo. Dejamos una solicitud de respaldo para tu docente. Tu inscripción original permanece intacta.');
  });});
  area.append(form,action('Comprobar recuperación',checkRecovered));
}
async function checkRecovered() {
  if(!studentSignedIn())return openSignIn();
  resetNotice();
  try {
    const courses=await studentRpc('student_owned_courses');
    if(Array.isArray(courses) && courses.length){showOwnedCourses(courses);return;}
    const result=await studentRpc('student_complete_profile_recovery');
    if(result.status==='recovered' || result.status==='active'){
      setNotice('¡Cuenta recuperada! Abriendo tu materia…');
      openOwnedCourse(result.course_id);return;
    }
    if(result.status==='in_use'){
      setNotice('Tu sesión anterior está abierta en otro dispositivo. Ciérrala y vuelve a comprobar en unos segundos.');
      return;
    }
    if(result.status==='not_found'){
      setNotice('No encontramos un perfil de estudiante con ese correo verificado. Revisa el correo usado durante la inscripción; si era diferente, solicita ayuda al docente para comprobar tu identidad.','error');
      return;
    }
    setNotice('Todavía no se identificó un perfil único para este correo. Si enviaste una solicitud con un perfil coincidente, tu docente podrá ayudarte a identificarlo.');
  }catch(e){setNotice(e.message||'No pudimos comprobar el acceso.','error');}
}
async function onEmailReturn() {
  const flag=new URLSearchParams(location.search).get('student_auth');
  if(!['login','protected'].includes(flag))return;
  // Never automatically switch an existing classroom session merely due to a redirect.
  if(!studentSignedIn()){
    openDialog('Confirma tu acceso','No pudimos completar el enlace. Abre nuevamente el correo o solicita otro.');
    setNotice('No se encontró una sesión de acceso válida.','error');return;
  }
  if(localStorage.getItem('aula-student-document-recovery')) {
    const verifiedUser=await studentAuthUser();
    if(!verifiedUser || verifiedUser.is_anonymous || !verifiedUser.email_confirmed_at) {
      openDialog('Verifica tu correo','Abre el enlace enviado al correo de tu inscripción anterior para recuperar tu cuenta.');
      return;
    }
    await studentRpc('student_recover_document_account');
    const recoveredCourses=await studentRpc('student_owned_courses');
    if(recoveredCourses.length) {
      showOwnedCourses(recoveredCourses);
      setNotice('Tu cuenta está recuperada. Abre una de tus materias o vuelve al enlace de la nueva materia usando esta sesión.');
      localStorage.removeItem('aula-student-document-recovery'); return;
    }
  }
  const own=await studentRpc('student_owned_courses').catch(()=>null);
  if(!own){
    openDialog('No se pudo comprobar la cuenta','Intenta abrir el enlace de nuevo.');
    return;
  }
  // An explicit duplicate-registration recovery belongs to the selected
  // subject, even if this verified account already owns another subject.
  const selectedCode=localStorage.getItem('aula-student-recovery-code');
  if(selectedCode) {
    try {
      const result=await studentRpc('student_request_profile_recovery',{p_code:selectedCode});
      if(result.status==='recovered' || result.status==='active') {
        openOwnedCourse(result.course_id);return;
      }
    }catch { /* Keep the selected code available for correction or retry. */ }
    await openRecoveryRequest();
    return;
  }
  if(own.length===1){
    // This is safe even when opened in a fresh browser: ownership is server-verified.
    if($('#room').dataset.stage!=='room')openOwnedCourse(own[0].course_id);
    return;
  }
  if(own.length>1){showOwnedCourses(own);return;}
  // A previously requested recovery can complete directly after opening
  // the verified email link. Existing groups/avatars are never recreated.
  try {
    const pending=await studentRpc('student_complete_profile_recovery');
    if(pending.status==='recovered' || pending.status==='active'){
      openOwnedCourse(pending.course_id);return;
    }
  }catch { /* The manual request screen remains available. */ }
  const rememberedCode=localStorage.getItem('aula-student-recovery-code')||
    sessionStorage.getItem('aula-course-code')||
    localStorage.getItem('aula-student-course-code');
  if(rememberedCode){
    try {
      const attempted=await studentRpc('student_request_profile_recovery',{p_code:rememberedCode});
      if(attempted.status==='recovered' || attempted.status==='active'){
        openOwnedCourse(attempted.course_id);return;
      }
    }catch { /* Invalid or expired code can be entered manually. */ }
  }
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
const entryParams = new URLSearchParams(location.search);
if(entryParams.get('login')==='1')void openSignIn();
else void onEmailReturn().catch(()=>{
  openDialog('No se pudo comprobar la cuenta','Tu perfil sigue guardado. Vuelve a intentar recuperar el acceso.');
});
if(target.dataset.stage==='room')void syncProtectButton();
