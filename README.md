# AulaVirtualJv

Aula web para organizar los equipos de una materia con un espacio visual por tema. El ingreso, el avatar, la pertenencia al equipo y el chat privado de cada grupo se guardan en Supabase. Las actividades y la mensajería académica continúan en la plataforma Educativa de la universidad.

## Sitio publicado

- [Ingreso de estudiantes](https://jotauve24.github.io/Aula-virtual-JV/): cada materia usa un código `MAT-…` compartido por el docente. El estudiante registra nombre, apellido, correo y teléfono de contacto, personaliza su avatar y elige un equipo con cupos disponibles.
- Desde el detalle de cada materia activa, **Entrar a la sala · Administrador** abre **ZombieAdmin**, una simulación de la experiencia estudiantil sin código de materia ni inscripción. El docente recorre el mismo mapa como zombi sin etiqueta, abre los temas, pulsa «Quiero este equipo», confirma la elección y prueba «Mi equipo» con su casilla de privacidad y datos ficticios (`jair.demo@ejemplo.com`, `6000-0011`). El chat es de práctica: contiene mensajes ficticios y permite enviar textos y adjuntos de prueba solo en el navegador; nada modifica las inscripciones, cupos, contactos o conversaciones reales. Los chats de estudiantes reales permanecen accesibles solo para sus integrantes. **Reiniciar demostración** comienza el recorrido desde cero.
- **Secciones activas** del panel docente presentan indicadores de materias, estudiantes inscritos y **conectados ahora**. Cada tarjeta permite desplegar **Ver estudiantes conectados** para consultar nombre, grupo y última señal; la misma información está disponible al administrar la materia. Las cifras y la lista proceden de una sola consulta cada 5 segundos; solo se cuentan señales de aula de menos de 15 segundos. El docente/ZombieAdmin no cuenta como alumno. El acceso exige una sesión docente autorizada y únicamente incluye sus materias activas. Si la conexión falla se muestra «—» en lugar de un falso cero.
- [Panel docente](https://jotauve24.github.io/Aula-virtual-JV/docente.html): la cuenta docente autorizada crea materias con la cantidad de grupos y cupos que necesita; puede aumentar o reducir mesas, editar temas e indicaciones, consultar estudiantes, liberar integrantes y abrir o cerrar las inscripciones.
- El mapa muestra exactamente una mesa por grupo, de 1 a 40. Para reducir la cantidad se retiran los últimos grupos vacíos; se conserva su historial y no se desplaza a estudiantes de grupos ocupados. El avatar recorre puertas y pasillos, evitando paredes y muebles.
- Las pestañas **Aula y temas**, **Mi equipo** y **Chat** separan el mapa, los integrantes y la conversación. El chat conserva los colores por participante y admite un adjunto de hasta 10 MB por mensaje: imágenes, PDF, Word, Excel, PowerPoint, TXT, CSV o ZIP. Los archivos se guardan en un bucket privado y solo los integrantes actuales del grupo y su docente autorizado pueden descargarlos.
- Compartir correo y teléfono con el equipo es opcional.

Al abrir una materia, el docente encuentra su código en **Código de la materia** y puede copiarlo. Las materias creadas antes de esta función conservaban solo una huella del código, que no permite recuperar el original. En esos casos, **Generar código nuevo** pide confirmación y guarda uno consultable. El anterior deja de funcionar; los estudiantes pueden ingresar con el nuevo desde su misma sesión y conservan sus perfiles y equipos.

El código de materia no verifica la identidad individual. El correo declarado es de contacto y tampoco se verifica. El perfil estudiantil depende de la sesión anónima guardada en ese navegador: cerrar sesión o borrar los datos del sitio puede impedir recuperar ese perfil. Para cambiar de equipo, el estudiante debe pedir al docente que libere su lugar. La presencia de estudiantes y docentes se consulta periódicamente y muestra sus últimas posiciones, con una caducidad breve para usuarios desconectados.

## Incrustar en E-ducativa

En el editor HTML de la plataforma, usa una altura de aula en lugar de una proporción de video 16:9:

```html
<iframe
  src="https://jotauve24.github.io/Aula-virtual-JV/"
  title="AulaVirtualJv"
  width="100%"
  height="820"
  style="display:block;width:100%;height:85vh;min-height:680px;border:1px solid #d5dfd3;border-radius:12px;"
  allow="fullscreen"
  allowfullscreen>
</iframe>
<p><a href="https://jotauve24.github.io/Aula-virtual-JV/" target="_blank" rel="noopener">Abrir el aula en otra pestaña</a></p>
```

El aula adapta su distribución al ancho disponible. **Ampliar aula** permite trabajar a pantalla completa cuando la plataforma lo admite; el enlace abre la misma aula fuera del iframe si hace falta. Usa siempre el mismo navegador para conservar el perfil.

## Configuración y desarrollo

Consulta [la guía de Supabase](supabase/README.md) para preparar el proyecto y autorizar la cuenta docente. Nunca incluyas claves secretas, códigos privados de materia ni datos personales en el repositorio público.

El servicio `server/` con Node.js y SQLite se conserva como prototipo local independiente. No comparte estudiantes, equipos ni mensajes con el sitio publicado. Para ejecutarlo en desarrollo se requiere Node.js 24, `npm ci`, `ADMIN_USERNAME` y `ADMIN_PASSWORD` en el entorno, y `npm run start:admin`.

```sh
npm ci
npm run check
npm test
```

Un flujo de GitHub Actions valida automáticamente la sintaxis y ejecuta las pruebas de Node.js tras cada actualización de la rama principal o una propuesta de cambios.

Para comprobar la presencia en vivo, entra como estudiante en otro navegador, mantén el aula visible y abre **Ver estudiantes conectados** en el panel docente. Al dejar de transmitir señales, el alumno desaparece de la lista después del margen de 15 segundos. Una pestaña en segundo plano puede dejar de enviar señales; por eso el indicador significa **presencia reciente en el aula**, no necesariamente actividad en el chat o atención frente a la pantalla.

Las pruebas de modelo y adjuntos se pueden ejecutar sin dependencias: `node tests/model.test.js` y `node tests/attachments.test.js`. Cubren el número de mesas, rutas sin atravesar paredes, objetivos bloqueados, formatos y límites de archivos. `tests/database.integration.sql` verifica grupos, permisos, privacidad de adjuntos e idempotencia dentro de una transacción que termina en `ROLLBACK`; requiere un entorno de Supabase de prueba con las migraciones aplicadas. No sube binarios a Storage. `npm test` también incluye el prototipo Node/SQLite y requiere sus dependencias.

Para revisar la interfaz publicada, comprueba ingreso, elección de equipo, subida y descarga de un archivo, y operaciones docentes con datos ficticios.


