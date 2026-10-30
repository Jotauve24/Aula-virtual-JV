# Chat flotante y notificaciones · 0.27.0

El estudiante puede conversar con su equipo sin salir del mapa. En computadora, Chat abre una ventana en la esquina inferior derecha con controles para minimizar, ampliar y cerrar. Al minimizar aparece una burbuja con los avatares pixel del equipo y el número de mensajes pendientes. En celular se abre una pantalla completa con Volver al aula. El simulador docente comparte la misma ventana y sigue usando mensajes ficticios.

El formulario se monta una sola vez por conversación. Minimizar, cerrar y cambiar entre Aula y Mi equipo conserva el texto y el archivo seleccionado. Cambiar de cuenta, materia o equipo elimina el formulario anterior. Los borradores no se guardan en almacenamiento persistente. Las llegadas mientras se consulta el historial conservan la posición y muestran Ver mensajes nuevos; solo se marcan leídos cuando la conversación está visible al final. El tutorial mantiene su propio diálogo y no deja consumir sus mensajes mientras cubre el chat.

La cabecera cuenta integrantes presentes usando la presencia verificada del aula. Una conexión desconocida muestra Actualizando conexión. Las burbujas de mensajes usan turquesa para quien escribe y champán para compañeros; sus nombres, horas y avatares mantienen la identidad del remitente.

## Activación de avisos

Dentro del chat, la campana abre Avisos del equipo. Activar notificaciones solicita el permiso inmediatamente desde ese gesto. No se solicita al abrir la página ni se muestra Activas hasta que la suscripción del navegador esté guardada en el servidor. Desactivar elimina la suscripción de este dispositivo. Salir intenta revocarla tanto en el servidor como en el proveedor del navegador.

- Android: navegador compatible y actualizado, conexión HTTPS y permiso de notificaciones del navegador y del sistema.
- iPhone o iPad: iOS/iPadOS 16.4 o posterior; agregar AulavirtualJV a inicio desde Safari, abrirla desde ese icono y activar los avisos con la campana.
- Permiso bloqueado: la interfaz explica que se debe cambiar en ajustes; no repite la solicitud.
- Navegador incompatible o conexión insegura: explica el requisito y mantiene disponibles los avisos dentro del aula.

Los avisos del sistema contienen solamente el nombre de la aplicación y un texto genérico. No incluyen nombres de estudiantes, nombres de grupos, mensajes ni archivos. Al tocarlos, se reutiliza la ventana del aula y se abre la conversación autorizada; otra materia usa la recuperación de una inscripción propia. No se elude la sesión ni se incorpora a nadie a un equipo.

## Implementación del servidor

Las dos migraciones de Web Push agregan tablas privadas con RLS y sin permisos directos para los clientes. Las RPC de suscripción validan sesión, inscripción y proveedores HTTPS permitidos, con un máximo de diez dispositivos por cuenta. Un trigger de inserción en team_messages encola el aviso con pg_net. La función Edge chat-push autentica un token privado y usa Web Push cifrado AES128GCM con VAPID; la biblioteca web-push queda fijada a 3.6.7. El servicio resuelve los destinatarios desde la pertenencia actual en la base de datos y excluye al remitente. Una marca por mensaje evita despachos duplicados. Los errores del proveedor no interrumpen la escritura del mensaje y los endpoints caducados 404/410 se retiran.

Las claves VAPID y el token del webhook se guardan exclusivamente en Supabase Vault, bajo aula_chat_push_vapid y aula_chat_push_hook. No se publican claves privadas. La función Edge usa las variables de servidor de Supabase; verify_jwt está desactivado únicamente porque este webhook verifica su propio token mediante una RPC reservada al rol de servicio. pg_net se registra en extensions y su esquema net no admite a clientes. El service worker no intercepta solicitudes ni agrega caché de archivos del aula.

## Verificación

- npm test: pruebas de inscripción, recuperación, equipos, mensajes, adjuntos, borradores, seguimiento de lectura, permisos, suscripción y service worker.
- npm run check: sintaxis de los módulos y del service worker.
- tests/chat-push.integration.sql: cuentas, materias y endpoints ficticios en una transacción con ROLLBACK. Comprueba acceso, destinatarios, exclusión del remitente, aislamiento de otros equipos, idempotencia, eliminación de endpoints vencidos y permisos de las tablas y RPC. No confirma cambios ni despacha avisos a personas reales.
- El endpoint Edge rechaza una llamada sin el token correcto con HTTP 401. La ruta pg_net → Edge → RPC, con token válido y un identificador inexistente, responde HTTP 200 con sent: 0; no envía notificaciones a personas.
- Revisión visual en navegador con datos ficticios y anchos de computadora, tableta y celular. Los ajustes del sistema operativo, las restricciones de batería y la entrega con el teléfono bloqueado requieren una prueba física en iPhone y Android; no se afirman comprobados mediante la emulación de anchos.

Referencias oficiales: [Web Push de Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit en iOS y iPadOS](https://webkit.org/blog/13878/), [suscripción Web Push](https://web.dev/articles/push-notifications-subscribing-a-user), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) y [web-push](https://github.com/web-push-libs/web-push/tree/v3.6.7).

## Ajuste visual 0.27.1

Las capturas del uso real mostraron que la altura anterior ocupaba casi todo el espacio disponible en una ventana de poca altura. El chat normal pasa a 344 × 464 px como máximo; una conversación sin mensajes se reduce a 336 px de alto. Si el alto disponible es de 620 px o menos, usa 320 × 400 px como máximo y 300 px de alto cuando está vacío. Ampliar conserva la vista grande elegida expresamente. La burbuja pasa a 56 px, los controles mantienen sus áreas de 44 px y el celular conserva su pantalla completa.

El tamaño se basa en el número de mensajes de la respuesta ya autorizada; una actualización fallida no se presenta como una conversación vacía. El primer mensaje permite crecer al tamaño normal y los borradores y archivos conservan el mismo formulario. El menú de avisos elige abrir hacia arriba o abajo según el espacio disponible, y su contenido admite desplazamiento dentro de la pantalla. Los bordes inferiores del historial siguen la ventana redondeada.

Verificación con datos ficticios: pantalla de 1260 × 520 px, tamaños de escritorio y móvil, conversación vacía, primer envío, ampliación, menú de avisos y borrador. La comparación de escala del 150 % usa un marco de prueba; no cambia el zoom del navegador ni el zoom elegido por el usuario. Se conserva la suite de pruebas de la versión anterior.
