# Edad y descarga completa · 0.18.0

## Registro y regreso

Se añadió edad después de los apellidos. El campo pide años cumplidos, con
teclado numérico, etiqueta, ayuda de privacidad y rango entero de 1 a 120.
La secuencia continúa con documento, correo, teléfono y avatar. El tutorial
utiliza la misma secuencia. La edad corresponde a lo declarado por el estudiante;
no se estima ni se actualiza por cumpleaños sin fecha de nacimiento.

Quien ya tiene una inscripción completa únicamente los datos pendientes:
documento, edad o ambos. No se repite la inscripción ni se pide elegir otro
avatar o grupo. Se ocultan los controles de cambio de código y recuperación
durante esta breve actualización. Los errores conservan los datos para reintentar.
Cerrar sesión libera el formulario y descarta las respuestas anteriores.

## Base de datos

Migración instalada: `20261028003409_student_age_and_complete_export.sql`.

- `students.age` es un entero pequeño nullable, con restricción 1–120.
  Los perfiles anteriores permanecen pendientes, sin edades inventadas.
- `enroll_student_profile` valida la edad y reutiliza las reglas existentes de
  documento, correo y teléfono dentro de la misma transacción.
- `student_complete_registration` verifica sesión, pertenencia y materia activa;
  completa únicamente lo pendiente. Documento y edad se guardan juntos o se
  revierten juntos. Funciona con inscripciones cerradas y no sobrescribe edades
  ya guardadas al repetir la petición.
- Nuevos ayudantes privilegiados en `private`, con `search_path` vacío y
  comprobación de `auth.uid()`. API pública `SECURITY INVOKER`; permisos solo
  para `authenticated`, sin nuevos accesos directos a tablas.
- Las firmas anteriores siguen siendo compatibles. Un cliente antiguo puede
  dejar la edad pendiente; el flujo actual la solicita al regresar.
- `my_profile` entrega la edad solo al propio estudiante. `teacher_overview`
  verifica al propietario y une las identidades privadas para devolver tipo,
  país y número de documento. Se conserva el campo histórico `nationalId` como
  respaldo cuando todavía no existe una identidad vinculada.
- `course_room`, integrantes y chat no reciben edad ni documento. Se conservan
  las reglas vigentes de correo visible dentro del propio equipo y teléfono
  compartido de manera voluntaria.

## Excel

La descarga incluye diez columnas: materia, nombre, apellido, correo, teléfono,
equipo, tipo de documento, país emisor ISO, cédula o pasaporte y edad.
Se conserva el orden de las seis primeras columnas. Los documentos y teléfonos
son texto; se mantienen guiones, ceros iniciales y números largos sin pérdida
de precisión. La edad es numérica, con formato general. Una edad pendiente es
una celda realmente vacía, sin texto ni cero. Filtro A:J y primera fila fija.
Se siguen incluyendo las materias deshabilitadas que pertenecen al docente.

Se mantuvieron el generador XLSX ligero del navegador y el stack existente.
No se añadió una dependencia ni una función de importación de estudiantes.

## Verificación

- `npm test`: 252 pruebas aprobadas. `npm run check`: 28 módulos válidos.
- SQL transaccional antes de instalar y contra las funciones instaladas: PASS.
  Identidades y matrículas ficticias, revertidas al terminar; sin correos ni
  cambios a estudiantes reales.
- Casos: edad ausente, límites 1/120, fuera de rango, reintentos, recuperación
  parcial de edad/documento, error atómico, registro cerrado, curso deshabilitado,
  sesión ajena, docente ajeno, sesión ausente, documento repetido con contactos
  y edad distintos, privacidad frente a compañeros e integridad de avatar,
  contactos, pertenencia, mensajes, código e identidad.
- Los cuatro avisos de seguridad anteriores permanecen iguales, sin nuevos.
- Navegador real con cliente ficticio desconectado de Supabase: registro hasta
  avatar, rechazo de edad decimal, regreso que solicita solo edad y conservación
  del grupo bloqueado. Revisión en 1440, 768, 390 y 320 px; mediciones sin
  desbordamiento en 1440, 768 y 320, campo de 46 px de alto.
- El botón de descarga completó el flujo y mostró cuatro estudiantes de dos
  materias en la prueba. El entorno del navegador no expuso el evento de archivo;
  el binario se verificó ejecutando el mismo generador y los mismos datos de
  prueba, con un lector independiente de XLSX y comprobación CRC del ZIP:
  diez columnas, cuatro filas, edades numéricas, documento con ceros iniciales,
  edad pendiente vacía, filtro y fila fija correctos, sin fórmulas inyectadas.

No se probaron matrículas reales desde el navegador. Las comprobaciones de
autorización corresponden a las pruebas SQL sobre las funciones instaladas.
