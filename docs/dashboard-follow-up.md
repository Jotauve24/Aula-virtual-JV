# Pendientes en Mis materias · 0.21.0

La tarjeta de cada materia activa conserva el acceso y la lista de conectados.
Debajo de sus inscritos y grupos muestra el número de grupos que no tienen el
check manual de «Grupo de trabajo creado». Cuenta grupos vacíos, incompletos,
llenos y bloqueados; excluye los archivados y la sección «Sin equipo».

Si existe alguna observación de matrícula, muestra la cantidad de estudiantes
marcados, con triángulo rojo de 12 px y texto rojo de 11 px. Cuenta personas,
incluidas las que no tienen equipo o están desconectadas; no cuenta grupos ni
certifica la matrícula institucional. Las dos observaciones son independientes.

## Datos y actualización

La RPC existente `teacher_live_course_counts` mantiene su nombre, retorno JSON
y campos de presencia. Añade `student_count`, `topic_count`,
`pending_work_group_count` y `enrollment_review_count` calculados en la misma
consulta. Se agregan estudiantes y grupos por separado para evitar multiplicar
cantidades al cruzar las tablas. Usa los índices existentes por materia.

La consulta existente cada 5 segundos actualiza el seguimiento, la presencia y
los totales de las tarjetas sin reconstruir los botones ni cerrar las listas
de conectados. Al guardar una marca se descartan lecturas anteriores a ese
cambio. Volver a Mis materias consulta otra vez; los cambios de otro navegador
aparecen en la siguiente consulta visible. No se añaden consultas por materia.

Durante la primera carga se indica «Comprobando pendientes…». Un valor válido
de cero muestra «0 grupos pendientes». Si falta el seguimiento o su formato no
es válido, muestra «Pendientes no disponibles»; un fallo de red conserva el
último conteo con «Sin actualizar · reintentando…». Nunca convierte un fallo en
cero ni en matrícula confirmada. La repetición de valores idénticos no vuelve
a anunciar el estado. El botón describe sus pendientes para lectores de pantalla.

## Permisos y comprobación

El código privilegiado está en `private.teacher_dashboard_snapshot`, con
`search_path` vacío y comprobación explícita de sesión, rol docente y propiedad.
El endpoint público es un wrapper `SECURITY INVOKER`. Ni anónimos ni alumnos
pueden consultarlo; no se amplían permisos directos sobre tablas. Se conservan
los campos originales del roster en línea; las marcas individuales no se
añaden a ese roster ni se exponen a compañeros.

La integración SQL usa usuarios, materias y estudiantes ficticios dentro de
`BEGIN`/`ROLLBACK`. Verifica propietarios distintos, sesiones no autorizadas,
materias vacías/deshabilitadas, grupos archivados/bloqueados/vacíos, estudiantes
sin equipo y desconectados, cambios de check y matrícula, ceros y compatibilidad
de presencia. Compara los registros antes y después de consultar para confirmar
que el seguimiento es de lectura. Las pruebas JavaScript cubren datos inválidos,
regreso al panel, fallos, recuperación y respuestas tardías.

La revisión visual usa fixtures locales ficticios a 1440, 768 y 390 px,
incluyendo nombres largos y estados sin datos. Se conserva el diseño existente,
Nunito y las paletas compartidas: es una ampliación de la tarjeta, sin cambiar
su composición ni sus controles principales.
