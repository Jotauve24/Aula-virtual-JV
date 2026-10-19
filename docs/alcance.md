# AulaVirtualJv · Alcance vigente

Estado: versión 0.5.0, 19 de octubre de 2026.

El aula se publica en GitHub Pages y utiliza Supabase para sesiones, materias,
perfiles, equipos, presencia y chat. Todas las materias comparten las mismas
páginas, módulos y funciones; no existen copias independientes por materia.

| Área | Comportamiento actual |
| --- | --- |
| Primer ingreso | Código de materia, nombres, apellidos, correo y teléfono; avatar y elección de equipo. El correo inicial es de contacto y no se confirma. |
| Regreso habitual | La sesión guardada permite continuar con el mismo perfil, avatar y equipo. |
| Otro navegador | Acceso mediante enlace de correo verificado. Se abren las materias propias o se recupera una inscripción anterior con coincidencia única y sin presencia reciente. |
| Correos repetidos | No se crean dos inscripciones con el mismo correo en una materia. Se puede usar el mismo correo en materias distintas. Los duplicados históricos requieren identificación. |
| Docente | Crear, configurar, deshabilitar, restaurar y eliminar materias; administrar grupos y estudiantes; asignar o mover inscritos y exportar a Excel. |
| Presencia | Conteos y posiciones recientes. Inscripción, pertenencia a equipo y conexión son estados independientes. |
| Chat | Conversación y adjuntos privados por equipo; consentimiento para compartir datos de contacto. |
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
