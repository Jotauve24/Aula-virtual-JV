# Revisión de AulaVirtualJv · 23 de octubre de 2026

Versión resultante: **0.6.2**. Base publicada: `7cab53f` (0.6.1).

## Correcciones y mantenimiento

| Área | Hallazgo y cambio |
| --- | --- |
| Registro y regreso | Una respuesta pendiente de inscripción, perfil o sala podía reabrir el aula después de salir. Cada intento verifica que la sesión y la navegación sigan vigentes antes de cambiar la pantalla o guardar accesos directos. |
| Registro preliminar | Salir durante la consulta de teléfono descarta el intento pendiente. La caducidad de la sesión sigue mostrando un mensaje de recuperación. |
| Avatar, documento y equipo | Las operaciones capturan su materia y descartan resultados de un contexto anterior. La preferencia de teléfono tampoco reconstruye una lista de otra materia. |
| Chat | Se impiden envíos simultáneos desde el mismo formulario. El adjunto usa la materia original; si cambia el contexto antes de publicarlo, se intenta cancelar el archivo pendiente. |
| Mensajes pendientes | Un marcador local de lectura dañado deja de interrumpir la actualización del chat. |
| Panel docente | Crear/restaurar materias, administrar grupos, cambiar inscripciones y resolver recuperaciones respetan la navegación actual. Los diálogos se cierran al salir. Una consulta antigua no repone solicitudes de recuperación. |
| Exportación docente | Una exportación pendiente no descarga información después de cerrar sesión. |
| API antigua | Se retira el permiso de ejecución de `teacher_import_roster(uuid,jsonb)`, sin llamadas desde el cliente actual. Se conserva la función y su historial. |
| Rendimiento | Siete índices cubren búsquedas por usuario, materia, equipo y autor, además de referencias de identidades y presencia docente. |
| Archivos y documentación | Se corrige una prueba SQL que aún intentaba crear estudiantes mediante el API anterior sin documento. Se actualizan el alcance, la guía de instalación y las versiones de todos los módulos y páginas. |

La migración aplicada es
`20261023211531_audit_retire_roster_import_and_lookup_indexes.sql`.
No modifica filas reales de estudiantes, equipos, mensajes, documentos ni adjuntos.
Las migraciones anteriores se conservan porque reconstruyen el esquema existente.

## Verificación desde el estudiante y el docente

- **191 pruebas de Node.js aprobadas**, sin fallos ni omisiones; once casos nuevos
  cubren respuestas tardías, cierre de sesión, registro, chat y exportaciones.
- Sintaxis correcta en los **25 módulos** de producción y herramientas.
- Integridad de las cuatro páginas: IDs únicos, referencias locales existentes,
  módulos alcanzables y una sola versión de cada recurso compartido.
- Los **41 nombres de RPC invocados literalmente por el cliente** existen y
  permiten el rol autenticado; ninguna función del esquema público permite
  ejecución al rol `anon`.
- Revisión de permisos de tablas, documentos privados y políticas de Storage.
  No se añadieron permisos de acceso directo a las tablas de aplicación.

Las **siete comprobaciones SQL** se ejecutaron en la base de datos con cuentas y
materias sintéticas, dentro de transacciones terminadas en `ROLLBACK`:

| Comprobación | Resultado |
| --- | --- |
| Códigos de materia | Propiedad docente, aislamiento estudiantil, códigos históricos, reanudación y conservación de equipos. |
| Contactos | Bloqueo de correo y teléfono normalizado repetidos; conservación del perfil y contactos permitidos en otras materias. |
| Documentos | Normalización, unicidad global, bloqueo de clientes antiguos, documento de perfiles anteriores y tablas privadas. |
| Equipo y privacidad | Correo visible dentro del propio equipo; teléfono voluntario; otros equipos y estudiantes sin asignación no reciben contactos. |
| Operaciones y adjuntos | Cupos, edición, permisos docentes, mensajes con archivos, idempotencia y aislamiento por equipo. No se suben binarios a Storage. |
| API histórica | Los cuatro accesos retirados no son ejecutables por clientes; la API estudiantil actual sigue habilitada. |
| Recuperación entre navegadores | Rechazo de correo no verificado y de otro correo; protección de sesión antigua activa; recuperación de dos materias con el mismo ID de perfil, avatar, documento, equipo y chat; el propietario anónimo anterior pierde acceso y no aparece otra inscripción. |

La inspección agregada de los datos existentes encontró **cero grupos de correos
repetidos y cero grupos de teléfonos normalizados repetidos dentro de una misma
materia**, y ningún enlace de estudiante a un equipo de otra materia.
Los **45 perfiles anteriores sin documento** deberán completarlo al regresar.
La ausencia de contactos repetidos no acredita que dos inscripciones con datos
distintos pertenezcan a personas distintas. Los documentos son declarados, sin
verificación ante una autoridad.

## Asesores y límites

Después de la migración quedan tres avisos informativos de claves foráneas sin
un índice que coincida completamente: dos pertenecen a `claim_requests`, que ya
no recibe solicitudes del cliente; el tercero es la referencia compuesta de
mensajes a equipo y materia, cuya consulta por equipo ya dispone de índice.
Los avisos de índices aún sin uso se revisan con tráfico representativo; no se
eliminan los recién creados por carecer todavía de estadísticas.

Continúan los avisos asociados al acceso mediante RPC con autorización interna
y RLS sin políticas directas. Las funciones expuestas revisan propiedad o
pertenencia; hacerlas invocadoras o conceder acceso directo indiscriminado no
es un reemplazo seguro. Los estudiantes anónimos de Supabase tienen sesiones
autenticadas, y las políticas de archivos limitan su acceso al equipo propio.
La protección de contraseñas filtradas sigue deshabilitada; el flujo publicado
utiliza enlaces de correo y Google, sin contraseñas.

Referencias para revisar estos avisos:
[funciones expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[sesiones anónimas](https://supabase.com/docs/guides/auth/auth-anonymous),
[índices de claves foráneas](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) y
[contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No se pudo completar una revisión visual interactiva de los recorridos completos
con navegador: la copia local no fue accesible y el navegador restringe páginas
de prueba embebidas. Las pruebas de pantalla usan el controlador real con DOM,
sesiones y red simulados; no sustituyen la revisión de diseño en dispositivos
reales. Tampoco se comprobó la entrega real de correos ni la transferencia de
binarios a Storage. No se enviaron mensajes ni se conservaron cuentas de prueba.
