# Biblioteca independiente · 0.32.0

## Uso

**Biblioteca** abre `biblioteca.html`, un apartado independiente accesible desde la portada y las cabeceras del aula y del panel docente. El contenido se organiza en colecciones por materia. La vista docente usa `my_courses`; la estudiantil, `student_owned_courses`. Estas consultas existentes devuelven únicamente las materias autorizadas para su cuenta. No se utilizan códigos recientes como permisos.

Cada materia conserva su colección de recursos. Los estudiantes que completaron su
registro y el docente propietario pueden leerlo y publicar. Todos los equipos
de esa materia ven el contenido visible, aunque no pertenezcan al mismo equipo.
Las publicaciones no aparecen en otras materias ni se abren con el código sin
tener una inscripción autorizada.

**Publicar contenido** acepta un título de hasta 120 caracteres, texto de hasta
3000, un archivo opcional y un enlace HTTPS opcional. Los tipos son nota,
infografía, documento, presentación, libro, video y enlace. Video y enlace
requieren una dirección HTTPS. Los videos no se suben como archivos.

Los formatos de archivo siguen la lista del chat: imágenes JPG/PNG/WebP/GIF,
PDF, TXT/CSV, Word, Excel, PowerPoint y ZIP. El límite es 10 MB por archivo.
Las imágenes tienen vista previa y todos los adjuntos permiten descarga.
No se ejecuta contenido HTML de las publicaciones ni se incrustan sitios externos.

El filtro de tipo, la búsqueda y **Más filtros** permiten localizar contenido
por autor, texto, equipo o publicaciones propias. **Ocultas o retiradas** muestra
solo las publicaciones autorizadas para esa persona. Se cargan 24 elementos por
página, con los destacados primero. **Actualizar tablero** vuelve a consultar
el servidor; el tablero no afirma que su listado se actualice en tiempo real.

## Docente y autor

En la biblioteca, selecciona una materia para abrir sus recursos.
**Indicaciones y permisos** guarda la consigna y permite cerrar nuevas
publicaciones y ediciones de estudiantes. La lectura continúa disponible.
El docente puede publicar mientras el tablero esté cerrado, destacar contenido,
ocultarlo y restaurarlo. El autor edita o retira únicamente sus publicaciones.
Una publicación retirada puede restaurarse; una publicación oculta por el
docente solo puede restaurarla el docente. No hay borrado irreversible desde
el mural.

La revisión guardada impide sobrescribir cambios realizados en otro dispositivo.
Una respuesta tardía de otra materia o de una sesión cerrada se descarta. Los
borradores se conservan en el formulario ante errores, sin guardado automático.
Recuperar una inscripción conserva la autoría mediante el identificador estable
del estudiante, aunque cambie la cuenta de autenticación.

## Archivos y acceso

La migración `20261116185554_course_content_board.sql` crea las tablas en el
esquema privado, con RLS y acceso directo denegado. Cuatro RPC públicos de tipo
security invoker llaman funciones privadas que comprueban la materia activa,
su propietario o la inscripción actual. No se concede un rol docente nuevo.

Los archivos usan el bucket privado existente `team-attachments`, bajo
`materia/board/usuario/uuid.ext`. El segundo segmento separa el mural del chat.
El servidor verifica ruta, propietario, tamaño, MIME, extensión y nombre de
descarga. Un archivo pendiente solo lo lee su autor; publicado, lo leen los
miembros autorizados. Ocultarlo retira el acceso a los demás estudiantes.
Se permite cancelar únicamente archivos propios que no estén publicados.
La eliminación física de una materia ya incluye este prefijo en su manifiesto
de archivos, por lo que no se omiten los adjuntos del mural.

Se muestran nombre del autor y equipo, sin incorporar correo, teléfono, edad,
documento de identidad ni credenciales a las respuestas del tablero. No se
crean calificaciones, mensajes de chat ni notificaciones automáticas.

## Modo zombi y validación

La biblioteca de ejemplo (`biblioteca.html?demo=1`) utiliza el mismo componente visual y un
adaptador local, con dos materias ficticias independientes. Se abre desde el acceso de ejemplo y desde la cabecera de la sala docente. Sus cinco publicaciones iniciales, la infografía SVG y los
archivos seleccionados son ficticios. Las pruebas se mantienen en memoria;
**Reiniciar ejemplo** las descarta sin enviar publicaciones al servidor.

`npm test` cubre validación, archivos, sesiones, cambios de materia, conflictos,
permisos de interfaz y demostración, además de la suite existente. `npm run
check` verifica sintaxis y versiones compartidas. El script
`tests/content-board.integration.sql` usa identidades y materias ficticias
dentro de una transacción que termina con ROLLBACK. Verifica aislamiento entre
materias, grupos, recuperación, autoría, revisiones, moderación y políticas de
Storage, incluido el rechazo de nombres ejecutables y del acceso al chat.

La revisión visual utiliza datos ficticios y la aplicación real en escritorio,
tableta y celular. La navegación a Biblioteca conserva el documento que posee la pantalla completa. Se comprueban cambios de materia y de rol, acceso sin sesión, errores, catálogo vacío y nombres largos.

El paso a Biblioteca no modifica el esquema, los permisos ni los datos existentes: reutiliza los mismos RPC de publicaciones y Storage. Se retiraron las instancias incrustadas y sus manejadores del aula, de la sala docente y del panel. La prueba automatizada del selector nativo de archivos se
interrumpió; no se considera una prueba visual de subida completada. La API de
archivos y sus permisos se verificaron con pruebas automatizadas y SQL.
