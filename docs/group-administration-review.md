# Bloqueo y excepciones de cupo · 0.17.0

El propietario puede cerrar el ingreso voluntario a cada grupo, aunque quede
espacio, y asignar estudiantes por encima del cupo sin cambiar su capacidad.

## Interfaz

- Candado de 44 × 44 px junto al lápiz de cada tema en el panel docente.
  Nombre accesible, estado pulsado, foco visible y envío pendiente protegido.
- Las listas muestran integrantes reales y el estado de ingreso bloqueado.
  El mapa conserva sus rótulos transparentes y añade un candado pequeño.
- Asignar a grupo y Cambiar de grupo incluyen destinos bloqueados o completos.
  Un grupo completo exige marcar una autorización con la ocupación resultante.
  Cambiar el destino borra esa autorización. No se muestran cupos negativos.
- Si otra asignación consume la última plaza mientras el diálogo está abierto,
  un rechazo del servidor actualiza las opciones y muestra la autorización.
- Un fallo de lectura después de guardar no reenvía la operación y avisa al
  docente. Salir o cambiar de materia descarta resultados anteriores.
- Estudiantes ya inscritos conservan equipo, avatar, Mi equipo y chat. El
  bloqueo afecta nuevas elecciones, no el regreso desde otro dispositivo.
- La simulación docente respeta los grupos bloqueados sin ocupar plazas reales.

Se conservaron la dirección visual existente, Nunito y las paletas del usuario.
El alcance es un conjunto de controles; no se sorteó una dirección nueva de
Taste ni se alteraron la geometría, los muebles o los movimientos del mapa.
Revisión de accesibilidad conforme a las guías actuales de Vercel.

## Servidor

Migración instalada: `20261027232335_teacher_group_locks_and_capacity_exception.sql`.

- `topics.join_locked`, no nulo y falso por defecto; no altera las membresías.
- `teacher_set_topic_locked` exige sesión, propiedad, materia activa y grupo
  vigente de esa materia. Solo actualiza el indicador de bloqueo.
- `teacher_assign_student` exige el mismo propietario y una autorización
  explícita para sobrepasar la capacidad. Permite destinos bloqueados y funciona
  también con inscripciones cerradas. Repetir la misma asignación es inocuo.
- `teacher_move_student` conserva su firma anterior para clientes en caché y
  continúa limitado por la capacidad. No se crean sobrecargas ambiguas.
- `choose_topic` comprueba el bloqueo y el cupo en el servidor, sin excepción
  estudiantil. Las operaciones se serializan con el mismo bloqueo de materia,
  seguido del estudiante y del tema cuando corresponde.
- Nuevas funciones privilegiadas en `private`, con `search_path` vacío y
  comprobación de `auth.uid()`. Envoltorios públicos `SECURITY INVOKER`.
  Sin permisos para `anon` ni nuevos permisos de escritura sobre tablas.
- El traslado modifica únicamente pertenencia y permiso voluntario de compartir
  teléfono. Los mensajes permanecen en su conversación de origen. No modifica
  cédula/pasaporte, correo, teléfono, avatar, inscripción o código de materia.
- Editar nombre e indicaciones permite conservar el cupo original de un grupo
  excedido. Cambiarlo a otro valor inferior a sus integrantes sigue rechazado.

## Verificación

- `npm test`: 244 pruebas aprobadas. `npm run check`: 28 módulos válidos.
- Integración SQL antes de instalar y contra las funciones instaladas: PASS.
  Usuarios, materia, estudiantes y mensajes ficticios dentro de una transacción
  revertida. No se utilizaron alumnos reales ni se enviaron correos.
- SQL: bloqueo vacío/parcial/lleno; reabrir; asignar desde sala y desde otro
  grupo; 5/5 → 6/5 → 7/5; repetición; falso/nulo/sin permiso; permisos de
  estudiante, otro docente y sesión ausente; otra materia; archivados e
  inactivos; integridad de perfiles, capacidad, código y mensajes; contacto.
- Los cuatro avisos de seguridad anteriores a la migración permanecen iguales,
  sin nuevos hallazgos.
- Navegador real con HTML, estilos y controladores de producción y cliente de
  datos exclusivamente ficticio, sin conexión a Supabase. Revisión en 1440,
  768, 390 y 320 px; cero desbordamiento horizontal del documento interior;
  candados y botones nuevos con al menos 44 px de objetivo táctil.
- Acciones visuales: bloquear, reabrir, asignar al grupo lleno y observar 6/5;
  seleccionar destino ya excedido y mostrar 7/5; mantener Mi equipo y chat
  del estudiante dentro del equipo bloqueado; rótulos móviles y nombres largos.

Las pruebas de navegador usan datos ficticios. La autorización y las reglas
reales se verificaron con SQL transaccional; no se modificaron matrículas de
producción como parte de la revisión visual.
