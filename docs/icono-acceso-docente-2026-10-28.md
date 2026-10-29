# AulavirtualJV: icono y acceso docente · 0.25.0

## Comportamiento

- Icono vectorial JV sobre un libro en petróleo, champaña y coral. Exportaciones PNG de 32, 180, 192 y 512 píxeles; el arte importante cabe en el área segura del icono adaptable.
- Nombre y nombre corto exactos `AulavirtualJV`, compartidos por las cuatro páginas y el manifiesto. Inicio, alcance e identidad son relativos a la raíz de GitHub Pages y no incluyen códigos de materia ni datos de sesión.
- Inicio de sesión docente por correo y contraseña mediante Supabase Auth. No se registra una cuenta ni se concede el rol docente desde este formulario.
- El enlace alternativo acepta cuentas existentes. Crear o recuperar contraseña abre el formulario de cambio después de recibir una sesión verificada; la marca de recuperación se vincula a esa identidad y sobrevive a una recarga de pestaña.
- Una sesión abierta puede cambiar la contraseña en Mi acceso. Se exige confirmación coincidente y al menos ocho caracteres; Supabase aplica también su política del servidor.
- Los errores de correo y de credenciales se muestran junto al formulario en español. No se reintentan envíos automáticamente. Los controles se bloquean durante cada solicitud y las respuestas anteriores no restauran una sesión cerrada.
- La contraseña se envía exclusivamente al endpoint Auth por HTTPS; no se guarda en almacenamiento ni en parámetros. Se conservan las sesiones independientes de docentes y estudiantes, los permisos y los propietarios existentes.

## Verificación

Pruebas automatizadas del endpoint y carga útil de ingreso, rechazo de credenciales, sesiones separadas, cierre durante solicitudes, competencia entre ingresos, actualización de contraseña, enlace vencido, recuperación entre recargas y cambio de identidad en otra pestaña. Pruebas del controlador real para envíos duplicados, validación, recuperación, errores, cancelación y restauración de controles. Pruebas de manifiesto, rutas de instalación, metadatos y dimensiones PNG.

Revisión en navegador con datos ficticios y red bloqueada a 320, 390, 768 y 1440 píxeles: sin desbordamiento horizontal del documento de la app; campos de 16 píxeles, controles de al menos 44 píxeles, opciones alternativas y cambio desde el panel. Se revisaron capturas de ingreso y recuperación. La instalación real en un iPhone no se simula con estas comprobaciones.

Diagnóstico de producción de solo lectura: los registros Auth confirman respuestas 429 con `over_email_send_rate_limit`; el proveedor de correo está habilitado y la cuenta docente existente tiene correo verificado y contraseña configurada. No se enviaron correos de prueba, no se cambió la contraseña real, no se alteraron cuentas, roles, SMTP ni registros de estudiantes.

El aviso existente de [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) continúa desactivado en la configuración del proyecto. No se modifican planes o ajustes de autenticación desde esta entrega.

No se agrega caché sin conexión ni service worker: esta entrega configura la identidad al añadir la app al inicio. Un acceso directo ya creado puede conservar el icono y nombre anteriores; se debe volver a añadir desde el navegador para actualizarlo.
