# Panel docente: revisión con Taste y Web Design Guidelines

Versión 0.10.0. Alcance: gestión de una materia, acciones ocasionales y formularios.

## Criterios y dirección

Se incorporan las copias de las skills en `.agents/skills/` y su uso en `AGENTS.md`.
Taste procede de `Leonxlnx/taste-skill`, revisión
`6010f91a9935f1c167dfc500fb1a475681892e6b`, con su licencia MIT.
Web Design Guidelines procede de Vercel Labs; su autoría se conserva en la skill.
Se consultó la versión actual de `vercel-labs/web-interface-guidelines/command.md`.

El selector de Taste ofreció Achromatic ledger y Editorial greeting. Se eligió
Editorial greeting, semilla 241026, por tratarse de un espacio de trabajo de un
docente. Se conservaron la estructura existente, el nombre completo de la materia,
la marca marfil/verde y Nunito. No se añadió una barra lateral ni se modificaron
el aula con avatares, sus animales o el recorrido estudiantil.

La pregunta principal es: ¿cómo están organizados los equipos y quién sigue sin
equipo? El resumen, el código y el acceso al aula permanecen visibles. Las
inscripciones, la cantidad de mesas y la creación de temas se agrupan en un
desplegable nativo. Una materia activa sin temas abre ese desplegable para ofrecer
la primera acción; una materia deshabilitada oculta la configuración.

## Cambios aplicados

- Encabezado y títulos de sección más compactos, con una tipografía coherente.
- Estado de las inscripciones visible junto al nombre, separado del botón de cambio.
- Configuración ocasional agrupada en «Opciones de la materia», conservando sus formularios y valores.
- El desplegable mantiene su estado al actualizar la misma materia y se cierra al cambiar de materia.
- Botones de lápiz con nombre accesible y superficie de 44 × 44 px.
- Nombre accesible del diálogo de edición de tema; foco visible y desplazamiento contenido en diálogos.
- Formularios con nombres de campos, autocompletado coherente y entradas numéricas apropiadas.
- Fondos planos y menos sombras en el espacio de trabajo.
- Campo del código de acceso apilado con su botón en teléfonos, para evitar que se comprima.

## Comprobación

Se usó un caso ficticio desconectado de la base de datos: 14 estudiantes, cuatro
equipos y dos personas sin equipo. Las comprobaciones visuales se realizaron a
1440, 768 y 390 px mediante el navegador permitido. Los archivos de prueba no se
publican. No se ejecutó el inspector directo de navegador incluido en Taste.

En escritorio, el encabezado pasó de 100,2 a 44 px de alto y el inicio de la lista
de estudiantes pasó de 1716,4 a 1078,0 px: 638,4 px menos de desplazamiento en el
mismo caso. No hubo desbordamiento horizontal en escritorio, tableta ni teléfono.
En el teléfono, el campo del código terminó con 298 px de ancho y su valor completo.

Se verificaron la apertura por teclado del desplegable, el cambio de inscripciones
sin perder su contexto, y el guardado de un tema con actualización del nombre del
equipo. En esas pruebas se conservaron el código y los 14 perfiles ficticios.

Pasaron las 208 pruebas existentes y la sintaxis de los 26 módulos del proyecto.
El análisis de fuente de Taste pasó de cuatro FAIL a cero FAIL. Sus 37 WARN
restantes corresponden a reglas heurísticas sobre estilos compartidos, etiquetas
fuera del detalle revisado y valores ausentes; no equivalen a una aprobación
automática de toda la aplicación. Se conservaron los elementos de marca y se
revisó la presentación real en el navegador.

## Disponibilidad de las skills

Ambas skills quedan versionadas con el proyecto. La sincronización con la página
global de skills devolvió HTTP 422; no se considera un guardado global confirmado.
