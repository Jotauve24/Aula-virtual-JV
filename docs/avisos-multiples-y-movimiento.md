# Avisos a varias materias y movimiento compartido · 0.27.7

## Avisos

Abre **Avisos** en una materia y despliega **Enviar a más materias**. Marca las otras clases, escribe el mensaje y revisa los destinatarios indicados encima de **Publicar en N materias**. La materia abierta siempre se incluye. Las demás están desmarcadas inicialmente; se muestran solo materias activas del docente y se permiten hasta treinta por envío. Si seleccionas un equipo, se quitan las otras materias y el aviso vuelve a dirigirse solo a ese equipo.

Cada materia recibe su propio aviso inmutable, con sus propias confirmaciones por estudiante. El docente lo consulta o lo retira en cada materia. No se unen los perfiles, equipos o historiales de distintas clases. Publicar en varias materias no concede acceso a ninguna de ellas.

`teacher_publish_notice_to_courses` es un envoltorio público invocador. Su función privada comprueba sesión, propiedad y estado de todos los destinos y los bloquea en un orden estable. Después reutiliza la publicación existente. Si una materia está deshabilitada, es ajena o llegó al límite de avisos, se revierte todo el envío. El identificador de lote produce una clave distinta por materia y evita duplicados al reintentar sin cambiar el borrador. No se permite editar el texto de una publicación anterior.

La migración aditiva aplicada es `20261031205500_publish_notice_to_multiple_courses.sql`. Solo añade las dos funciones autorizadas; no modifica tablas, no envía avisos y no cambia registros existentes. Las pruebas SQL usan materias y usuarios ficticios y terminan con ROLLBACK.

## Movimiento

Las posiciones se siguen recibiendo del RPC autorizado de la materia. El cliente ya no dibuja cada posición nueva como un salto: `peer-motion.js` conserva la posición visible y recorre puntos intermedios por el suelo transitable, utilizando la misma geometría y búsqueda de rutas del estudiante local. Los compañeros muestran pasos mientras se desplazan y se detienen al alcanzar la posición recibida.

La actualización de presencia se realiza cada 750 ms cuando hay compañeros o el estudiante camina. En una sala vacía e inmóvil se mantiene una comprobación más espaciada, aproximadamente cada 2,5–3 segundos. La animación no hace llamadas de red. Se comunica también la llegada a destino; una petición en curso evita envíos simultáneos. La continuidad reduce los saltos visuales; la posición compartida mantiene el pequeño retraso propio de la conexión y las actualizaciones.

La separación visual entre avatares cercanos se desplaza gradualmente y utiliza un orden estable por identificador, evitando que el orden de las respuestas los cambie de lado. Tanto el avance de ruta como el desplazamiento lateral tienen un máximo por fotograma, para que una pausa del navegador no se convierta en un salto grande. Los recorridos se limpian al salir, ocultar el documento, cambiar de materia o modificar la geometría. Las respuestas de otra generación de ingreso no se aplican.

Se comparte el mismo suavizado en la sala docente. Se mantienen la identidad, los avatares, las plazas, las marcas de conexión y las sillas de estudiantes desconectados. Con movimiento reducido se suprimen las oscilaciones decorativas de piernas y la animación ambiental; el movimiento remoto conserva su continuidad funcional. La presencia usa los mismos permisos y no publica datos en canales abiertos.

## Verificación

- 404 pruebas aprobadas y sintaxis de 37 módulos.
- Pruebas de dos controladores independientes que intercambian presencia: ambos ven al otro caminar, con posiciones intermedias y sin reemplazar directamente la posición visible por la recibida.
- Rutas junto a paredes y muebles, cambios de dirección, reordenación de respuestas, avatares superpuestos, fotogramas lentos, desconexión y geometría nueva.
- La misma prueba SQL pasó localmente en PostgreSQL/PGlite y en Supabase: publicación atómica, destinos propios, reintentos, cuotas y confirmaciones independientes. Los asesores de seguridad mantienen las advertencias previas.
- Prueba visual en navegador con dos páginas de aula ejecutándose a la vez y un intermediario local ficticio. Las dos vistas dibujaron múltiples posiciones intermedias del otro estudiante. La instrumentación de prueba y los datos ficticios no se publican.
- Publicación ficticia de un aviso en tres materias y consulta del mismo texto en otra de ellas. Revisión del formulario en escritorio, tableta y celular, con confirmación visible de destinos y controles de alcance.

La interfaz conserva la paleta y Nunito del proyecto. El historial vacío utiliza una columna para el formulario; el encabezado conserva el cierre visible y los errores y confirmaciones aparecen junto a Publicar. El lint de los componentes no presenta fallos; su aviso por relleno de dígitos corresponde al UUID, no a numeración decorativa. La inspección visual se realiza mediante el navegador compatible del entorno.
