# Auditoría técnica de AulaVirtualJv — 15 de octubre de 2026

## Alcance

Revisión del repositorio completo y de los mecanismos que usa el sitio público:
ingreso y registro de estudiantes, recuperación de cuentas, sesiones de Supabase,
equipos, avatar y mapa, presencia, chat y adjuntos privados, panel docente,
ZombieAdmin, audio, páginas HTML, archivos CSS, exportación y pruebas.

El servidor Node.js/SQLite bajo `server/` es un prototipo **independiente** del
sitio publicado en GitHub Pages. Sus pruebas permanecen en la batería automática,
pero no se modificó la lógica de sus bases locales.

## Errores corregidos

1. **Renovaciones concurrentes de sesión.** Las consultas frecuentes del aula,
   la presencia y el chat podían solicitar varios cambios de token al mismo
   tiempo. Ahora comparten una renovación por tipo de sesión (estudiante o
   docente). Una respuesta retrasada no puede restaurar una sesión cerrada ni
   sustituir una cuenta más reciente.
2. **Respuestas antiguas en el panel docente.** Al abrir varias materias de forma
   rápida, una consulta anterior podía terminar después y sobrescribir la
   vista activa. Se descartarán los resultados que ya no correspondan a la
   última petición. Esto también se aplica si el docente cierra sesión.
3. **Animación innecesaria.** ZombieAdmin ya no mantiene su bucle de fotogramas
   mientras está activada la preferencia de accesibilidad de movimiento
   reducido. Los desplazamientos continúan funcionando sin animación.
4. **Indicaciones desactualizadas.** La ayuda del código y la documentación
   ahora explican la recuperación mediante correo verificado, sin recomendar
   volver a inscribirse al cambiar de navegador.
5. **Validación de integridad del sitio.** Se añaden comprobaciones automáticas
   de importaciones locales, recursos usados por las cuatro páginas principales,
   identificadores HTML duplicados y separación entre los puntos de entrada
   de estudiante, docente y ZombieAdmin.

## Verificaciones

- `npm run check`: sintaxis de los controladores JavaScript.
- `npm test`: pruebas del sistema y regresiones, incluidas las nuevas de
  concurrencia de autenticación y cambios de materia.
- GitHub Actions ejecuta ambas comprobaciones al publicar cambios.
- Se revisaron las funciones de Supabase que controlan el acceso a grupos,
  mensajes, adjuntos, sesiones, presencia y recuperación, sin alterar datos
  reales para realizar la auditoría.
- Inspección de los archivos HTML y de la separación del servidor local.

## Puntos a vigilar

**Recuperación de cuentas antiguas.** El correo declarado durante el primer
registro era originalmente un dato de contacto **no verificado**. La recuperación
automática exige hoy verificar el correo, coincidencia única por materia,
perfil anterior anónimo y ausencia de presencia reciente. Aun así, para una
cuenta histórica puede existir riesgo residual si el correo fue escrito
incorrectamente o por otra persona. La mejora futura es verificar el correo
en el alta de *nuevos* perfiles de forma proporcional al nivel de seguridad
requerido, sin migrar automáticamente los existentes.

**Funciones privilegiadas en PostgreSQL.** El asesor de seguridad muestra
avisos relativos a funciones `SECURITY DEFINER` accesibles a usuarios
autenticados. Algunas son deliberadas: los estudiantes anónimos de Supabase
también utilizan el rol `authenticated`, pero cada función debe
comprobar explícitamente identidad y pertenencia. No se recomienda revocar
masivamente permisos porque rompería el chat y las mesas. Es necesario revisar
cada nueva función con pruebas específicas de acceso ajeno.

**Índices de claves foráneas.** El asesor de rendimiento informa de varias
claves foráneas sin índice específico. Con el volumen actual no se ha
confirmado una consulta lenta; primero debe revisarse su uso y el plan
de ejecución antes de introducir índices adicionales.

**Música de terceros.** La reproducción de la pista externa depende del
servidor que la aloja y de los permisos de uso. El aula dispone de música
retro sintetizada de respaldo y un control de silencio; una pista propia o
con licencia apropiada reduciría esa dependencia.

**Prototipo Node.js.** Los archivos `server/` conservan su propósito de
laboratorio local. No deben confundirse con el alojamiento, las cuentas y
los permisos de Supabase en el sitio público.

## Prueba manual recomendada

En dos navegadores distintos, ingresar al mismo equipo con dos estudiantes de
prueba. Comprobar la llegada de mensajes y adjuntos, el contador pendiente,
el silencio de audio, el guardado del avatar, la presencia docente, el cambio
de pestañas y la recuperación de cuenta verificada. Comprobar también un
teléfono real y un navegador con movimiento reducido.

Estas pruebas de interfaz con dos sesiones activas no se sustituyen por las
pruebas automáticas de Node.js. Ningún alumno real debe ser borrado, liberado
de su grupo ni utilizado para ensayar la transferencia de cuentas.
