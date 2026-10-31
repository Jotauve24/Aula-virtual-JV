# Avisos del docente · 0.27.6

En el panel docente, abre una materia y pulsa **Avisos**, junto a **Entrar a la sala**. Escribe título y mensaje, elige **Toda la materia** o un equipo y pulsa **Publicar aviso**. No se publica ningún ejemplo automáticamente. Se admiten diez avisos activos por materia; el historial muestra los activos y los retirados más recientes, hasta treinta.

El estudiante ve los avisos pendientes al ingresar a su perfil, antes de usar el aula o abrir un chat solicitado desde una notificación. Debe pulsar **Entendido** en cada aviso. Mostrarlo, recargar o pulsar Escape no confirma la lectura. Si falla el guardado, el mensaje permanece y permite reintentar. Ante un fallo de la comprobación inicial puede reintentar o volver al inicio. El sondeo del aula y la vuelta a una pestaña visible también consultan avisos nuevos.

La confirmación se guarda en Supabase por ID de aviso e ID del estudiante. La recuperación existente conserva el mismo perfil y sus lecturas al cambiar de navegador o dispositivo. Abrir otro perfil no hereda la confirmación. El icono de avisos permite volver a consultar los mensajes confirmados sin registrarlos otra vez. Un aviso nuevo requiere su propia confirmación.

El docente consulta cantidades y nombres mediante **Ver quiénes confirmaron** y **Actualizar lecturas**. Los datos corresponden a los destinatarios actuales: estudiantes de la materia o del equipo elegido. Quienes ingresen después también reciben los avisos activos que les correspondan. Una confirmación acredita la pulsación de Entendido.

**Retirar aviso** pide confirmación y deja de mostrar el mensaje, conservando las lecturas. El texto publicado no se edita: para corregirlo se retira y se publica uno nuevo. Deshabilitar una materia bloquea su acceso de estudiantes; el docente conserva la consulta y puede retirar avisos. No se modifica la inscripción, el documento, el avatar, el equipo, las conversaciones ni los permisos de notificaciones del dispositivo.

## Datos y permisos

`private.course_notices` y `private.course_notice_reads` tienen RLS y carecen de acceso directo para clientes. Los envoltorios públicos invocadores llaman funciones privadas con búsqueda de esquema vacía y comprobaciones de sesión, propiedad docente, pertenencia a materia y equipo. El estudiante no recibe nombres ni confirmaciones de compañeros. La consulta docente de lecturas tampoco expone correos ni teléfonos.

Publicación, retiro y confirmación siguen el orden de bloqueo por materia de las inscripciones y traslados. El ID de envío evita duplicar un aviso al reintentar un borrador sin cambios; la clave de aviso y estudiante evita duplicar confirmaciones. La lectura no se escribe antes de la confirmación del servidor. Las respuestas tardías se descartan al salir, cambiar de materia o confirmar durante un sondeo. La publicación funciona también sin `crypto.randomUUID`.

La migración se creó con Supabase CLI y se sincronizó con la versión aplicada: `20261031200102_course_notices_with_read_confirmation.sql`. Es aditiva; no publica avisos ni cambia registros existentes. Las pruebas SQL usan registros ficticios y `ROLLBACK`. Al finalizar se comprobó que ambas tablas nuevas seguían vacías. Las advertencias de los asesores de seguridad coinciden con las anteriores; las dos tablas privadas añaden solamente la información esperada de RLS sin políticas, porque su acceso se realiza mediante RPC autorizado.

## Verificación

- 392 pruebas JavaScript aprobadas y sintaxis de 36 módulos.
- Prueba SQL local en PostgreSQL/PGlite y la misma prueba en Supabase: permisos, aislamiento, destinatarios, límites, reintentos, retiro, recuperación y conservación de perfiles.
- Revisión visual con materia y estudiantes ficticios, nombres extensos y marcos de escritorio, 768, 390 y 320 px.
- Publicación a un equipo, consulta de confirmaciones, retiro, lectura explícita, recarga y consulta posterior de mensajes.

Se conservan la paleta y Nunito del proyecto. Son componentes de la interfaz existente; no se cambia la dirección visual. Los controles tienen nombres accesibles, foco visible y objetivos táctiles de al menos 44 px. Los avisos se insertan como texto, nunca como HTML. La revisión utiliza el navegador compatible en lugar del inspector directo.

La revisión visual prioriza el mensaje y su acción de lectura; el formulario docente distingue publicación e historial. Se comprobó que los anchos de página y contenido coinciden (1348, 753, 375 y 305 px útiles), con nombres que se ajustan y sin desplazamiento horizontal. Se corrigió el ancho de las acciones junto al título de materia y se apiló el formulario en tableta. El lint de los componentes termina con cero fallos y un aviso por `padStart`: es el relleno hexadecimal del UUID de envío, no numeración decorativa.
