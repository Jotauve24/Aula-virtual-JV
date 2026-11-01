# Tablón del aula · 0.27.8

La columna del estudiante añade dos secciones debajo de su equipo: el último aviso del docente y las personas conectadas a la misma materia. Conserva la paleta compartida, Nunito y los avatares pixelados existentes. Es una ampliación de una columna de la aplicación, no un rediseño general; se mantiene la dirección visual del proyecto sin sorteo de otro estilo.

## Avisos

El resumen muestra el aviso vigente más reciente, un extracto de hasta 180 caracteres y el estado de lectura. **Ver avisos** abre la ventana existente y **Entendido** continúa siendo la única acción que confirma una lectura en el servidor. Consultar el tablón o abrir el historial no registra una confirmación. El cierre devuelve el foco al botón que abrió la ventana.

El resumen recibe los mismos avisos autorizados que ya obtiene el controlador del estudiante; no añade solicitudes, almacenamiento ni permisos. Distingue la carga, la ausencia de avisos y los datos que no pudieron actualizarse. Mantiene la última información con la indicación **Sin actualizar** cuando falla la consulta, y ofrece comprobarla de nuevo.

## Personas conectadas

Se reutilizan las respuestas autorizadas de presencia y los equipos de la materia. La lista incluye al propio estudiante, evita identidades duplicadas y muestra nombre, avatar y equipo; no incorpora correo, teléfono, edad ni documento. Presenta tres personas inicialmente, con **Ver todos** y desplazamiento interno para listas extensas. Los cambios de coordenadas no reconstruyen los botones ni interrumpen el foco.

Pulsar una persona centra el mapa en su posición visible y muestra durante seis segundos un marcador coral. El marcador sigue el mismo movimiento interpolado que dibuja el aula, no una segunda posición de red. No mueve al estudiante, lo cambia de equipo ni envía datos adicionales. Se limpia al desconectarse esa persona, salir del aula, editar el avatar u ocultar el documento. El mensaje de estado deja de indicar que hay un resaltado cuando este finaliza.

La presencia no comprobada se presenta como información no disponible, nunca como cero compañeros conectados. Al recuperar la conexión vuelve la lista. Los datos de la materia anterior se descartan al reiniciar el controlador o cerrar sesión.

## Distribución

Quien ya eligió equipo conserva **Ver mi equipo** y puede desplegar las demás mesas en **Ver equipos**. La apertura del desplegable se conserva entre actualizaciones de la sala. Quien todavía busca equipo continúa viendo todas las mesas. Esto reserva espacio para el tablón sin duplicar permanentemente la lista del mapa.

En escritorio las secciones se apilan al lado del mapa; en tablet se sitúan en dos columnas debajo de la tarjeta principal; en teléfono se apilan a todo el ancho. Los botones del tablón tienen al menos 44 px de alto y los accesos a personas 62 px. Los textos largos se ajustan al espacio y el texto completo del aviso sigue disponible en su ventana. No hay animaciones decorativas nuevas ni desplazamiento animado obligatorio al localizar una persona.

## Verificación

- 415 pruebas aprobadas y sintaxis correcta en 38 módulos.
- Pruebas del controlador real: lecturas confirmadas únicamente por el servidor, consulta del historial, regreso del foco, ubicación de compañeros en su posición animada, desconexión y limpieza al salir.
- Pruebas de lista extensa con 61 personas, duplicados, datos privados excluidos, textos tratados como texto y avisos largos conservados íntegros en su fuente.
- Revisión mediante el navegador compatible del entorno, con materia, aviso y estudiantes ficticios y solicitudes externas bloqueadas. Se comprobaron aviso obligatorio, confirmación, pérdida de conexión y recuperación. No se enviaron mensajes ni se modificaron registros reales.
- Revisión visual de escritorio, tablet de 768 px y celulares de 390/320 px, con avisos largos y estados vacíos. Sin desbordamiento horizontal en los anchos comprobados; títulos nuevos de una línea en celular y controles con tamaño táctil.
- Lint de los dos componentes nuevos: 0 fallos, 0 advertencias. La inspección visual equivalente usa CUA según AGENTS.md; no se ejecuta un navegador paralelo desde el inspector del skill.

La revisión visual mantiene el mapa como elemento principal y los avisos y personas como información secundaria. Las secciones usan los mismos bordes y márgenes de la aplicación, muestran estados comprobables y ofrecen acciones directas. En tablet conservan la altura de su contenido para evitar estirar un aviso corto con espacio vacío.

No hay cambios de esquema, autenticación, permisos, capacidad de los grupos, notificaciones del chat ni rutas de publicación. La versión se publica en el GitHub Pages existente.
