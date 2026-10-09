# Aula Encuentro

Herramienta para organizar equipos de una materia con avatares y espacios de trabajo por tema.

## Estado actual

- [Demostración para estudiantes](https://jotauve24.github.io/Aula-virtual-JV/): abre en el ingreso por código. El único código de esta demostración es **DEMO2026**. Perfiles, mensajes y equipos son ficticios y se borran al salir.
- **Base Supabase conectada:** `docente.html` ofrece acceso docente con Google. `live.html` permite el autorregistro estudiantil por código, correo de contacto, nombre, apellido y teléfono, sin enlace de confirmación. La sesión queda en el navegador. Sigue la [guía de configuración](supabase/README.md).
- **Panel docente 0.2.0:** servicio Node.js con inicio de sesión, materias y códigos generados, temas y cupos, listas importadas, asignación de equipos y almacenamiento SQLite. Está preparado en `server/` para ejecutarse en un alojamiento que admita un servidor y una base de datos privada. Aún no está desplegado y no aparece como acceso funcional en GitHub Pages.

El código de materia es compartido y permite registrarse mientras la inscripción está abierta. El correo se guarda como contacto declarado, sin verificar la identidad de quien lo escribe. El servicio Node/SQLite descrito más abajo es un prototipo independiente del panel publicado con Supabase.

## Panel docente en una computadora de desarrollo

Requiere **Node.js 24** y npm. Instala las dependencias con `npm ci`. Configura las variables de entorno `ADMIN_USERNAME` y `ADMIN_PASSWORD` (contraseña de 14 caracteres o más) en tu sesión local o en el alojamiento. Las credenciales y el archivo de base de datos no se guardan en el repositorio. Ejecuta `npm run start:admin` y abre `http://127.0.0.1:3000/docente/`.

El servicio escucha solo en `127.0.0.1` por defecto. Usa `HOST`, `PORT`, `DB_PATH` y `PUBLIC_ORIGIN` para ajustarlo al alojamiento. En producción `PUBLIC_ORIGIN` debe ser la dirección HTTPS definitiva, con conexión TLS y almacenamiento persistente para la base SQLite. La carpeta `.local-data/` queda excluida de Git.

| Función docente | Comportamiento actual |
| --- | --- |
| Acceso | Contraseña configurada en el servidor; sesión con cookie HttpOnly y protección CSRF; cierre de sesión |
| Materias | Crear cada materia/sección, editar nombre, abrir o cerrar elección; código aleatorio mostrado una vez y posibilidad de rotarlo |
| Temas | Crear y editar nombre, instrucciones y cupo; no permite reducir el cupo por debajo de los inscritos |
| Lista | Pegar tabla Markdown, TSV o CSV; cargar XLSX de hasta 1 MB; vista previa con nuevos, existentes y posibles duplicados |
| Reimportación | Solo agrega perfiles nuevos; conserva nombres corregidos y equipos de los existentes |
| Estudiantes | Agregar manualmente, corregir nombre, asignar o retirar de un equipo; control de cupo en una transacción de base de datos |
| Exportación | Descarga CSV para la materia desde la sesión docente |

La importación XLSX lee la primera hoja y solo utiliza las columnas `Usuario` (cuando exista), `Apellido` y `Nombre`. Ignora filas de título, espacios vacíos, calificaciones, observaciones y otras columnas. La importación **no** copia cédulas ni teléfonos; esos datos se solicitarán individualmente cuando exista un acceso verificado para el estudiante. Los nombres originales se conservan junto a los corregidos y el identificador estable del perfil.

## Comprobaciones

```sh
npm ci
npm run check
npm test
```

Las pruebas abarcan lectura XLSX sin importar notas, acceso docente, aislamiento entre materias, reimportación, cupos, confirmación de las operaciones y la demostración estudiantil. El sitio estático de prueba se puede servir de forma independiente con `npm start`.

## Seguridad y siguientes etapas

GitHub Pages aloja los archivos estáticos, [según su documentación](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Sus [límites](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) advierten contra el envío de contraseñas en Pages. Por eso el panel y la base de datos requieren un alojamiento de servidor separado. El código del repositorio es público; nunca incluyas contraseñas, códigos individuales de activación ni listas reales en commits, capturas o incidencias de GitHub.

La ruta Supabase añade la primera versión de activación, perfil y equipo, sujeta a configurar y probar un proyecto real. Faltan la presencia, el movimiento compartido y los chats reales. Consulta [el alcance](docs/alcance.md) para los estados y reglas acordadas.
