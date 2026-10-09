# Aula Encuentro

Aula web para organizar los equipos de una materia con un espacio visual por tema. El ingreso, el avatar y la pertenencia al equipo se guardan en Supabase. Las actividades y la mensajería académica continúan en la plataforma Educativa de la universidad.

## Sitio publicado

- [Ingreso de estudiantes](https://jotauve24.github.io/Aula-virtual-JV/): cada materia usa un código `MAT-…` compartido por el docente. El estudiante registra nombre, apellido, correo y teléfono de contacto, personaliza su avatar y elige un equipo con cupos disponibles.
- [Panel docente](https://jotauve24.github.io/Aula-virtual-JV/docente.html): la cuenta docente autorizada crea materias y temas, consulta grupos y estudiantes, libera integrantes y abre o cierra las inscripciones.
- El aula muestra los temas, sus cupos y los nombres de los integrantes del equipo. No sustituye las actividades ni el mensajero institucional.

El código de materia no verifica la identidad individual. El correo declarado es de contacto y tampoco se verifica. El perfil estudiantil depende de la sesión anónima guardada en ese navegador: cerrar sesión o borrar los datos del sitio puede impedir recuperar ese perfil. Para cambiar de equipo, el estudiante debe pedir al docente que libere su lugar. El mapa muestra hasta tres temas como mesas; los demás siguen disponibles en la lista lateral. El movimiento del avatar es local, no muestra la presencia de otras personas.

## Configuración y desarrollo

Consulta [la guía de Supabase](supabase/README.md) para preparar el proyecto y autorizar la cuenta docente. Nunca incluyas claves secretas, códigos privados de materia ni datos personales en el repositorio público.

El servicio `server/` con Node.js y SQLite se conserva como prototipo local independiente. No comparte estudiantes, equipos ni mensajes con el sitio publicado. Para ejecutarlo en desarrollo se requiere Node.js 24, `npm ci`, `ADMIN_USERNAME` y `ADMIN_PASSWORD` en el entorno, y `npm run start:admin`.

```sh
npm ci
npm run check
npm test
```

Las pruebas cubren la lógica del prototipo local y los modelos heredados. Para revisar la interfaz publicada también hay que comprobar manualmente el ingreso, la elección de equipo y las operaciones docentes con cuentas autorizadas y datos ficticios.
