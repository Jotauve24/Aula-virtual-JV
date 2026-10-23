# Configurar AulaVirtualJv con Supabase

El repositorio y GitHub Pages pueden seguir siendo públicos. Supabase guarda
los datos y aplica los permisos. La clave publicable puede estar en el navegador;
la clave secreta y `service_role` **nunca** deben agregarse al repositorio.

## Antes de activar estudiantes

El proyecto **AulaVirtualJv** ya está creado y las migraciones están aplicadas.
La URL y la clave publicable están configuradas en el sitio. La clave secreta
permanece fuera del repositorio. Revisa con la institución el tratamiento de
los datos personales antes de incorporar una lista real.

### Acceso docente con Google

El panel muestra «Entrar con Google» únicamente después de habilitar el
proveedor Google en Supabase. En Google Cloud crea un cliente OAuth de tipo
«Aplicación web» con origen JavaScript
`https://jotauve24.github.io` y URI de redirección
`https://zzxaarehltihndazabfj.supabase.co/auth/v1/callback`. En Supabase,
Authentication > Sign In / Providers > Google, coloca el Client ID y el Client
Secret y habilita el proveedor. Mantén el secreto únicamente en Supabase:
nunca lo coloques en GitHub ni lo envíes por chat. Si Google devuelve el mismo
correo ya verificado, Supabase vincula esa identidad a la cuenta existente;
el permiso docente sigue asociado al identificador de esa cuenta.

1. En Authentication > URL Configuration configura el Site URL con
   `https://jotauve24.github.io/Aula-virtual-JV/` y permite como redirecciones
   `https://jotauve24.github.io/Aula-virtual-JV/docente.html` y
   `https://jotauve24.github.io/Aula-virtual-JV/live.html`. La plantilla gratuita
   predeterminada envía un enlace de acceso. Ábrelo en tu navegador.
2. Abre `docente.html` y entra con tu correo verificado. El primer ingreso
   crea la cuenta de Auth, pero **no concede permiso docente**. En el editor SQL,
   autoriza expresamente tu cuenta después de comprobar el correo:

   ```sql
   insert into public.teachers(user_id)
   select id from auth.users where lower(email) = lower('TU_CORREO_DOCENTE');
   ```

   Sustituye ese texto por tu correo en el editor privado de Supabase. No lo
   guardes en GitHub. Vuelve a cargar el panel: ahora podrás crear materias.
3. Crea una materia. Su código queda guardado y puedes volver a consultarlo y
   copiarlo al abrir la materia en el panel docente. Solo su docente puede verlo.
   Elige la cantidad inicial de mesas y los cupos. Después puedes editar cada
   tema, sus indicaciones y su capacidad, o cambiar la cantidad de grupos.
   Comparte el código con tus estudiantes. No necesitas
   importar correos ni aprobar cada ingreso.

### Registro de estudiantes

En Authentication > Sign In / Providers > Anonymous Sign-Ins activa el ingreso
anónimo. Cada navegador obtiene una sesión privada de Supabase sin contraseña
ni correo de confirmación. El estudiante escribe el código de materia, correo
de contacto, nombres, apellidos, cédula o pasaporte y teléfono; luego crea su avatar y elige tema.
El correo escrito durante la primera inscripción es inicialmente solo de contacto
y **no prueba identidad**. Mientras el estudiante conserva su sesión anónima,
continúa entrando de la misma manera, sin recibir correos nuevos.

### Protección opcional y recuperación

1. En **Authentication > Sign In / Providers > Anonymous Sign-Ins**, habilita
   **Manual Linking**, además del ingreso anónimo. Es necesario para
   convertir la cuenta anónima en permanente conservando el mismo usuario;
   no puede configurarse mediante una migración SQL.
2. En **Authentication > URL Configuration** permite estas redirecciones:
   https://jotauve24.github.io/Aula-virtual-JV/live.html
   y https://jotauve24.github.io/Aula-virtual-JV/live.html**
   Conserva también la del panel docente.
3. Revisa el proveedor SMTP de Supabase Auth, sus límites de envío y
   las plantillas de verificación antes de anunciar la función a la clase.
4. Un alumno que todavía entra desde su navegador habitual puede pulsar
   **Proteger mi cuenta**, elegir un correo propio y confirmar el mensaje.
   Se mantiene su identificador de usuario, grupo, avatar y chat.
5. En otro navegador el alumno pulsa **¿Ya te registraste? Recupera tu cuenta**,
   confirma su correo y abre cualquiera de sus materias. No vuelve a
   inscribirse ni a reservar un cupo.
6. Si perdió la sesión antigua antes de protegerla, verifica el mismo
   correo de contacto y escribe el código de materia. Cuando ese correo
   identifique un **único** perfil dentro de esa materia, el propietario
   anterior sea anónimo y no tenga presencia reciente, el sistema recupera
   el perfil **automáticamente**, sin esperar autorización docente.
   Conserva el ID del estudiante, su tema, avatar, mensajes y archivos;
   únicamente reasigna el usuario autorizado. Si el alumno ya envió una
   solicitud, **Comprobar recuperación** también ejecuta este proceso.
7. Si varios estudiantes compartieron el correo, el correo no coincide o
   el perfil ya tiene una identidad permanente, no se permite una
   apropiación automática. En los casos ambiguos queda disponible la
   solicitud de respaldo y el docente debe verificar la identidad por una
   vía independiente. Si el perfil antiguo sigue conectado, primero debe
   cerrarse esa sesión y esperarse a que deje de registrarse presencia.

**Inscripciones y correos:** las nuevas inscripciones impiden repetir el correo o el teléfono dentro de una misma materia. Los duplicados históricos se conservan y requieren identificar el perfil correcto antes de recuperar el acceso.
La asignación automática requiere verificación del correo por Supabase, una única coincidencia en esa materia, un propietario anterior anónimo y ausencia de presencia reciente.
El código de materia tampoco es una contraseña individual. No anuncies
la función hasta haber probado el envío y la redirección con cuentas
de prueba y haber activado Manual Linking.

## Alcance de este incremento

- El ingreso publicado acepta códigos `MAT-…` y lleva al aula de la materia.
- El código compartido identifica la materia y permite crear un perfil nuevo
  si la inscripción está abierta. No verifica quién escribió los datos.
- Cada estudiante registra correo, nombres, apellidos, documento, teléfono y avatar. Los compañeros
  ven únicamente nombres y avatar de integrantes. Los cupos se adjudican en una
  transacción con bloqueo por materia.
- La elección de equipo es definitiva para el estudiante en esta etapa; el
  docente puede liberarlo para que elija otro. El docente puede cerrar nuevas
  inscripciones. El chat interno de equipo y la preferencia de compartir
  contacto están disponibles para sus integrantes. Las actividades y el
  mensajero académico siguen en Educativa; esta aplicación no los integra.
  Están disponibles la edición de temas y cupos y la configuración de 1 a 40
  mesas. Al reducir, se archivan grupos vacíos sin borrar su historial. No se
  reduce la capacidad de un grupo por debajo de sus integrantes actuales.
  El panel exporta estudiantes a Excel, muestra presencia reciente y permite
  asignar o trasladar estudiantes entre grupos con comprobación de cupos.
  El aula muestra posiciones compartidas y ZombieAdmin conserva una experiencia
  de demostración independiente, con chat ficticio.

## Adjuntos privados del chat

La migración `20261011223933_flexible_classrooms_private_attachments.sql` crea
el bucket privado `team-attachments`, limita cada archivo a 10 MiB y define
las políticas de Storage. La subida requiere pertenecer al equipo y usa una
ruta de materia, grupo, usuario autenticado y nombre UUID. La descarga exige
seguir perteneciendo al equipo; no se crean enlaces públicos. Los compañeros
solo pueden leer archivos asociados a mensajes publicados. El remitente puede
eliminar su propia subida pendiente, pero no un adjunto ya enviado.

`team_chat_send_file` valida pertenencia, ruta y metadatos reales de Storage;
la ruta única hace que reintentar el envío no duplique mensajes. Los permisos
de las nuevas operaciones se implementan en funciones del esquema privado
con envoltorios públicos `security invoker`. La clave secreta no se utiliza
en el navegador. Los archivos se descargan; no se ejecutan ni se incrustan
documentos HTML o SVG en el chat.

## Comprobaciones antes de uso real

Prueba con datos ficticios: docente autorizado, registro nuevo sin confirmación
por correo, recarga que conserva la sesión, inscripción cerrada, dos estudiantes
intentando tomar el último cupo, y acceso de otra materia. Haz copias de seguridad
y define con la universidad si está permitido recoger teléfonos en este servicio.

No envíes por GitHub el archivo de alumnos, credenciales, códigos personales,
exportaciones ni capturas con datos reales. `docente.html` es una página pública
con funciones protegidas por la base de datos; ocultar su URL no es seguridad.



## API histórica retirada

Las funciones `request_course`, `teacher_approve_claim` y `save_my_profile`
pertenecían al ingreso anterior con perfiles precargados. La versión 0.5.0
retira su permiso de ejecución para los roles públicos. Los datos y el historial
de migraciones se conservan; el ingreso actual utiliza `enroll_student`,
`save_student_avatar` y la recuperación con correo verificado.

La función `enroll_student` comprueba también el teléfono mediante
`private.registration_phone_key`, bajo el mismo bloqueo de materia que protege
los cupos y los correos. El aviso de teléfono es preliminar y requiere coincidencia
de nombres; el guardado bloquea el duplicado aunque cambien los nombres o falle
el aviso. `tests/student-contact-guard.integration.sql` prueba los formatos,
la conservación del perfil y el uso de los mismos contactos en otra materia
con datos temporales y `ROLLBACK`.


### Documento único (0.6.0)

El cliente utiliza enroll_student_document. enroll_student queda como compatibilidad
para reabrir perfiles existentes y rechaza registros nuevos. El núcleo de contactos
queda en private.enroll_student_contact, sin permiso EXECUTE de clientes.
private.student_identities posee UNIQUE(document_type,country,document_key), y
private.student_identity_links posee UNIQUE(identity_id,course_id) y un enlace por
student_id. RLS está habilitado sin políticas de acceso directo; los RPC públicos
comprueban auth.uid(), pertenencia al perfil y materia activa. Sus SECURITY DEFINER
son intencionales y usan search_path vacío, como el resto del API del aula.

Los bloqueos transaccionales por cuenta y documento serializan intentos entre
materias; el bloqueo existente por materia conserva los controles de correo,
teléfono y cupos. Una excepción revierte también el INSERT de inscripción.

student_document_status solo devuelve required y reutiliza la identidad de otra
materia del mismo usuario. student_set_document completa un perfil propio sin
editar el documento ya asociado. student_recover_document_account exige correo
verificado y utiliza la recuperación existente, con coincidencia única por materia,
propietario anterior anónimo y sin presencia reciente. El documento no autentica.

No se rellenan documentos históricos por inferencia, ni se alteran los estudiantes
existentes durante la migración. Los números nuevos permanecen en private y no se
copian a students.national_id ni a los listados de compañeros.
