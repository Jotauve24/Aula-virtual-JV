# Configurar Aula Encuentro con Supabase

El repositorio y GitHub Pages pueden seguir siendo públicos. Supabase guarda
los datos y aplica los permisos. La clave publicable puede estar en el navegador;
la clave secreta y `service_role` **nunca** deben agregarse al repositorio.

## Antes de activar estudiantes

El proyecto **Aula Encuentro** ya está creado y las migraciones están aplicadas.
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
3. Crea una materia y guarda su código cuando aparece. Solo se muestra una vez.
   Añade temas y cupos. Comparte el código con tus estudiantes. No necesitas
   importar correos ni aprobar cada ingreso.

### Registro de estudiantes

En Authentication > Sign In / Providers > Anonymous Sign-Ins activa el ingreso
anónimo. Cada navegador obtiene una sesión privada de Supabase sin contraseña
ni correo de confirmación. El estudiante escribe el código de materia, correo
de contacto, nombres, apellidos y teléfono; luego crea su avatar y elige tema.
El correo proporcionado no se verifica y no debe utilizarse como prueba de
identidad. El perfil permanece en ese navegador mientras no cierre sesión ni
borre los datos del sitio. En otro dispositivo tendría que crear un perfil
nuevo; no existe recuperación por el correo declarado.

## Alcance de este incremento

- El ingreso publicado acepta códigos `MAT-…` y lleva al aula de la materia.
- El código compartido identifica la materia y permite crear un perfil nuevo
  si la inscripción está abierta. No verifica quién escribió los datos.
- Cada estudiante registra correo, nombres, apellidos, teléfono y avatar. Los compañeros
  ven únicamente nombres y avatar de integrantes. Los cupos se adjudican en una
  transacción con bloqueo por materia.
- La elección de equipo es definitiva para el estudiante en esta etapa; el
  docente puede liberarlo para que elija otro. El docente puede cerrar nuevas
  inscripciones. Las migraciones conservan tablas y funciones de chat y de
  preferencias de contacto, pero la interfaz estudiantil solo muestra temas,
  cupos e integrantes. Las actividades y los mensajes se gestionan en Educativa.
  Faltan la edición y exportación avanzada del panel Supabase, la presencia y
  el movimiento compartido.
  El servidor Node/SQLite anterior permanece en `server/` como prototipo local,
  pero **no** comparte datos con Supabase.

## Comprobaciones antes de uso real

Prueba con datos ficticios: docente autorizado, registro nuevo sin confirmación
por correo, recarga que conserva la sesión, inscripción cerrada, dos estudiantes
intentando tomar el último cupo, y acceso de otra materia. Haz copias de seguridad
y define con la universidad si está permitido recoger teléfonos en este servicio.

No envíes por GitHub el archivo de alumnos, credenciales, códigos personales,
exportaciones ni capturas con datos reales. `docente.html` es una página pública
con funciones protegidas por la base de datos; ocultar su URL no es seguridad.
