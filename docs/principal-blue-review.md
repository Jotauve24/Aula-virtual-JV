# Panel principal: revisión de la paleta azul

Versión 0.11.0, 24 de octubre de 2026.

## Problema y dirección

La portada y el panel docente heredaban el verde del tema compartido del campus,
incluidos valores directos en fondos, títulos, botones, ayudas y tutorial. El
usuario pidió quitar ese verde dominante. Ambas pantallas reciben ahora la clase
`campus-panel`, con azul noche, un acento azul y superficies neutras claras. Los
colores de los equipos dentro de la ilustración conservan su función de identidad.
El verde semántico de éxito y materia activa continúa siendo un estado puntual.

Se aplicaron Taste y las reglas actuales de Web Design Guidelines. Para la
portada, Taste ofreció Colour chapters, The page is the object y One motif. Se
eligió The page is the object, semilla 241024: la tarjeta de acceso acompaña a la
maqueta del aula real. Es una revisión de la composición existente, sin añadir
fotografías, franjas decorativas ni cambiar el orden del recorrido. El panel
docente conserva Editorial greeting de la revisión 0.10.0 y cambia su paleta.

Inventario: código compartido de materia, ingreso estudiantil, recuperación de
perfil, avatar propio, mapa del aula, mesas por equipo, cupos, confirmación de
equipo, chat y acceso docente. Pregunta principal: ¿dónde escribo mi código y qué
ocurre después? La acción principal es entrar a la materia; el tutorial permite
explorar el recorrido completo antes de hacerlo.

## Cambios

- Título de dos líneas, explicación directa y formulario sin elementos que lo desplacen.
- Acceso docente visible en el encabezado; ampliación del aula como icono con nombre accesible.
- Azul coherente en los controles y estados de selección del tutorial.
- Ayudas de 13 px y controles de 44 px, frente a 11 px y 31 px en la ayuda anterior.
- Colores de foco y error visibles, código sin traducción automática y fuente local precargada.
- Consolidación de reglas duplicadas y eliminación de la decoración verde retirada.
- Controles del tutorial en dos filas a 320 px para evitar desbordamiento.
- Guía del repositorio actualizada para no restaurar la paleta verde en estas pantallas.

## Verificación

Pasaron las 208 pruebas existentes y la sintaxis de los 26 módulos. Después de
los últimos ajustes de presentación y texto pasaron de nuevo las 19 pruebas
pertinentes de tutorial, recursos estáticos y estructura docente.

Se comprobaron 1440, 768, 390 y 320 px con el navegador permitido. Las mediciones
finales del ancho visible/documento fueron 1425/1425, 753/753, 375/375 y 305/305 px,
respectivamente: sin desplazamiento horizontal. Las barras de desplazamiento de
las ventanas de prueba explican los 15 px de diferencia respecto al marco. Las
pruebas se hicieron con la presentación de página completa dentro del marco,
desactivando únicamente la detección de inserción en la copia local de prueba.

Se recorrieron los ocho pasos del tutorial: una tarjeta visible y una selección
actual por paso; la navegación manual pausa el reloj. Se comprobaron el error de
código, su limpieza al escribir, el botón de ingreso habilitado con un código,
la ayuda de recuperación y el diálogo docente en celular. El docente se revisó
con 14 perfiles ficticios, cuatro equipos y dos personas sin equipo; no se
modificaron datos reales. Las copias de prueba no se publican.

Contrastes medidos a partir de los colores renderizados: texto secundario 5,72:1,
enlaces del encabezado 11,29:1 y acción azul con texto blanco 5,91:1.

El análisis de fuente de Taste en `index.html`, `assets/entrance-tutorial.css`
y `assets/live.css` tiene cero FAIL y 45 WARN. Son advertencias de fuente sobre
bordes, sombras, etiquetas y numeración del tutorial; no una certificación
automática de accesibilidad. El archivo compartido `campus.css` conserva el
fondo del estudio de avatar, fuera de estas pantallas. No se ejecutó el inspector
directo de Taste: la verificación visual se hizo mediante Browser/CUA, según
`AGENTS.md`.

## Crítica final

ROUND 2

Seen in one second: acceso por código junto a una maqueta reconocible del aula.

Idea (one sentence): el aula con mesas y personajes se presenta junto a su tarjeta de acceso.

Live thing: tutorial navegable con el mismo renderizador del aula.

Layout words by section: hero=tarjeta y maqueta / recorrido=secuencia / ayuda=texto contextual.

Scores: design 6.5 · usability 8 · creativity 7 · content 8 → overall 6.5 con límites de Taste.

Caps applied: se conservan la numeración funcional y la ilustración del producto,
en lugar del mínimo de fotografías de una página promocional. La nota se mantiene
limitada; no se presenta esta entrada de aplicación como una web premiada.

Top three problems resolved: verde heredado; ayuda pequeña y acceso docente al
pie; controles que excedían el ancho de 320 px. La maqueta sigue conteniendo texto
pequeño por ser una demostración: las instrucciones completas se leen debajo y
las tarjetas ilustrativas están ocultas a tecnologías de asistencia.
