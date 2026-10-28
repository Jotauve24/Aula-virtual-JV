# AulaVirtualJv

Aula web para organizar los equipos de una materia con un espacio visual por tema. El ingreso, el avatar, la pertenencia al equipo y el chat privado de cada grupo se guardan en Supabase. Las actividades y la mensajería académica continúan en la plataforma Educativa de la universidad.

<div align="center">
  <img src="./assets/aula-activa.svg" width="100%" alt="AulaVirtualJv — tu aula, tu equipo" />
  <br /><br />
  <a href="https://jotauve24.github.io/Aula-virtual-JV/">
    <img src="https://img.shields.io/badge/ENTRAR_AL_AULA-468189?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Entrar a AulaVirtualJv" />
  </a>
  <a href="https://jotauve24.github.io/Aula-virtual-JV/docente.html">
    <img src="https://img.shields.io/badge/PANEL_DOCENTE-2A363B?style=for-the-badge&logo=bookstack&logoColor=white" alt="Abrir panel docente" />
  </a>
</div>

## Vista rápida

- Perfiles y avatares para estudiantes.
- Equipos con cupos, mapa interactivo y espacios visuales por tema.
- Chat privado por grupo y archivos adjuntos en almacenamiento protegido.
- Panel docente para materias, grupos, inscripciones y presencia reciente.
- Recuperación voluntaria mediante correo verificado.
- Interfaz accesible, adaptable y con movimiento reducido.

> La plataforma protege los datos mediante permisos de Supabase. Los códigos de materia no deben publicarse en el repositorio ni compartirse fuera del grupo correspondiente.

## Edad y descarga completa (0.18.0)

El registro pide edad en años cumplidos después de los apellidos. Acepta números
enteros de 1 a 120. Los estudiantes anteriores completan únicamente los datos
pendientes al regresar: edad, documento o ambos; conservan su perfil, avatar,
equipo y conversaciones. La edad es la informada al registrarse o completarla,
no una edad calculada a partir de una fecha de nacimiento.

La descarga general conserva las seis columnas originales y añade tipo de
documento, país emisor (ISO), cédula o pasaporte y edad. El documento se obtiene
de la identidad vinculada al estudiante; no depende del campo histórico que
podía estar vacío. Cédulas, pasaportes y teléfonos se exportan como texto para
conservar guiones y ceros. La edad es numérica y un dato pendiente queda en
blanco. Se mantienen filtros, primera fila fija, orden y materias deshabilitadas.

Edad y documento solo se entregan al propio estudiante cuando corresponde y
al propietario de su materia. No se incorporan a los equipos ni al chat. Las
validaciones de identidad y contactos repetidos siguen en el servidor.

## Bloqueo de grupos y asignaciones excepcionales (0.17.0)

El candado junto a cada tema permite bloquear o reabrir su ingreso. El bloqueo
no expulsa integrantes ni desactiva el chat. Los estudiantes pueden consultar
el grupo, pero solo el docente puede asignar a alguien a un grupo bloqueado.

En **Estudiantes y equipos → Asignar a grupo / Cambiar de grupo**, el docente
puede elegir también grupos completos. Si el destino ya alcanzó su cupo, debe
marcar la autorización que muestra el resultado: por ejemplo, de 5/5 a 6/5.
La capacidad configurada se conserva. La autorización se reinicia al cambiar
de destino. Si otro ingreso llena la última plaza durante la asignación,
se actualizan los cupos y aparece la misma autorización antes de reintentar.

El servidor valida el propietario de la materia y mantiene el bloqueo y los
cupos para la elección estudiantil. Conserva perfil, documento, avatar y
mensajes; al trasladar reinicia únicamente el permiso voluntario de compartir
el teléfono con el nuevo equipo. Es posible editar el nombre y las indicaciones
manteniendo el cupo original incluso si el grupo tiene integrantes adicionales.

## Equipo iluminado y nombre compartido (0.16.0)

El equipo elegido se reconoce por una luz suave sobre todo su espacio. Los
rótulos del mapa son más pequeños y transparentes; conservan el nombre, la
ocupación, el estado seleccionado y el acceso por teclado sin tapar los muebles.
En teléfono, la marca se resume a ✓ y la ocupación para mantener 44 px de altura.

En **Mi equipo → lápiz junto al nombre**, cualquier integrante puede guardar un
nombre de 2 a 80 caracteres. El cambio aparece en el mapa, la lista, Mi equipo,
el chat y las lecturas del docente. Los demás integrantes lo reciben al
actualizarse el aula, sin modificar su inscripción, avatar, cupos o mensajes.
El servidor comprueba la pertenencia actual al equipo, la materia activa y la
versión del nombre para evitar que dos cambios se sobrescriban. Rechaza nombres
repetidos en la misma materia. El docente conserva su edición de tema y cupos.
La sala docente permite ensayar el mismo cambio de forma local; reiniciar la
demostración restaura sus nombres sin modificar grupos reales.

## Pantalla completa durante la navegación (0.15.0)

Al pulsar **Ampliar aula**, la portada, el aula estudiantil, el panel docente y
la sala docente comparten un contenedor que permanece abierto. Los enlaces
internos cambian su contenido y actualizan la dirección y el título sin
reemplazar el documento que mantiene la pantalla completa. **Reducir aula**
y **Esc** permiten salir; el panel docente también incluye este control.

Las rutas públicas y los enlaces de recuperación conservan sus direcciones.
Google se abre en el documento principal para permitir su autorización. Salir
a un servicio externo, recargar o cerrar la pestaña depende de las reglas de
pantalla completa del navegador; no se fuerza su reactivación.

Los módulos se inicializan únicamente dentro del contenido. El contenedor
sincroniza la dirección tras limpiar los tokens de acceso y mantiene el
historial de navegación. Véase `docs/fullscreen-navigation-review.md`.

## Acceso y tutorial más claros (0.14.0)

El código y la recuperación comparten una tarjeta. La ayuda se abre desde el
icono junto a la etiqueta del código; se mantienen su nombre accesible, el
teclado y la validación del formulario. El recordatorio del perfil es más breve.

Las instrucciones, el progreso, los ocho pasos y la reproducción del tutorial
forman un solo bloque. El paso actual tiene un resaltado completo y los controles
usan iconos SVG con etiquetas accesibles. La reproducción conserva sus iconos
al alternar pausa/reproducción. En la escena de elección se muestra solamente
la acción de la fase actual: elegir, confirmar o lugar guardado.

## Paletas visuales en todo el sitio (0.13.0)

La portada, el acceso y panel docente, el registro, la recuperación, el estudio de
avatares, el aula de estudiantes y la sala docente combinan las dos paletas
compartidas por el usuario:
petróleo, verde azulado, crema y salvia como base; coral y durazno en los detalles.
Las cursivas y los subrayados se mantienen. Los textos pequeños y los botones
usan variantes oscuras para conservar el contraste.

El formulario de código tiene prioridad, el acceso docente aparece en el
encabezado y los controles poco frecuentes conservan un tamaño cómodo. El
tutorial mantiene sus ocho pasos, pausa, repetición y selección manual. La sala
comparte la misma paleta en encabezados, pestañas, Mi equipo, privacidad del
teléfono, chat y diálogos. `assets/palette.css` concentra los colores y sus roles
para los cuatro puntos de entrada. Los muebles de cada equipo y los personajes
conservan sus identidades; los muros y la entrada también adoptan los colores
elegidos. Se mantienen las rutas, avatares y comportamiento de ingreso.

## Panel docente y guías de diseño (0.10.0)

El panel prioriza el estado de la materia, su código, los equipos y los estudiantes.
Las acciones ocasionales están en **Opciones de la materia**: abrir/cerrar
inscripciones, ajustar mesas y crear temas. El estado de las inscripciones sigue
visible junto al nombre. El desplegable conserva los formularios existentes y
se abre automáticamente cuando una materia activa todavía no tiene temas.

Se incorporaron Taste (`design-taste-frontend`) y Web Design Guidelines de Vercel
en `.agents/skills/`, con instrucciones de uso en `AGENTS.md`. Se mantiene la
identidad del aula y se verifican los cambios con las superficies de navegador
permitidas; no se ejecuta el inspector directo de navegador de Taste.

## Cambiar el nombre de una materia (0.9.1)

En **Mis materias → Administrar → ícono de lápiz junto al nombre**, el docente puede corregir el
nombre de su materia y pulsar **Guardar nombre**. El código compartido, el ID,
los estudiantes, los equipos, los avatares y el chat se conservan. El nombre nuevo
aparece al volver a abrir la materia; los estudiantes que ya tienen el aula
abierta pueden actualizar la página para verlo. También se pueden renombrar
materias deshabilitadas sin restaurarlas.

Las acciones secundarias de editar nombre y editar tema/cupos usan un lápiz
discreto junto al dato correspondiente. Conservan una superficie de 44 × 44 px,
ayuda al pasar el cursor, nombre accesible y el mismo formulario de edición.

El servidor exige que la cuenta sea docente y propietaria de la materia. Solo
actualiza `courses.name`; no se conceden permisos de actualización directa a las
tablas. El formulario valida entre 2 y 120 caracteres, bloquea envíos simultáneos
y descarta respuestas de una materia o sesión anterior.

## Diseño del campus (0.8.1)

La entrada, el registro, el editor de avatar, el aula, Mi equipo, el chat y la
simulación docente comparten un sistema visual cálido: fondo marfil, verde menta,
acentos miel y terracota, tipografía Nunito y controles con profundidad.
La portada presenta el aula actual como una maqueta animada, con una tarjeta guía
por paso. Las escenas siguen el orden real de ingreso. El mapa utiliza colores
propios por equipo y luz decorativa sobre el suelo, sin alterar colisiones,
rutas ni cupos. La marca del equipo elegido se conserva en mapa y lista.

La tipografía se sirve localmente, sin solicitudes a Google Fonts. El subconjunto
variable Nunito y su licencia SIL OFL están en `assets/fonts/`. La animación
respeta pausa, visibilidad y movimiento reducido. Los archivos de comprobación
visual con datos ficticios se usan solo en la vista previa y no se publican.

## Tutorial de la portada


La portada presenta un recorrido animado de ocho pasos, en el orden del ingreso
real: código, registro de datos, personalización del avatar, movimiento en el
aula, revisión de cupos, elección y confirmación de equipo, Mi equipo y chat.
El registro muestra nombre, apellido, documento, correo y teléfono por separado.
El personaje aparece en el mapa después de personalizarse y entrar; el equipo
se marca como elegido únicamente después de la confirmación de un lugar disponible.
Utiliza el mapa y los personajes actuales, con cuatro mesas de ejemplo y una
presentación en perspectiva. Las escenas y los contactos son ficticios.

Se puede pausar, repetir o elegir cualquier paso; al avanzar manualmente se
detiene la reproducción para leer. El tutorial se pausa al salir de la pestaña
o de la zona visible y respeta la preferencia de movimiento reducido. No hace
consultas de estudiantes ni crea inscripciones, equipos o mensajes. El campo
real para ingresar el código permanece separado del ejemplo.

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
- [Ingreso de estudiantes](https://jotauve24.github.io/Aula-virtual-JV/): cada materia usa un código `MAT-…` compartido por el docente. El estudiante registra nombre, apellido, cédula o pasaporte, correo y teléfono de contacto, personaliza su avatar y elige un equipo con cupos disponibles.
- Desde el detalle de cada materia activa, **Entrar a la sala · Administrador** abre **ZombieAdmin**, una simulación de la experiencia estudiantil sin código de materia ni inscripción. El docente recorre el mismo mapa como zombi sin etiqueta, abre los temas, pulsa «Quiero este equipo», confirma la elección y prueba «Mi equipo» con su casilla de privacidad y datos ficticios (`jair.demo@ejemplo.com`, `6000-0011`). El chat es de práctica: contiene mensajes ficticios y permite enviar textos y adjuntos de prueba solo en el navegador; nada modifica las inscripciones, cupos, contactos o conversaciones reales. Los chats de estudiantes reales permanecen accesibles solo para sus integrantes. **Reiniciar demostración** comienza el recorrido desde cero.
- **Secciones activas** del panel docente presentan indicadores de materias, estudiantes inscritos y **conectados ahora**. Cada tarjeta permite desplegar **Ver estudiantes conectados** para consultar nombre, grupo y última señal; la misma información está disponible al administrar la materia. Las cifras y la lista proceden de una sola consulta cada 5 segundos; solo se cuentan señales de aula de menos de 15 segundos. El docente/ZombieAdmin no cuenta como alumno. El acceso exige una sesión docente autorizada y únicamente incluye sus materias activas. Si la conexión falla se muestra «—» en lugar de un falso cero.
- [Panel docente](https://jotauve24.github.io/Aula-virtual-JV/docente.html): la cuenta docente autorizada crea materias con la cantidad de grupos y cupos que necesita; puede aumentar o reducir mesas, editar temas e indicaciones, consultar estudiantes, liberar integrantes y abrir o cerrar las inscripciones.
- El mapa muestra exactamente una mesa por grupo, de 1 a 40. Para reducir la cantidad se retiran los últimos grupos vacíos; se conserva su historial y no se desplaza a estudiantes de grupos ocupados. El avatar recorre puertas y pasillos, evitando paredes y muebles.
- Las pestañas **Aula y temas**, **Mi equipo** y **Chat** separan el mapa, los integrantes y la conversación. El chat conserva los colores por participante y admite un adjunto de hasta 10 MB por mensaje: imágenes, PDF, Word, Excel, PowerPoint, TXT, CSV o ZIP. Los archivos se guardan en un bucket privado y solo los integrantes actuales del grupo y su docente autorizado pueden descargarlos.
- El correo es visible para los integrantes del equipo. Compartir el teléfono es opcional.

Al abrir una materia, el docente encuentra su código en **Código de la materia** y puede copiarlo. Las materias creadas antes de esta función conservaban solo una huella del código, que no permite recuperar el original. En esos casos, **Generar código nuevo** pide confirmación y guarda uno consultable. El anterior deja de funcionar; los estudiantes pueden ingresar con el nuevo desde su misma sesión y conservan sus perfiles y equipos.

El código de materia no verifica la identidad individual. En la primera inscripción el correo es de contacto, sin verificar. La sesión del navegador permite volver normalmente; antes de cerrar sesión o borrar datos, el alumno puede proteger su cuenta con correo verificado. Si pierde la sesión sin protegerla, la recuperación automática solo funciona cuando el correo verificado coincide con un único perfil anónimo y no conectado; los casos ambiguos requieren revisión. Para cambiar de equipo, el estudiante debe pedir al docente que libere su lugar. La presencia de estudiantes y docentes se consulta periódicamente y muestra sus últimas posiciones, con una caducidad breve para usuarios desconectados.

## Compartir en E-ducativa

Comparte el enlace del aula y el código de la materia, sin incrustar la página:

```html
<p><a href="https://jotauve24.github.io/Aula-virtual-JV/" target="_blank" rel="noopener">Entrar a AulaVirtualJv</a></p>
<p>Código de la materia: [código compartido por el docente]</p>
```

El estudiante nuevo sigue el registro paso a paso. Si ya tiene perfil, vuelve
normalmente desde su navegador habitual o utiliza **Recupera tu cuenta** al
cambiar de navegador. El aula no crea una segunda inscripción con el mismo
correo o teléfono en la misma materia. El mismo correo puede utilizarse en materias diferentes.

## Configuración y desarrollo

Consulta [la guía de Supabase](supabase/README.md) para preparar el proyecto y autorizar la cuenta docente. Nunca incluyas claves secretas, códigos privados de materia ni datos personales en el repositorio público.

El proyecto publicado utiliza HTML, CSS y JavaScript con Supabase. El prototipo local Node/SQLite fue retirado en la versión 0.5.0 porque no formaba parte del aula publicada. Para las comprobaciones se requiere Node.js 24; el proyecto no necesita dependencias de npm.

```sh
npm ci
npm run check
npm test
```

Un flujo de GitHub Actions valida automáticamente la sintaxis y ejecuta las pruebas de Node.js tras cada actualización de la rama principal o una propuesta de cambios.

Para comprobar la presencia en vivo, entra como estudiante en otro navegador, mantén el aula visible y abre **Ver estudiantes conectados** en el panel docente. Al dejar de transmitir señales, el alumno desaparece de la lista después del margen de 15 segundos. Una pestaña en segundo plano puede dejar de enviar señales; por eso el indicador significa **presencia reciente en el aula**, no necesariamente actividad en el chat o atención frente a la pantalla.

Las pruebas de modelo y adjuntos se pueden ejecutar sin dependencias: `node tests/model.test.js` y `node tests/attachments.test.js`. Cubren el número de mesas, rutas sin atravesar paredes, objetivos bloqueados, formatos y límites de archivos. `tests/database.integration.sql` verifica grupos, permisos, privacidad de adjuntos e idempotencia dentro de una transacción que termina en `ROLLBACK`; requiere un entorno de Supabase de prueba con las migraciones aplicadas. No sube binarios a Storage. `npm test` ejecuta las pruebas del código publicado sin instalar bibliotecas externas.

Para revisar la interfaz publicada, comprueba ingreso, elección de equipo, subida y descarga de un archivo, y operaciones docentes con datos ficticios.



La versión de los recursos JavaScript y CSS coincide con `package.json`. Al publicar
una nueva versión, actualiza todas sus referencias para evitar mezclar módulos
antiguos y nuevos. `npm run check` revisa todos los módulos y las pruebas comprueban
las referencias, los recursos alcanzables y la coherencia de las versiones.

Desde la versión 0.5.1, cambiar el correo no permite crear otro perfil si el
teléfono ya está inscrito en esa materia. La comparación reconoce espacios,
guiones y los prefijos de Panamá +507 y 00507. Recuperar el perfil exige verificar
el correo original; una coincidencia de teléfono no concede acceso por sí sola.


### Identidad del estudiante (0.6.0)

La cédula o el pasaporte son obligatorios en nuevas inscripciones. El formulario
une prefijo, tomo y asiento con guiones, sin adivinar sus límites. Para pasaportes
se elige el país emisor. Se normalizan mayúsculas, separadores y ceros de relleno
en los grupos de la cédula; números como 8-12-345 y 8-123-45 siguen siendo distintos.
El identificador interno continúa siendo UUID.

Una identidad documental puede tener una inscripción por materia. Otro usuario
no puede reclamar ese documento aunque cambie ambos contactos. La cuenta original
sí puede inscribirse en más materias con el mismo documento. Correo y teléfono
siguen siendo únicos dentro de cada materia. Los documentos son declarados por
el estudiante: validar el formato no equivale a verificar su autenticidad ante
una autoridad y no permite identificar a una persona que use datos falsos distintos.

Los perfiles anteriores completan el documento al entrar; no se reconstruyen ni
se eliminan avatares, equipos o conversaciones. La identidad se enlaza al ID del
estudiante y sobrevive a la recuperación por correo verificado. La recuperación
documental busca sus materias originales mediante ese correo; conocer una cédula
o un pasaporte nunca concede acceso.

Los números se guardan en tablas privadas sin acceso directo de anon/authenticated,
no en el listado de compañeros ni en el almacenamiento del navegador.
El API antiguo solo permite reabrir inscripciones existentes; no admite registros
nuevos sin documento. Las pruebas SQL usan datos sintéticos y ROLLBACK.

Desde 0.6.1, el equipo guardado tiene borde destacado y marca «✓ Tu equipo» en el mapa y la lista; «Ver mi equipo» abre la pestaña de compañeros. El correo se muestra a los integrantes del propio equipo. Solo el teléfono depende de la casilla de privacidad. Otros equipos y estudiantes sin asignación no reciben los contactos.

### Mantenimiento 0.6.2

Las respuestas pendientes del registro, avatar, equipos y panel docente respetan
el cierre de sesión y la materia actual. El chat bloquea envíos simultáneos y
cancela un adjunto aún no publicado si cambia su contexto. Las exportaciones
pendientes no descargan datos tras cerrar la sesión docente. Se retira el acceso
al API antiguo de precarga de estudiantes y se añaden índices de consulta.

La [auditoría del 23 de octubre](docs/auditoria-tecnica-2026-10-23.md) describe
los hallazgos, las 192 pruebas automatizadas, las siete comprobaciones SQL y
los límites de la revisión con navegador.
