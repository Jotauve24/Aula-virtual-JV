# Aula Encuentro

Primera versión del espacio virtual para conformar equipos de una materia. El enlace abre **siempre en el ingreso de estudiantes por código de materia**.

**Estado: demostración funcional, versión 0.1.0.** No es un sistema de autenticación ni un aula multijugador. No hay estudiantes ni materias reales registrados. El único código habilitado es `DEMO2026`.

## Abrir

- URL prevista después de la publicación: https://jotauve24.github.io/aula-encuentro/ (la subida inicial está pendiente de habilitar el permiso de escritura en GitHub).
- Carpeta del proyecto: `aula-encuentro/`, dentro del repositorio `Jotauve24/jotauve24.github.io`.
- Código de prueba: **DEMO2026**. El botón situado junto a «Conoce el aula antes de entrar» también inicia la demostración.

## Qué se puede probar

1. Ingreso por código con mensajes para entradas vacías, formato incorrecto y materias que aún no están activas.
2. Selección de un perfil ficticio precargado y búsqueda por nombre o apellido.
3. Corrección obligatoria de nombres, apellidos, cédula de ejemplo y teléfono de ocho dígitos, con formato `XXXX-XXXX`. Editar un nombre conserva el mismo identificador interno.
4. Personalización del tono de piel, ropa y cabello del avatar.
5. Recorrido por tres espacios distintos para temas y un punto de encuentro. Movimiento con teclado, botones y clic/toque, rodeando el mobiliario.
6. Inscripción local a un solo equipo, confirmación de la elección, control de cupos y salida confirmada. Recorrer otro espacio no cambia la inscripción.
7. Simulación explícita de una solicitud de chat aceptada o rechazada. El personaje ocupado no acepta solicitudes.
8. Diseño adaptable a teléfono y escritorio, navegación por teclado y respeto de la preferencia de movimiento reducido.

Los perfiles, temas, integrantes, disponibilidad y chats son **ficticios**. Los cambios solo viven en la memoria de la pestaña. Salir de la prueba o recargar devuelve al ingreso y elimina esos cambios. No hay almacenamiento local, cookies de la aplicación, analítica ni envío de formularios a un servidor. El proveedor de alojamiento puede mantener sus propios registros técnicos de visitas.

## Ejecutar y comprobar

Se necesita un servidor de archivos; abrir directamente `index.html` con `file://` no carga los módulos de JavaScript en todos los navegadores.

```sh
cd aula-encuentro
python3 -m http.server 4173
```

Abrir http://localhost:4173. No se requieren paquetes de npm para ejecutar esta versión.

Con Node.js instalado:

```sh
npm run check
npm test
```

## Archivos

| Ruta | Responsabilidad |
| --- | --- |
| `index.html` | Pantalla inicial de ingreso y estructura accesible |
| `assets/styles.css` | Diseño adaptable y estados de la interfaz |
| `assets/app.js` | Recorrido y comportamiento de la demostración |
| `assets/model.js` | Datos ficticios, validación y reglas de los equipos |
| `assets/world.js` | Avatares, dibujo del aula y rutas alrededor de muebles |
| `docs/alcance.md` | Requisitos acordados y funcionalidades pendientes |
| `tests/model.test.js` | Comprobaciones de datos, cupos, unicidad y movimiento |

El dibujo del aula y los avatares se generan con código propio. No se usan activos, código, marcas ni servicios de Gather o de los repositorios investigados. No se copió la lista real de estudiantes al repositorio público.

## Publicación y siguiente etapa

La carpeta contiene archivos estáticos y puede publicarse mediante la configuración de GitHub Pages del repositorio existente. No necesita compilación ni modificar la portada del sitio personal. Cada actualización de esta carpeta puede publicarse con el mecanismo ya configurado en el repositorio.

La etapa siguiente requiere una aplicación con servidor, base de datos privada y verificación de identidad. GitHub Pages se utiliza aquí para la **vista de prueba**; no se deben convertir códigos escritos en JavaScript ni nombres seleccionables en supuestos mecanismos de autenticación. La [documentación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) describe el alojamiento estático, y sus [límites de uso](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) indican que no debe usarse para transacciones sensibles como enviar contraseñas.

Las contraseñas de grupo, cédulas, teléfonos, listas de estudiantes reales y credenciales del servidor deberán permanecer fuera del repositorio público. La política de esta versión (`connect-src 'none'`, `form-action 'none'`) impide conexiones y envíos de formularios desde la aplicación. Integrar un servidor requiere revisar explícitamente esa política y cambiar de alojamiento según corresponda.

Consulta [el alcance acordado](docs/alcance.md) antes de desarrollar la siguiente etapa.
