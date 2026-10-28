# Check de grupo de trabajo creado · 0.20.0

El docente utiliza los integrantes del aula para crear grupos en su plataforma
académica. El check junto al encabezado de cada equipo permite recordar cuáles
ya creó. Es un seguimiento manual privado del propietario, no una integración
que cree grupos o envíe mensajes fuera del aula.

`topics.work_group_created` empieza en false para los grupos actuales y nuevos.
`teacher_set_work_group_created` guarda el booleano y devuelve el ID y estado
confirmados. Su wrapper público no tiene elevación; el helper privado exige
sesión, propiedad de la materia, materia activa, grupo de esa materia y grupo
sin archivar. Bloquea primero la fila de la materia, como las demás operaciones
de grupos, y conserva los permisos directos sobre tablas. Las solicitudes son
idempotentes y funcionan con inscripciones cerradas y equipos vacíos o bloqueados.

`teacher_overview` entrega el dato solo al propietario. `course_room` y
`my_profile` no lo incorporan. El check pertenece al grupo y persiste si cambia
de nombre o integrantes: el grupo externo sigue creado y el docente puede
retirar la marca cuando lo necesite. Las materias deshabilitadas muestran el
estado como lectura y mantienen el valor en su descarga.

El panel guarda sin una segunda lectura, bloquea clics duplicados y conserva
otras solicitudes pendientes al reconstruir el listado. Comparte el contador
de cambios del detalle con las marcas de matrícula para descartar lecturas
anteriores. Reabrir o salir durante el guardado no deja el control bloqueado ni
restaura una vista anterior. El icono mide 14 px y el área de activación 44 px.

El Excel conserva las once columnas de 0.19.0 y añade «Grupo de trabajo creado».
Se exporta Sí o No para los equipos disponibles y vacío sin equipo. Edad,
documentos, contactos y revisión de matrícula mantienen su formato anterior.

Verificación: 272 pruebas Node, sintaxis de 28 módulos y SQL con usuarios y
cursos ficticios dentro de una transacción revertida. La integración comprueba
permisos, aislamiento por grupo/materia, valores nulos, reversión, persistencia,
inscripciones cerradas y conservación de perfiles, matrícula, contactos, avatar,
cupos, bloqueo y chat. Los avisos de seguridad anteriores de Supabase no cambian.

El archivo XLSX se comprobó con un lector independiente: 12 columnas, Sí/No,
sin equipo vacío, cédula/pasaporte como texto, edad numérica y filtro A:L.
La interfaz se revisó en escritorio y teléfono con datos ficticios: iconos de
14 px, etiqueta roja de 11 px y áreas de activación de 44 × 44 px. El foco vuelve
al control después de habilitarlo al terminar el guardado, también con teclado.
