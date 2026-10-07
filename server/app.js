import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createStorage } from './storage.js';
import { rowsFromPaste, rowsFromXlsx } from './roster.js';

const projectRoot=resolve(fileURLToPath(new URL('..', import.meta.url)));
const adminRoot=join(projectRoot,'server','admin');
const maxBodyBytes=1_600_000;
const validId=value=>/^[a-f0-9]{32}$/.test(value||'');
const cleanName=(value,maximum)=>typeof value==='string'?value.normalize('NFC').replace(/\s+/g,' ').trim().slice(0,maximum+1):'';
const cookie=(name,value,secure)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict${secure?'; Secure':''}`;
const limits=new Map();

function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function requiredName(value,max=100){const name=cleanName(value,max);if(name.length<2||name.length>max)fail(`Escribe un nombre de 2 a ${max} caracteres.`);return name;}
function capacity(value){if(!Number.isInteger(value)||value<1||value>100)fail('El cupo debe estar entre 1 y 100.');return value;}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function methodError(res){res.setHeader('Allow','GET, HEAD, POST, PATCH');json(res,405,{error:'Método no permitido.'});}
async function readBody(req){
  if(!req.headers['content-type']?.startsWith('application/json'))fail('Envía los datos en formato JSON.',415);
  let total=0;const chunks=[];
  for await(const chunk of req){total+=chunk.length;if(total>maxBodyBytes)fail('La solicitud es demasiado grande.',413);chunks.push(chunk);}
  try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))fail('Revisa los datos enviados.');return body;}
  catch(error){if(error.status)throw error;fail('El JSON no es válido.');}
}
function rateLimit(address){
  const now=Date.now(), current=limits.get(address)||{count:0,since:now};
  if(now-current.since>15*60_000){current.count=0;current.since=now;}
  current.count++;limits.set(address,current);
  if(current.count>8)fail('Demasiados intentos. Vuelve a probar en 15 minutos.',429);
}
function parseSession(req,storage){
  const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('aula_admin='));
  const token=raw?.slice('aula_admin='.length);
  return {token,session:storage.session(token)};
}
function csvValue(value){
  let text=String(value??'');
  if(/^[\s]*[=+@-]/.test(text))text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}
async function staticFile(res,file,type){
  try{
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
  }catch{json(res,404,{error:'Página no encontrada.'});}
}

export function createApp({storage,adminUsername,adminPassword,publicOrigin='http://127.0.0.1:3000'}={}){
  if(!storage||typeof adminUsername!=='string'||adminUsername.length<3||typeof adminPassword!=='string'||adminPassword.length<14)throw new Error('Configura un usuario docente y una contraseña de al menos 14 caracteres.');
  const expected=new URL(publicOrigin).origin;
  const secure=new URL(expected).protocol==='https:';
  const salt=randomBytes(16),passwordHash=scryptSync(adminPassword,salt,64);
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try{
      const url=new URL(req.url,expected),path=url.pathname;
      if(!['GET','HEAD','POST','PATCH'].includes(req.method))return methodError(res);
      if((req.method==='POST'||req.method==='PATCH')&&req.headers.origin!==expected)fail('Origen no autorizado.',403);
      if(path==='/docente'||path==='/docente/')return staticFile(res,join(adminRoot,'index.html'),'text/html; charset=utf-8');
      if(path==='/docente/admin.js')return staticFile(res,join(adminRoot,'admin.js'),'text/javascript; charset=utf-8');
      if(path==='/docente/admin.css')return staticFile(res,join(adminRoot,'admin.css'),'text/css; charset=utf-8');
      if(path==='/favicon.svg')return staticFile(res,join(projectRoot,'assets','favicon.svg'),'image/svg+xml');
      if(path==='/'||path==='/index.html')return staticFile(res,join(projectRoot,'index.html'),'text/html; charset=utf-8');
      if(/^\/assets\/(app|world|model)\.js$/.test(path))return staticFile(res,join(projectRoot,path),'text/javascript; charset=utf-8');
      if(path==='/assets/styles.css')return staticFile(res,join(projectRoot,path),'text/css; charset=utf-8');
      if(path==='/assets/favicon.svg')return staticFile(res,join(projectRoot,path),'image/svg+xml');
      if(path==='/api/student/course'&&req.method==='POST'){
        const body=await readBody(req);
        if(typeof body.code!=='string'||body.code.length>48)fail('Código de materia incorrecto.');
        const course=storage.findCourseByCode(body.code);
        if(!course){rateLimit(`code:${req.socket.remoteAddress}`);return json(res,404,{error:'No se encontró esa materia.'});}
        return json(res,200,{course:{id:course.id,name:course.name,registrationOpen:!!course.registrationOpen,topics:storage.getTopics(course.id).map(({id,name,instructions,capacity,members})=>({id,name,instructions,capacity,members}))}});
      }
      if(path==='/api/admin/login'&&req.method==='POST'){
        rateLimit(`login:${req.socket.remoteAddress}`);
        const body=await readBody(req);
        const attempt=typeof body.password==='string'&&body.password.length<=500?body.password:'';
        const actual=scryptSync(attempt,salt,64);
        if(!timingSafeEqual(actual,passwordHash)||body.username!==adminUsername)fail('Usuario o contraseña incorrectos.',401);
        limits.delete(`login:${req.socket.remoteAddress}`);
        const session=storage.issueSession();
        res.setHeader('Set-Cookie',cookie('aula_admin',session.token,secure));
        return json(res,200,{username:adminUsername,csrf:session.csrf});
      }
      if(!path.startsWith('/api/admin/'))return json(res,404,{error:'Ruta no encontrada.'});
      const {token,session}=parseSession(req,storage);
      if(!session)fail('Inicia sesión como docente.',401);
      if(path==='/api/admin/me'&&req.method==='GET')return json(res,200,{username:adminUsername,csrf:session.csrf});
      if(req.method==='POST'||req.method==='PATCH'){
        if(req.headers['x-csrf-token']!==session.csrf)fail('La sesión no es válida. Actualiza la página.',403);
      }
      if(path==='/api/admin/logout'&&req.method==='POST'){
        storage.revokeSession(token);
        res.setHeader('Set-Cookie',cookie('aula_admin','',secure)+'; Max-Age=0');
        return json(res,200,{ok:true});
      }
      if(path==='/api/admin/courses'&&req.method==='GET')return json(res,200,{courses:storage.listCourses()});
      if(path==='/api/admin/courses'&&req.method==='POST'){
        const body=await readBody(req);const course=storage.createCourse(requiredName(body.name,120));
        return json(res,201,{course});
      }
      let match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})$/);
      if(match){
        const course=storage.getCourse(match[1]);if(!course)fail('Materia no encontrada.',404);
        if(req.method==='GET')return json(res,200,{course,topics:storage.getTopics(course.id),students:storage.getStudents(course.id)});
        if(req.method==='PATCH'){
          const body=await readBody(req);
          if(typeof body.registrationOpen!=='boolean')fail('Indica si la elección de equipos está abierta.');
          return json(res,200,{course:storage.updateCourse(course.id,{name:requiredName(body.name,120),registrationOpen:body.registrationOpen})});
        }
      }
      match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})\/rotate$/);
      if(match&&req.method==='POST'){
        const code=storage.rotateCode(match[1]);if(!code)fail('Materia no encontrada.',404);
        return json(res,200,{code});
      }
      match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})\/topics$/);
      if(match&&req.method==='POST'){
        const body=await readBody(req),instructions=cleanName(body.instructions||'',1000);
        if(instructions.length>1000)fail('Las instrucciones son demasiado largas.');
        const topic=storage.createTopic(match[1],requiredName(body.name,80),instructions,capacity(body.capacity));
        if(!topic)fail('Materia no encontrada.',404);
        return json(res,201,{topic});
      }
      match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})\/topics\/([a-f0-9]{32})$/);
      if(match&&req.method==='PATCH'){
        const body=await readBody(req),instructions=cleanName(body.instructions||'',1000);
        if(instructions.length>1000)fail('Las instrucciones son demasiado largas.');
        const topic=storage.updateTopic(match[1],match[2],{name:requiredName(body.name,80),instructions,capacity:capacity(body.capacity)});
        if(!topic)fail('Tema no encontrado.',404);return json(res,200,{topic});
      }
      match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})\/roster\/(preview|import)$/);
      if(match&&req.method==='POST'){
        if(!storage.getCourse(match[1]))fail('Materia no encontrada.',404);
        const body=await readBody(req);
        const rows=body.format==='xlsx'?await rowsFromXlsx(Buffer.from(body.xlsxBase64||'','base64')):rowsFromPaste(body.text);
        const preview=storage.previewRoster(match[1],rows);
        if(match[2]==='preview')return json(res,200,{rows:preview});
        if(body.confirmed!==true)fail('Revisa y confirma la importación.');
        return json(res,200,{result:storage.importRoster(match[1],rows)});
      }
      match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})\/students$/);
      if(match&&req.method==='POST'){
        const body=await readBody(req);
        const row={firstName:requiredName(body.firstName,80),lastName:requiredName(body.lastName,100),institutionalUser:cleanName(body.institutionalUser||'',80)};
        if(row.institutionalUser.length>80)fail('El usuario institucional es demasiado largo.');
        const student=storage.addStudent(match[1],row,body.allowDuplicate===true);
        if(!student)fail('Materia no encontrada.',404);return json(res,201,{student});
      }
      match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})\/students\/([a-f0-9]{32})$/);
      if(match&&req.method==='PATCH'){
        const body=await readBody(req);
        if(body.topicId!==null&&!validId(body.topicId))fail('Selecciona un tema válido.');
        const student=storage.updateStudent(match[1],match[2],{firstName:requiredName(body.firstName,80),lastName:requiredName(body.lastName,100),topicId:body.topicId});
        if(!student)fail('Estudiante no encontrado.',404);return json(res,200,{student});
      }
      match=path.match(/^\/api\/admin\/courses\/([a-f0-9]{32})\/export$/);
      if(match&&req.method==='GET'){
        if(!storage.getCourse(match[1]))fail('Materia no encontrada.',404);
        const students=storage.getStudents(match[1]),topics=new Map(storage.getTopics(match[1]).map(t=>[t.id,t.name]));
        const lines=[['Usuario','Apellido','Nombre','Cédula','Teléfono','Tema','Perfil activado'].map(csvValue).join(',')];
        for(const s of students)lines.push([s.institutionalUser,s.lastName,s.firstName,s.nationalId,s.phone,topics.get(s.topicId)||'',s.activatedAt?'Sí':'No'].map(csvValue).join(','));
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="estudiantes.csv"','Cache-Control':'no-store'});
        return res.end('\ufeff'+lines.join('\r\n'));
      }
      return json(res,404,{error:'Ruta no encontrada.'});
    }catch(error){
      const known=Number.isInteger(error.status),unique=String(error.code||'').startsWith('SQLITE_CONSTRAINT');
      const status=known?error.status:unique?409:500;
      json(res,status,{error:known?error.message:unique?'Ya existe un registro con ese identificador.':'No se pudo completar la solicitud.'});
    }
  });
  return server;
}

export function startFromEnvironment(){
  const username=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD;
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  const origin=process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`;
  if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))throw new Error('En producción configura PUBLIC_ORIGIN con HTTPS.');
  const storage=createStorage(process.env.DB_PATH||join(projectRoot,'.local-data','aula.sqlite'));
  const server=createApp({storage,adminUsername:username,adminPassword:password,publicOrigin:origin});
  server.listen(port,host,()=>{console.log(`Panel docente en ${origin}/docente/`);});
  return server;
}
