# Alcance acordado y continuidad

## Objetivo

Permitir que los estudiantes conformen equipos sin llenar el mensajero interno de la universidad. La experiencia será un aula en dos dimensiones, con avatares que caminan, espacios de trabajo por tema y solicitudes de conversación.

## Primer incremento preparado

Ingreso por código de materia como pantalla inicial, diseño del aula y recorrido demostrativo completo hasta el avatar, los equipos y la simulación de chat. El código `DEMO2026` solo identifica la prueba; no es un secreto ni una autenticación. Esta etapa no activa clases reales, cuentas, importaciones ni almacenamiento compartido.

## Requisitos de la aplicación real

| Área | Comportamiento requerido | Estado en 0.1.0 |
| --- | --- | --- |
| Materias | El docente crea una materia o sección y su código; todos los de esa clase usan el mismo | Entrada visual; un código de prueba |
| Acceso | Credencial de materia y cuenta individual verificada; acceso administrativo separado | Pendiente |
| Lista | Importar XLSX, pegar Apellido/Nombre o agregar estudiantes manualmente | Pendiente; perfiles ficticios fijos |
| Identidad | Activar un perfil precargado con validación individual; elegir un nombre no demuestra identidad | Pendiente |
| Datos | Confirmar nombres y apellidos correctos, cédula y teléfono `XXXX-XXXX`, incluso en perfiles precargados | Formulario local de ejemplo |
| Privacidad | Cédula y teléfono solo para el estudiante titular y docente autorizado | Datos de prueba en memoria; nunca en etiquetas ni listas |
| Avatar | Uno provisional para cada perfil precargado y personalización después de activarlo | Personalización de prueba |
| Espacios | Cada tema tiene un área diferenciada, instrucciones y cupo asignados por el docente | Tres áreas ficticias |
| Movimiento | Teclado y clic/toque, con colisiones; recorrer un área no cambia la matrícula | Implementado localmente |
| Equipo | Confirmación explícita, un equipo por estudiante y materia, cupos concurrentes garantizados por servidor | Reglas de prueba en una sola pestaña |
| Persistencia | Guardar identidad, avatar y equipo al desconectarse o volver a entrar | Pendiente |
| Presencia | Distinguir estudiante inscrito de estudiante conectado | Pendiente |
| Chat privado | Solicitud, aceptación o rechazo y disponibilidad | Simulación local explícita |
| Chat del grupo | Solo para integrantes del equipo | Pendiente |
| Administración | Crear materias, códigos, temas y cupos; importar y añadir alumnos; mover inscritos; cerrar elección; exportar | Pendiente |

## Importación de estudiantes

- Reconocer columnas `Apellido`, `Nombre` y, cuando exista, `Usuario` institucional.
- Ignorar filas en blanco, títulos, calificaciones, observaciones académicas y otras columnas ajenas a la conformación de grupos.
- Conservar el nombre original y el identificador estable. Normalizar espacios para búsqueda y presentación sin inventar tildes.
- Ofrecer un nombre breve sobre el avatar, basado en el primer nombre y primer apellido. No usar ese nombre breve como identificador único.
- Mostrar una vista previa de nuevos registros y posibles duplicados antes de importar.
- En futuras importaciones, conservar avatar, identidad y equipo ya existentes.
- Una corrección de nombre debe actualizar el mismo estudiante; no crear otro registro.
- Un perfil no activado puede tener avatar provisional en la lista, pero no debe aparecer como persona conectada en el mapa.

## Estados independientes para el docente

1. **Ingreso:** aún no ha entrado / perfil activado.
2. **Avatar:** provisional / personalizado.
3. **Equipo:** sin asignar / tema y equipo correspondiente.
4. **Presencia:** conectado / desconectado.

Un estudiante puede haber entrado y continuar sin equipo. Otro puede conservar equipo aunque esté desconectado. Estas situaciones no se deben mezclar en una única marca de «seleccionado».

## Arquitectura para el siguiente incremento

Mantener el código en GitHub. Elegir un alojamiento apto para una aplicación autenticada y una base de datos privada, por ejemplo mediante una integración futura con Supabase u otro servicio adecuado. No se ha provisionado ni seleccionado una cuenta externa.

Entidades mínimas previstas: docente, materia/sección, estudiante, matrícula, invitación o activación individual, avatar, tema, equipo, pertenencia, solicitud de chat y mensaje. Una misma persona puede pertenecer a varias materias con membresías separadas.

La validación individual puede resolverse con invitaciones personales, correo institucional o aprobación administrativa. Debe concretarse antes de activar alumnos reales. El código compartido de materia solo determina a qué aula se solicita entrar.

Las consultas y escrituras deben comprobar autorización en el servidor. La pertenencia única y el último cupo deben asegurarse en una transacción, no con un contador del navegador. El docente debe poder corregir una asignación y cerrar las inscripciones. La presencia en tiempo real no sustituye a la inscripción persistente.

## Próximo incremento sugerido

Conectar el acceso administrativo y la creación real de materias; después integrar importación y activación individual. Mantener el enlace público abriendo en el ingreso por código. No presentar la prueba actual como lista para gestionar alumnos reales.
