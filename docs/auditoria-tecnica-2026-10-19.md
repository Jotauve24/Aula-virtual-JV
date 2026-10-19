# Revisión de AulaVirtualJv · 19 de octubre de 2026

Versión revisada: 0.5.0. Punto de partida: `4459040`.

## Correcciones

| Hallazgo | Resultado |
| --- | --- |
| El mismo cliente de sesión se importaba con versiones distintas; cada instancia mantenía su propia cola de renovación. | Todos los recursos JS y CSS utilizan la versión del proyecto. Una prueba recorre las referencias y evita cargar instancias distintas del mismo módulo. |
| Un regreso por correo podía abrir la única materia ya asociada a la cuenta antes de recuperar la materia elegida. | La recuperación explícita respeta la materia seleccionada. Si no coincide, permanece en la recuperación para corregirla. |
| Una cuenta protegida que ya tenía una inscripción recibía otra vez la indicación de protegerse. | El estudiante puede abrir sus materias guardadas o recuperar otra materia. Una sesión anónima con perfiles se conserva. |
| Una credencial revocada podía impedir abrir el formulario de recuperación. | Las respuestas definitivas de Auth liberan únicamente la credencial afectada. Los errores de red, límites y fallos temporales conservan la sesión. |
| Varias solicitudes podían iniciar sesiones anónimas simultáneas. | Comparten una sola solicitud. Una respuesta atrasada no sustituye un acceso verificado más reciente. |
| La salida dejaba accesos directos de una recuperación anterior. | Se limpian los identificadores de reanudación y recuperación al salir o deshabilitarse la materia. |
| El acceso de recuperación podía iniciar también la apertura de la última aula. | La entrada explícita de recuperación tiene una sola ruta. |

## Limpieza

- Se retiraron el servidor Node/SQLite desconectado de producción y su dependencia ExcelJS.
- Se retiraron los perfiles y validaciones de la demostración antigua, la verificación OTP sin uso y las reexportaciones abandonadas.
- La validación de sintaxis ahora descubre todos los módulos, en vez de mantener una lista manual incompleta.
- Se actualizó el alcance y se marcaron las auditorías anteriores como registros históricos.
- Se sustituyó la instrucción antigua de incrustar un iframe por el enlace y código que comparte el docente.
- Se retiró el permiso público de ejecución de `request_course`, `teacher_approve_claim` y `save_my_profile`. No existen llamadas a ellas desde el código publicado ni desde otras funciones de la aplicación.

Las migraciones históricas se conservan. La limpieza no modifica filas de
estudiantes, avatares, equipos, mensajes ni adjuntos. La migración aplicada
`20261019210742_retire_legacy_student_claim_endpoints` modifica permisos de tres
funciones y conserva la API estudiantil actual.

## Verificación

- Node.js 24: sintaxis de todos los módulos y 160 pruebas aprobadas, sin fallos ni pruebas omitidas.
- 19 pruebas nuevas cubren recuperación entre materias, credenciales revocadas, sesiones concurrentes, accesos directos y coherencia de módulos.
- SQL con `ROLLBACK`: los roles `anon` y `authenticated` no pueden ejecutar las funciones antiguas; las funciones actuales siguen disponibles para estudiantes autenticados.
- No se enviaron correos reales ni se crearon inscripciones de prueba en producción.
- La comprobación visual con navegador no pudo completarse en este entorno. Las pruebas de los flujos usan respuestas controladas y no verifican entrega de correo del proveedor.

El asesor de Supabase mantiene avisos asociados a la arquitectura con funciones
RPC autorizadas, RLS sin políticas directas y acceso estudiantil anónimo.
Son revisables en las guías de [funciones expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
y [sesiones anónimas](https://supabase.com/docs/guides/auth/auth-anonymous).
El aviso de [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
no se modificó; el aula utiliza enlaces de correo y Google para ingresar.
