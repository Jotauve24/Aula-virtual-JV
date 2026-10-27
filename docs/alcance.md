# AulaVirtualJv · Alcance vigente

Estado: versión 0.17.0, 27 de octubre de 2026.

El aula se publica en GitHub Pages y utiliza Supabase para sesiones, materias,
perfiles, equipos, presencia y chat. Todas las materias comparten las mismas
páginas, módulos y funciones; no existen copias independientes por materia.

| Área | Comportamiento actual |
| --- | --- |
| Diseño visual | Todo el sitio, incluidos registro, recuperación, sala estudiantil y docente, Mi equipo y chat, comparte `assets/palette.css`: petróleo, verde azulado y crema; acentos coral, durazno y salvia, con cursivas y subrayados. Tipografía local Nunito. La sala conserva su maqueta animada, avatares y colores por equipo. Colores y luz decorativa por mesa; colisiones y rutas conservadas. |
| Portada | Código y recuperación agrupados, ayuda compacta junto al código, instrucciones y controles del tutorial unificados con paso actual resaltado. Tutorial animado en el orden real: código, registro, personalización del avatar, movimiento en el aula, cupos, elección y confirmación, Mi equipo y chat. Pausa, repetición y navegación manual. Datos de ejemplo y movimiento reducido; sin operaciones en la base de datos. |
| Pantalla completa | Ampliar aula desde Inicio se mantiene al navegar entre las cuatro páginas internas. El documento exterior conserva la ampliación; solo cambia su contenido. Reducir aula y Esc permiten salir. El panel docente incluye el control. Los accesos externos y la recarga siguen las reglas del navegador. |
| Primer ingreso | Código de materia, nombres, apellidos, cédula o pasaporte, correo y teléfono; avatar y elección de equipo. El correo inicial es de contacto y no se confirma. |
| Regreso habitual | La sesión guardada permite continuar con el mismo perfil, avatar y equipo. |
| Otro navegador | Acceso mediante enlace de correo verificado. Se abren las materias propias o se recupera una inscripción anterior con coincidencia única y sin presencia reciente. |
| Documento único | Cédula con guiones automáticos por prefijo/tomo/asiento, o pasaporte con país emisor. Una identidad documental y una inscripción por materia. Otro usuario debe recuperar la cuenta existente. El formato no acredita identidad oficial. |
| Perfiles anteriores | Completan el documento al regresar. Se conservan avatar, equipo y conversaciones; no se borran ni fusionan datos. |
| Contactos repetidos | No se crean dos inscripciones con el mismo correo o teléfono en una materia. Se pueden usar los mismos contactos en materias distintas. Los teléfonos se comparan sin espacios ni guiones y reconociendo +507 y 00507. Los duplicados históricos requieren identificación. |
| Docente | Renombrar sin cambiar código ni registros; crear, configurar, deshabilitar, restaurar y eliminar materias; administrar grupos y estudiantes; asignar o mover inscritos y exportar a Excel. |
| Bloqueo de grupos | Candado por grupo, independiente de sus cupos. Impide nuevas elecciones estudiantiles, conserva integrantes, consultas y chat. El docente puede reabrirlo o asignar estudiantes expresamente. |
| Excepciones de cupo | El propietario puede asignar estudiantes sin equipo o trasladarlos a un grupo lleno, con autorización explícita por asignación. El grupo muestra su ocupación real, por ejemplo 6/5, y mantiene su límite original para estudiantes. Se puede editar su nombre e indicaciones sin ampliar ese límite. |
| Nombre del equipo | Sus integrantes pueden cambiarlo desde el lápiz de Mi equipo (2–80 caracteres). Se conservan ID, integrantes, cupos, indicaciones, avatares y chat. Validación de pertenencia, nombres repetidos y cambios simultáneos en el servidor. El docente conserva su edición existente. |
| Presencia | Conteos y posiciones recientes. Inscripción, pertenencia a equipo y conexión son estados independientes. |
| Chat | Conversación y adjuntos privados por equipo. Correo visible para el propio equipo; teléfono voluntario. Envíos simultáneos bloqueados. |
| ZombieAdmin | Simulación docente con datos y chat ficticios; no ocupa plazas ni modifica conversaciones reales. |

La recuperación automática exige correo verificado, una única coincidencia en
la materia y un perfil anterior anónimo sin presencia en los últimos 25 segundos.
Si el perfil ya está protegido, se debe utilizar la cuenta que lo protege.
Los casos ambiguos conservan el perfil original y requieren verificación adicional.

El código de materia identifica el aula; la sesión y la verificación de correo
determinan quién puede acceder al perfil. Escribir un correo no concede acceso
automático a otra persona.

El prototipo Node/SQLite anterior se retiró del proyecto activo. Su código sigue
disponible en el historial de Git. Las migraciones de Supabase se conservan porque
son necesarias para reconstruir el esquema y mantener las instalaciones existentes.

La aplicación complementa E-ducativa: las actividades y calificaciones continúan
en la plataforma universitaria. El docente comparte un enlace y el código de la
materia, sin incrustar el aula en un iframe.

Comprobaciones: `npm run check` y `npm test` con Node.js 24.

El espacio del equipo elegido se ilumina suavemente; su rótulo es compacto y transparente, con la marca «✓ Tu equipo» (✓ y ocupación en teléfono). La lista también conserva la selección. La ventana del tema incluye «Ver mi equipo». Los correos son visibles dentro del propio equipo; únicamente el teléfono depende de la preferencia voluntaria. Otros equipos no reciben esos contactos.

Las operaciones pendientes descartan respuestas de una sesión o materia anterior.
Cerrar sesión detiene la apertura tardía del aula y las exportaciones docentes;
un adjunto pendiente no se publica en un contexto distinto. El API de precarga
de estudiantes queda retirado, junto con los accesos históricos ya deshabilitados.
