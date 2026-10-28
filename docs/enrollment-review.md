# Matrícula por verificar · 0.19.0

El docente necesita señalar a una persona que ingresó con el código de una
materia, pero cuya matrícula debe comprobarse, conservando su perfil y grupo.
El triángulo junto a su nombre activa o retira una observación reversible. No
existe sincronización con la matrícula institucional ni aprobación automática.
Todos los perfiles actuales y futuros empiezan sin observación; el lanzamiento
no marca a ningún estudiante real.

La marca es una propiedad del perfil de esa materia. No se reutiliza como
identificador ni se copia a las otras materias del mismo estudiante. El aviso
se muestra al afectado, a su equipo actual y al propietario del curso. Otros
equipos reciben `null` para ese dato. La consulta privada de edad y documento
y la opción de compartir teléfono conservan sus límites anteriores.

`teacher_set_enrollment_review` es un wrapper público sin elevación. Su helper
privado comprueba sesión, propiedad y materia activa, bloquea primero la fila
de la materia y solo actualiza el booleano del estudiante perteneciente a ella.
Las escrituras son idempotentes y funcionan con inscripciones cerradas. No se
dan permisos directos sobre tablas ni se añade una función pública privilegiada.

El panel refleja la respuesta confirmada sin una segunda lectura que pueda
fallar tras guardar. Guarda por estudiante, bloquea clics duplicados y conserva
el estado pendiente de otros controles cuando hay dos solicitudes simultáneas.
Respuestas tardías tras navegación o salida no restauran la vista anterior.
Los avisos estudiantiles se recalculan con la consulta existente cada 15 segundos
y al recuperar visibilidad; no se escriben mensajes en el chat ni se envían correos.

El Excel conserva las diez columnas de 0.18.0 y añade «Revisión de matrícula».
Una marca activa se exporta como «Por verificar»; el resto queda en blanco,
sin afirmar que esas personas estén matriculadas. La edad continúa siendo
numérica y los identificadores siguen siendo texto, con guiones y ceros.

Validación: pruebas de controlador docente y estudiante, exportación, regresión
de navegación y perfil, y SQL con usuarios/cursos ficticios dentro de una
transacción revertida. La prueba SQL verifica permisos, aislamiento por materia
y equipo, reingreso, traslados, chat y conservación de identidad, contactos,
avatar, membresía y mensajes. Los cuatro grupos de avisos de seguridad previos
de Supabase se conservan sin nuevos hallazgos.

La interfaz conserva Nunito, la paleta, el mapa y el resto del diseño. Este
cambio es un componente acotado: sigue la dirección existente sin sortear un
estilo nuevo. Las comprobaciones visuales usan datos ficticios y la superficie
de navegador admitida; no un inspector con conexión directa a Chrome.

Resultado de verificación: 264 pruebas Node y sintaxis de 28 módulos correctas;
la nueva integración SQL, la de edad y la de privacidad de contactos pasaron
contra las funciones instaladas. Un lector independiente de XLSX verificó las
11 columnas, el documento de 20 dígitos como texto, la edad numérica, los vacíos,
el filtro A:K y la fila de encabezados fija. En navegador se comprobó el control
docente a 1440, 768 y 390 px, el equipo a 768 y 390 px y el perfil sin equipo a
320 px: sin desbordamiento horizontal en el documento del producto. Los
triángulos miden 44 × 44 px y se activan con teclado. Se probaron marcar y quitar
el aviso sin cambiar integrantes; la captura de comprobación usa solo ejemplos.
