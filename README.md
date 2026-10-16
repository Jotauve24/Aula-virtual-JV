# AulaVirtualJv

Aula web para organizar los equipos de una materia con un espacio visual por tema. El ingreso, el avatar, la pertenencia al equipo y el chat privado de cada grupo se guardan en Supabase. Las actividades y la mensajería académica continúan en la plataforma Educativa de la universidad.

## Sonido retro opcional

El aula estudiantil y ZombieAdmin tienen un control **🔉 Sonido / 🔇 Sin sonido**
en el encabezado. Por defecto, la música ambiental suena **solo dentro de la sala**
y a un volumen inicial del **3,5 %**; nunca durante el registro ni cuando la
pestaña está oculta. El estado de silencio se recuerda en ese navegador.
Los pasos de registro, la selección de equipo y algunos envíos reproducen
efectos cortos originales de estilo 8 bits, sin sonidos al caminar o teclear.
**Cuando otro compañero envía un mensaje nuevo**, el estudiante recibe un
único tintineo suave por grupo de mensajes, acompañado por el contador y un
breve resaltado del aviso de Chat. Los mensajes propios y los pendientes que
ya existían al entrar no hacen sonar otra vez la notificación. Si está leyendo
el chat, el mensaje se incorpora sin interrupción sonora. El control «Sin
sonido» desactiva también estas notificaciones; no hay avisos del sistema ni
sonidos con la pestaña oculta. El buzón se revisa periódicamente mientras
el aula está abierta, sin notificaciones externas.

**ZombieAdmin** incluye «✉ Simular mensaje» después de elegir un equipo:
permite enseñar el aviso, sonido y chat pendiente con mensajes exclusivamente
ficticios, sin leer ni escribir en chats reales.

La pista de música fue facilitada por el docente a través de una dirección
externa y **no está almacenada ni redistribuida en este repositorio**. Si
el servidor externo no permite reproducirla, se usa una melodía sintética
original y discreta, para que el aula no quede completamente muda.
Los navegadores pueden exigir un clic antes de reproducir audio.
**Antes de usar una grabación reconocible de Nintendo en una página pública,
comprueba los derechos de uso**. Para un despliegue permanente es mejor
utilizar música retro propia o con licencia compatible y alojarla en la
carpeta de recursos del proyecto.

## Pollo con zombi bebé (ambientación)

El aula incluye un **pollo y un zombi bebé** de estilo pixel art, integrados
en el mismo escenario de estudiantes y ZombieAdmin. El pequeño zombi va montado
aproximadamente **el 76 % del tiempo**; después se baja durante unos
**16 segundos**. Durante ese tiempo **el pollo continúa paseando** sin
esperarlo y el zombi recorre otra ruta de forma independiente. Tras explorar
unos segundos, calcula un camino seguro hacia la posición que tendrá el
**pollo en movimiento**, lo alcanza y vuelve a montarse, sin teletransportarse.
Ambos sprites se dibujan a aproximadamente **el 38 %
de su tamaño anterior** para no superar la altura de los otros animales. El pollo recorre los corredores
y las entradas de las mesas utilizando el mapa de colisiones existente, sin
atravesar paredes ni ocupar cupos. Su movimiento es decorativo y está
sincronizado por tiempo, sin conexiones nuevas a Supabase. Ambos permanecen
quietos si el navegador solicita movimiento reducido.

## Sitio publicado

- **Recuperación voluntaria de cuentas estudiantiles:** los estudiantes existentes mantienen su sesión anónima, equipo y avatar. En el aula pueden proteger su perfil mediante correo verificado y regresar desde otro navegador. Quienes perdieron la sesión pueden recuperarla automáticamente tras verificar su correo si ese correo identifica **un solo perfil** en la materia, el perfil antiguo es anónimo y no está conectado. Las solicitudes que pueden resolverse automáticamente **no aparecen como pendientes de aprobación docente**; el estudiante termina la recuperación desde su cuenta verificada. El panel docente muestra únicamente los casos que necesitan identificar al estudiante por otra vía, como correos compartidos o no coincidentes. No se eliminan solicitudes existentes al cambiar esta vista. Esta función requiere Manual Linking y redirecciones configuradas en Supabase (ver supabase/README.md).
- [Ingreso de estudiantes](https://jotauve24.github.io/Aula-virtual-JV/): cada materia usa un código `MAT-…` compartido por el docente. El estudiante registra nombre, apellido, correo y teléfono de contacto, personaliza su avatar y elige un equipo con cupos disponibles.
- Desde el detalle de cada materia activa, **Entrar a la sala · Administrador** abre **ZombieAdmin**, una simulación de la experiencia estudiantil sin código de materia ni inscripción. El docente recorre el mismo mapa como zombi sin etiqueta, abre los temas, pulsa «Quiero este equipo», confirma la elección y prueba «Mi equipo» con su casilla de privacidad y datos ficticios (`jair.demo@ejemplo.com`, `6000-0011`). El chat es de práctica: contiene mensajes ficticios y permite enviar textos y adjuntos de prueba solo en el navegador; nada modifica las inscripciones, cupos, contactos o conversaciones reales. Los chats de estudiantes reales permanecen accesibles solo para sus integrantes. **Reiniciar demostración** comienza el recorrido desde cero.
- **Secciones activas** del panel docente presentan indicadores de materias, estudiantes inscritos y **conectados ahora**. Cada tarjeta permite desplegar **Ver estudiantes conectados** para consultar nombre, grupo y última señal; la misma información está disponible al administrar la materia. Las cifras y la lista proceden de una sola consulta cada 5 segundos; solo se cuentan señales de aula de menos de 15 segundos. El docente/ZombieAdmin no cuenta como alumno. El acceso exige una sesión docente autorizada y únicamente incluye sus materias activas. Si la conexión falla se muestra «—» en lugar de un falso cero.
- [Panel docente](https://jotauve24.github.io/Aula-virtual-JV/docente.html): la cuenta docente autorizada crea materias con la cantidad de grupos y cupos que necesita; puede aumentar o reducir mesas, editar temas e indicaciones, consultar estudiantes, liberar integrantes y abrir o cerrar las inscripciones.
- El mapa muestra exactamente una mesa por grupo, de 1 a 40. Para reducir la cantidad se retiran los últimos grupos vacíos; se conserva su historial y no se desplaza a estudiantes de grupos ocupados. El avatar recorre puertas y pasillos, evitando paredes y muebles.
- Las pestañas **Aula y temas**, **Mi equipo** y **Chat** separan el mapa, los integrantes y la conversación. El chat conserva los colores por participante y admite un adjunto de hasta 10 MB por mensaje: imágenes, PDF, Word, Excel, PowerPoint, TXT, CSV o ZIP. Los archivos se guardan en un bucket privado y solo los integrantes actuales del grupo y su docente autorizado pueden descargarlos.
- Compartir correo y teléfono con el equipo es opcional.

Al abrir una materia, el docente encuentra su código en **Código de la materia** y puede copiarlo. Las materias creadas antes de esta función conservaban solo una huella del código, que no permite recuperar el original. En esos casos, **Generar código nuevo** pide confirmación y guarda uno consultable. El anterior deja de funcionar; los estudiantes pueden ingresar con el nuevo desde su misma sesión y conservan sus perfiles y equipos.

El código de materia no verifica la identidad individual. En la primera inscripción el correo es de contacto, sin verificar. La sesión del navegador permite volver normalmente; antes de cerrar sesión o borrar datos, el alumno puede proteger su cuenta con correo verificado. Si pierde la sesión sin protegerla, la recuperación automática solo funciona cuando el correo verificado coincide con un único perfil anónimo y no conectado; los casos ambiguos requieren revisión. Para cambiar de equipo, el estudiante debe pedir al docente que libere su lugar. La presencia de estudiantes y docentes se consulta periódicamente y muestra sus últimas posiciones, con una caducidad breve para usuarios desconectados.

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

El aula adapta su distribución al ancho disponible. **Ampliar aula** permite trabajar a pantalla completa cuando la plataforma lo admite; el enlace abre la misma aula fuera del iframe si hace falta. Para cambiar de navegador, utiliza «Recuperar tu cuenta» con un correo verificado.

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


