# Reingreso y recuperación estudiantil · 0.34.1

## Lógica comprobada

| Situación | Comportamiento |
| --- | --- |
| Mismo navegador, sesión conservada | Se renueva la credencial cuando corresponde y se abre la materia autorizada. |
| Otro navegador, dispositivo o almacenamiento independiente de la aplicación instalada | Se solicita un enlace al correo verificado de acceso. El código de materia por sí solo no identifica al estudiante. |
| Registro inicial sin verificar correo | La inscripción existe, pero la credencial permanece en ese navegador. Se ofrece verificar un correo propio dentro del aula. |
| Pérdida de sesión sin haber protegido la cuenta | La recuperación existente exige verificar el correo, una coincidencia única y un propietario anterior anónimo sin presencia reciente. |
| Correo compartido, distinto o perfil protegido por otra cuenta | Se conserva el perfil; no se crea un duplicado ni se elige automáticamente otra identidad. Se mantiene la revisión correspondiente. |

El 19 de noviembre se revisaron las funciones instaladas, los registros agregados de autenticación y las comprobaciones de salud. Las consultas no mostraron un error específico que permita atribuir todos los reportes al mismo motivo. No se consultaron contactos, documentos ni tokens de estudiantes. No se cambiaron inscripciones, equipos o permisos.

## Correcciones

- El código que la portada entrega al aula se captura también al iniciar una recuperación normal. Antes se perdía al consumirse `sessionStorage`, salvo que se usara el botón de registro repetido.
- El enlace verificado transporta el código válido y la intención de recuperación por documento. No incluye documentos, teléfonos o correos en la dirección de retorno. Las autorizaciones siguen comprobándose en el servidor.
- Una cuenta verificada sin código recordado puede localizar perfiles originales mediante `student_recover_document_account`, con las restricciones que ya aplica esa función. Si no encuentra una coincidencia autorizada, permanece disponible el formulario por código.
- Los errores del enlace se muestran antes de consultar una sesión anónima conservada. Un enlace vencido ofrece solicitar otro y no se interpreta como un acceso completado.
- Después de enviar un enlace se puede comprobar la verificación o corregir el correo y solicitar otro. Una cuenta verificada sin inscripciones puede cambiar el correo de recuperación; una sesión con inscripciones conserva su acceso.
- Las renovaciones se coordinan entre pestañas mediante Web Locks cuando está disponible, además de compartir solicitudes dentro de cada página. Se relee la sesión después de adquirir el bloqueo y se conserva la protección frente a cierres de sesión o cambios de cuenta durante la espera.
- Un rechazo de JWT por el servidor permite una única renovación y repetición de la solicitud. Los errores de negocio no se repiten; los fallos temporales no borran la sesión.
- Se corrige el texto del correo en el registro. El aula muestra un aviso descartable de verificación por cuenta y el acceso para recuperar el perfil aparece antes del formulario de primera inscripción.
- Los campos de acceso usan 16 px y los controles nuevos tienen nombres accesibles y áreas táctiles de al menos 44 px.

## Verificación

Se ejecutan las pruebas de renovación, dos pestañas con almacenamiento compartido, credenciales rechazadas, renovación pendiente al cerrar sesión, retorno desde correo en un navegador sin historial, enlaces vencidos, corrección de correo, conservación de perfiles y avisos por cuenta. También se ejecutan las verificaciones generales del repositorio y la sintaxis de los módulos.

La revisión visual usa exclusivamente datos ficticios locales en escritorio y marcos de 390 y 768 px. No se envían correos reales ni se cambian credenciales para las pruebas. La entrega del mensaje por el proveedor SMTP y la apertura en un dispositivo físico del estudiante requieren comprobarse con un caso real; no se dan por verificadas por estas pruebas.

## Orientación para estudiantes

1. Dentro del aula, usar **Verificar mi correo** y abrir el mensaje más reciente. Mantener la sesión original hasta confirmar.
2. Para regresar desde otro navegador, usar **Recuperar mi perfil anterior** y el correo de acceso. No completar otra inscripción.
3. Si el correo abre un navegador interno, abrir el enlace en el navegador donde se quiere usar el aula. El correo también puede protegerse con una dirección diferente a la de contacto; debe recordarse cuál se verificó.
4. Si la recuperación indica que la sesión anterior está en uso, cerrar aquella aula y esperar al vencimiento de su presencia (25 segundos) antes de comprobar nuevamente.

