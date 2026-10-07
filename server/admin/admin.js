const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const modal=$('#modal'),content=$('#modal-content');
let csrf='',courses=[],current=null,importCandidate=null;

function errorAt(selector,message){const el=$(selector);el.textContent=message;el.hidden=!message;}
function openModal(html){content.innerHTML=html;if(!modal.open)modal.showModal();content.querySelector('input,textarea,button')?.focus();}
function closeModal(){modal.close();content.replaceChildren();}
$('#modal-close').addEventListener('click',closeModal);
modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});

async function api(path,{method='GET',body}={}){
  const headers={};if(body!==undefined)headers['Content-Type']='application/json';
  if(method==='POST'||method==='PATCH')headers['X-CSRF-Token']=csrf;
  let response;
  try{response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});}
  catch{throw new Error('No se pudo conectar con el servidor.');}
  let result;try{result=await response.json();}catch{throw new Error('El servidor no devolvió una respuesta válida.');}
  if(!response.ok){if(response.status===401&&path!=='/api/admin/login')showLogin();throw new Error(result.error||'No se pudo completar la acción.');}
  return result;
}
function showLogin(){csrf='';current=null;$('#dashboard').hidden=true;$('#login').hidden=false;$('#password').value='';$('#username').focus();document.title='Ingreso docente · Aula Encuentro';}
function showDashboard(){$('#login').hidden=true;$('#dashboard').hidden=false;document.title='Panel docente · Aula Encuentro';}

$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();errorAt('#login-error','');const button=event.target.querySelector('button');button.disabled=true;
  try{const session=await api('/api/admin/login',{method:'POST',body:{username:$('#username').value.trim(),password:$('#password').value}});csrf=session.csrf;$('#password').value='';showDashboard();await loadCourses();}
  catch(error){errorAt('#login-error',error.message);}
  finally{button.disabled=false;}
});
$('#logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST'});}finally{showLogin();}});
$('#show-course').addEventListener('click',()=>{
  openModal('<span class="eyebrow">NUEVA MATERIA</span><h2 id="modal-title">Abre un aula</h2><p>Cada materia o sección tiene su propio código compartido. Guárdalo cuando se genere.</p><form id="new-course"><label for="new-course-name">Nombre de la materia</label><input id="new-course-name" maxlength="120" required placeholder="Ej.: Sistemas I · Registros"><p class="error" id="modal-error" role="alert" hidden></p><div class="actions"><button class="primary" type="submit">Crear materia</button></div></form>');
  $('#new-course').addEventListener('submit',async event=>{
    event.preventDefault();try{const {course}=await api('/api/admin/courses',{method:'POST',body:{name:$('#new-course-name').value}});closeModal();await loadCourses(course.id);showCode(course.code,course.name);}
    catch(error){errorAt('#modal-error',error.message);}
  });
});
function showCode(code,name){openModal(`<span class="eyebrow">CÓDIGO DE LA MATERIA</span><h2 id="modal-title">${esc(name)}</h2><p>Este código se muestra una sola vez. Guárdalo para compartirlo cuando se habilite el acceso individual de estudiantes.</p><label for="new-code">Código generado</label><input class="code-reveal" id="new-code" readonly value="${esc(code)}"><p class="notice">El código identifica la materia. No verifica por sí solo la identidad de quien intenta entrar.</p><div class="actions"><button class="primary" type="button" id="keep-code">He guardado el código</button></div>`);$('#keep-code').addEventListener('click',closeModal);$('#new-code').select();}

async function loadCourses(selectId=current?.course.id){
  const data=await api('/api/admin/courses');courses=data.courses;
  $('#course-list').innerHTML=courses.length?courses.map(c=>`<button type="button" class="course-item" data-course="${c.id}" aria-current="${selectId===c.id}"><strong>${esc(c.name)}</strong><small>${c.students} estudiantes · ${c.topics} temas</small></button>`).join(''):'<p class="muted">Todavía no hay materias creadas.</p>';
  $('#course-list').querySelectorAll('[data-course]').forEach(button=>button.addEventListener('click',()=>loadDetail(button.dataset.course)));
  if(selectId&&courses.some(c=>c.id===selectId))await loadDetail(selectId);
  else{$('#course-detail').innerHTML='<div class="card empty-state"><h2>Selecciona una materia</h2><p>O crea una nueva para empezar a organizar sus espacios.</p></div>';current=null;}
}
async function loadDetail(id){
  current=await api(`/api/admin/courses/${id}`);const {course,topics,students}=current;
  $('#course-list').querySelectorAll('[data-course]').forEach(button=>button.setAttribute('aria-current',String(button.dataset.course===id)));
  const topicName=new Map(topics.map(t=>[t.id,t.name]));
  $('#course-detail').innerHTML=`<div class="card"><div class="course-top"><div><span class="eyebrow">MATERIA · ${course.registrationOpen?'ELECCIÓN ABIERTA':'ELECCIÓN CERRADA'}</span><h2>${esc(course.name)}</h2><p>Un código compartido para esta materia; cada estudiante tendrá una activación individual.</p></div><div class="actions"><button type="button" class="outline" id="rotate">Cambiar código</button><button type="button" class="outline" id="course-settings">Configurar</button></div></div><div class="statline"><span>${students.length} estudiantes</span><span>${topics.length} temas</span><span>${students.filter(s=>!s.topicId).length} sin equipo</span><span>${students.filter(s=>s.activatedAt).length} perfiles activados</span></div></div>
  <div class="card"><div class="card-head"><div><h2>Espacios de trabajo</h2><p>Define los temas y cuántos estudiantes caben en cada uno.</p></div><button class="small-primary" id="add-topic" type="button">+ Tema</button></div><div class="topic-grid">${topics.length?topics.map(t=>`<article class="topic-card"><h3>${esc(t.name)}</h3><p>${esc(t.instructions)||'Sin indicaciones todavía.'}</p><small>${t.members} de ${t.capacity} lugares</small><button type="button" data-edit-topic="${t.id}">Editar tema</button></article>`).join(''):'<p class="muted">Aún no has definido temas.</p>'}</div></div>
  <div class="card"><div class="card-head"><div><h2>Lista de estudiantes</h2><p>Pega una tabla con Apellido y Nombre, o selecciona tu XLSX.</p></div><button class="small-primary" type="button" id="add-student">+ Estudiante</button></div><div class="import-controls"><div><label for="roster-text">Pegar lista</label><textarea id="roster-text" placeholder="Apellido&#9;Nombre&#10;Soto Luna&#9;Ana María"></textarea></div><div><label for="roster-file">Archivo XLSX</label><input type="file" id="roster-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><p>Se usan Usuario, Apellido y Nombre. Las notas y demás columnas se ignoran.</p><div class="actions"><button class="outline" type="button" id="preview-roster">Revisar importación</button></div></div></div><div id="preview-area"></div><div class="section-head student-list-heading"><h3>${students.length} perfiles</h3><a href="/api/admin/courses/${course.id}/export" id="export-roster">Descargar lista CSV</a></div><div class="table-wrap"><table><thead><tr><th>Estudiante</th><th>Usuario institucional</th><th>Ingreso</th><th>Equipo</th><th>Acción</th></tr></thead><tbody>${students.length?students.map(s=>`<tr><td><strong>${esc(s.firstName)} ${esc(s.lastName)}</strong><small>${s.firstName!==s.originalFirstName||s.lastName!==s.originalLastName?'Nombre corregido':'Avatar provisional'}</small></td><td>${esc(s.institutionalUser)||'—'}</td><td><span class="tag ${s.activatedAt?'':'gray'}">${s.activatedAt?'Activado':'No ha entrado'}</span></td><td>${esc(topicName.get(s.topicId))||'Sin equipo'}</td><td><button type="button" class="outline" data-edit-student="${s.id}">Editar</button></td></tr>`).join(''):'<tr><td colspan="5" class="muted">Todavía no hay estudiantes cargados.</td></tr>'}</tbody></table></div></div>`;
  $('#add-topic').addEventListener('click',()=>topicModal());
  $('#course-settings').addEventListener('click',courseModal);
  $('#rotate').addEventListener('click',()=>{
    openModal('<span class="eyebrow">SEGURIDAD DE LA MATERIA</span><h2 id="modal-title">Cambiar el código</h2><p>El código anterior dejará de funcionar. Avisa a los estudiantes de la materia cuando esté activo su acceso.</p><p id="modal-error" class="error" role="alert" hidden></p><div class="actions"><button type="button" class="primary" id="confirm-rotate">Generar uno nuevo</button></div>');
    $('#confirm-rotate').addEventListener('click',async()=>{try{const {code}=await api(`/api/admin/courses/${id}/rotate`,{method:'POST',body:{}});showCode(code,course.name);}catch(error){errorAt('#modal-error',error.message);}});
  });
  document.querySelectorAll('[data-edit-topic]').forEach(button=>button.addEventListener('click',()=>topicModal(topics.find(t=>t.id===button.dataset.editTopic))));
  document.querySelectorAll('[data-edit-student]').forEach(button=>button.addEventListener('click',()=>studentModal(students.find(s=>s.id===button.dataset.editStudent))));
  $('#add-student').addEventListener('click',()=>studentModal());
  $('#roster-text').addEventListener('input',()=>{importCandidate=null;$('#preview-area').replaceChildren();});
  $('#roster-file').addEventListener('change',()=>{importCandidate=null;$('#preview-area').replaceChildren();});
  $('#preview-roster').addEventListener('click',previewRoster);
}
function courseModal(){const c=current.course;
  openModal(`<span class="eyebrow">CONFIGURACIÓN</span><h2 id="modal-title">${esc(c.name)}</h2><form id="edit-course"><label for="edit-course-name">Nombre de la materia</label><input id="edit-course-name" value="${esc(c.name)}" maxlength="120" required><label class="toggle-row"><input id="registration-open" type="checkbox" ${c.registrationOpen?'checked':''}> Permitir elegir equipo</label><p class="notice">Cerrar la elección impedirá nuevas inscripciones cuando se conecte el ingreso real.</p><p id="modal-error" class="error" role="alert" hidden></p><div class="actions"><button class="primary" type="submit">Guardar cambios</button></div></form>`);
  $('#edit-course').addEventListener('submit',async event=>{event.preventDefault();try{await api(`/api/admin/courses/${c.id}`,{method:'PATCH',body:{name:$('#edit-course-name').value,registrationOpen:$('#registration-open').checked}});closeModal();await loadCourses(c.id);}catch(error){errorAt('#modal-error',error.message);}});
}
function topicModal(topic=null){const id=current.course.id;
  openModal(`<span class="eyebrow">ESPACIO DE TRABAJO</span><h2 id="modal-title">${topic?'Editar tema':'Nuevo tema'}</h2><form id="topic-form"><label for="topic-name">Nombre del tema</label><input id="topic-name" maxlength="80" value="${esc(topic?.name||'')}" required><label for="topic-instructions">Instrucciones</label><textarea id="topic-instructions" maxlength="1000">${esc(topic?.instructions||'')}</textarea><label for="topic-capacity">Cupo máximo</label><input id="topic-capacity" type="number" min="1" max="100" value="${topic?.capacity||4}" required><p id="modal-error" class="error" role="alert" hidden></p><div class="actions"><button class="primary" type="submit">${topic?'Guardar tema':'Crear tema'}</button></div></form>`);
  $('#topic-form').addEventListener('submit',async event=>{event.preventDefault();try{await api(`/api/admin/courses/${id}/topics${topic?'/'+topic.id:''}`,{method:topic?'PATCH':'POST',body:{name:$('#topic-name').value,instructions:$('#topic-instructions').value,capacity:Number($('#topic-capacity').value)}});closeModal();await loadCourses(id);}catch(error){errorAt('#modal-error',error.message);}});
}
function studentModal(student=null){const id=current.course.id;
  openModal(`<span class="eyebrow">ESTUDIANTE</span><h2 id="modal-title">${student?'Editar perfil':'Agregar estudiante'}</h2><form id="student-form"><label for="first-name">Nombres</label><input id="first-name" value="${esc(student?.firstName||'')}" maxlength="80" required><label for="last-name">Apellidos</label><input id="last-name" value="${esc(student?.lastName||'')}" maxlength="100" required>${student?`<label for="topic-id">Equipo asignado</label><select id="topic-id"><option value="">Sin equipo</option>${current.topics.map(t=>`<option value="${t.id}" ${student.topicId===t.id?'selected':''}>${esc(t.name)} (${t.members}/${t.capacity})</option>`).join('')}</select><p class="muted">Cambiar equipo conserva el perfil aunque esté desconectado.</p>`:`<label for="institutional-user">Usuario institucional (si existe)</label><input id="institutional-user" maxlength="80"><label class="toggle-row"><input id="allow-duplicate" type="checkbox"> Permitir coincidencia de nombre revisada</label>`}<p id="modal-error" class="error" role="alert" hidden></p><div class="actions"><button class="primary" type="submit">${student?'Guardar perfil':'Agregar estudiante'}</button></div></form>`);
  $('#student-form').addEventListener('submit',async event=>{event.preventDefault();try{const body={firstName:$('#first-name').value,lastName:$('#last-name').value,...(student?{topicId:$('#topic-id').value||null}:{institutionalUser:$('#institutional-user').value,allowDuplicate:$('#allow-duplicate').checked})};await api(`/api/admin/courses/${id}/students${student?'/'+student.id:''}`,{method:student?'PATCH':'POST',body});closeModal();await loadCourses(id);}catch(error){errorAt('#modal-error',error.message);}});
}
function base64(buffer){const bytes=new Uint8Array(buffer);let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));return btoa(binary);}
async function previewRoster(){const area=$('#preview-area'),file=$('#roster-file').files[0];
  area.innerHTML='<p class="muted" role="status">Leyendo la lista…</p>';
  try{
    let body;
    if(file){if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>1_000_000)throw new Error('Elige un XLSX de menos de 1 MB.');body={format:'xlsx',xlsxBase64:base64(await file.arrayBuffer())};}
    else body={format:'paste',text:$('#roster-text').value};
    const {rows}=await api(`/api/admin/courses/${current.course.id}/roster/preview`,{method:'POST',body});
    importCandidate={courseId:current.course.id,body};
    const counts={new:0,existing:0,possible_duplicate:0,duplicate_in_file:0};rows.forEach(row=>counts[row.status]++);
    area.innerHTML=`<p class="preview-note">${counts.new} nuevos · ${counts.existing} ya existentes · ${counts.possible_duplicate} posibles duplicados · ${counts.duplicate_in_file} repetidos en la lista</p><div class="table-wrap"><table><thead><tr><th>Fila</th><th>Apellido</th><th>Nombre</th><th>Usuario</th><th>Revisión</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.sourceRow}</td><td>${esc(row.lastName)}</td><td>${esc(row.firstName)}</td><td>${esc(row.institutionalUser)||'—'}</td><td><span class="tag ${row.status==='new'?'':'warn'}">${({new:'Nuevo',existing:'Ya existe',possible_duplicate:'Posible duplicado',duplicate_in_file:'Repetido'}[row.status])}</span></td></tr>`).join('')}</tbody></table></div><p class="muted">Solo se agregarán los perfiles nuevos. Las correcciones y equipos existentes se conservarán.</p><div class="actions"><button type="button" class="primary" id="confirm-import" ${counts.new?'':'disabled'}>Importar ${counts.new} estudiantes</button></div><p class="error" id="import-error" role="alert" hidden></p>`;
    $('#confirm-import').addEventListener('click',async()=>{
      if(!importCandidate||importCandidate.courseId!==current.course.id)return;
      const button=$('#confirm-import');button.disabled=true;
      try{const {result}=await api(`/api/admin/courses/${current.course.id}/roster/import`,{method:'POST',body:{...importCandidate.body,confirmed:true}});const id=current.course.id;await loadCourses(id);$('#preview-area').innerHTML=`<p class="preview-note" role="status">Se agregaron ${result.added} estudiantes y se conservaron ${result.skipped} perfiles ya presentes o repetidos.</p>`;}
      catch(error){errorAt('#import-error',error.message);button.disabled=false;}
    });
  }catch(error){importCandidate=null;area.innerHTML=`<p class="error" role="alert">${esc(error.message)}</p>`;}
}

try{const session=await api('/api/admin/me');csrf=session.csrf;showDashboard();await loadCourses();}
catch{showLogin();}
