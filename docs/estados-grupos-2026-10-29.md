# Estados visibles de grupos · 0.26.1

El panel docente distingue los grupos sin depender del check pequeño. Se aplica
al grupo completo, tanto en «Mesas y temas» como en «Estudiantes y equipos»:

- «Grupo creado»: fondo teal suave, borde del mismo tono y etiqueta visible.
- «Completo · por crear»: fondo durazno cuando alcanza o supera el cupo y aún
  no tiene la marca de creado.
- «Pendiente de crear»: fondo claro para los demás grupos sin marca.

La marca confirmada tiene prioridad sobre los cupos: un grupo creado sigue
identificándose como tal si cambia su cantidad de integrantes. «Sin equipo»
conserva su presentación neutral, sin etiqueta ni check de grupo creado.
Los avisos rojos de matrícula permanecen independientes y visibles.

Una sola función de presentación calcula el estado a partir del snapshot
docente existente y actualiza ambos listados. Se ejecuta al abrir el detalle y
después de reconstruir los grupos. Al marcar o desmarcar, el fondo cambia
solo después de recibir el valor confirmado. Un fallo conserva el estado y
libera el botón, igual que antes. No se agregan consultas, campos ni migraciones.

Se mantienen las paletas y Nunito. Los nuevos roles de color se definen en
`palette.css`; los selectores de las tarjetas se limitan al detalle docente.
Las etiquetas permiten reconocer los estados con colores forzados, y el check
mantiene su área de 44 × 44 px, nombre accesible, foco y atributo aria-pressed.
Los cambios de versión sincronizan los recursos compartidos a 0.26.1.

Verificación: 335 pruebas aprobadas y sintaxis de 30 módulos. Se revisaron las
tarjetas a 1440, 768, 390 y 320 px, con nombres largos, grupo completo bloqueado,
grupo creado incompleto, grupo vacío y estudiantes sin equipo. Los documentos
tienen anchos visibles/desplazables iguales: 1425/1425, 753/753, 375/375 y
305/305 px. Se comprobó marcado y desmarcado, sincronización entre listados,
espera de guardado y error simulado sin cambio de estado. Todos los datos de
las pruebas son ficticios y permanecen en fixtures locales sin conexión.

Taste se aplica como ajuste de componentes existentes, sin nueva dirección.
La señal de estado usa color en los datos, superficies planas y texto visible.
El linter de los archivos editados no muestra FAIL; conserva un WARN por las
rayas que ya representan valores todavía no disponibles en el panel. La
verificación visual utiliza CUA en lugar del inspector de Chrome directo.

Crítica del alcance: la distinción se reconoce sin buscar el check; las etiquetas
no compiten con el nombre del grupo; los controles conservan su posición, y la
matrícula sigue señalada en rojo. Diseño 8/10, usabilidad 9/10, creatividad
7/10 y contenido 9/10; ponderada 8,2/10. No quedan cambios funcionales pendientes.
