# Configurar Aula Encuentro con Supabase

El repositorio y GitHub Pages pueden seguir siendo públicos. Supabase guarda
los datos y aplica los permisos. La clave publicable puede estar en el navegador;
la clave secreta y `service_role` **nunca** deben agregarse al repositorio.

## Antes de activar estudiantes

1. Crea un proyecto propio en Supabase y anota su URL `https://…supabase.co` y
   su clave **publishable** (`sb_publishable_…`). No importes una lista real aún.
2. En el editor SQL del proyecto ejecuta, en orden, las dos migraciones de
   `supabase/migrations/`. Revísalas en el editor antes de ejecutarlas.
3. En Authentication > Email Templates cambia la plantilla de inicio por correo
   para que muestre el código `{{ .Token }}`. El formulario utiliza un código
   introducido manualmente, no un enlace mágico.
4. Escribe **solo** la URL y la clave publicable en
   `assets/supabase-config.js`. Publica esos cambios en GitHub Pages.
5. Abre `docente.html` y entra con tu correo verificado. El primer ingreso
   crea la cuenta de Auth, pero **no concede permiso docente**. En el editor SQL,
   autoriza expresamente tu cuenta después de comprobar el correo:

   ```sql
   insert into public.teachers(user_id)
   select id from auth.users where lower(email) = lower('TU_CORREO_DOCENTE');
   ```

   Sustituye ese texto por tu correo en el editor privado de Supabase. No lo
   guardes en GitHub. Vuelve a cargar el panel: ahora podrás crear materias.
6. Crea una materia y guarda su código cuando aparece. Solo se muestra una vez.
   Añade temas y cupos. Pega la lista en el formato `Apellido | Nombre | correo`.
   Si no tienes el correo del estudiante, deja esa tercera columna vacía. Al
   entrar, hará una solicitud pendiente que debes asociar a su perfil.

## Alcance de este incremento

- El ingreso publicado conserva `DEMO2026`. Los códigos `MAT-…` llevan a
  `live.html` **solo cuando** hay URL y clave publicable configuradas.
- El correo se verifica por OTP. El código compartido identifica la materia;
  un correo previamente asignado vincula el perfil. Si falta, el docente debe
  aprobar la solicitud antes de mostrar datos personales o temas.
- Cada estudiante confirma nombres, cédula, teléfono y avatar. Los compañeros
  ven únicamente nombres y avatar de integrantes. Los cupos se adjudican en una
  transacción con bloqueo por materia.
- La elección de equipo es definitiva para el estudiante en esta etapa. El
  docente puede cerrar nuevas inscripciones. Faltan la edición y exportación
  avanzada del panel Supabase, el movimiento multijugador y los chats reales.
  El servidor Node/SQLite anterior permanece en `server/` como prototipo local,
  pero **no** comparte datos con Supabase.

## Comprobaciones antes de uso real

Prueba con cuentas y datos ficticios: docente autorizado, estudiante cuyo correo
está en la lista, solicitud pendiente, aprobación, dos estudiantes intentando
tomar el último cupo, y acceso de otra materia. Comprueba además la plantilla
OTP y los límites de envío del proyecto. Haz copias de seguridad y define con
la universidad si está permitido recoger cédula y teléfono en este servicio.

No envíes por GitHub el archivo de alumnos, credenciales, códigos personales,
exportaciones ni capturas con datos reales. `docente.html` es una página pública
con funciones protegidas por la base de datos; ocultar su URL no es seguridad.
