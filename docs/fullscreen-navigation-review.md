# Pantalla completa al cambiar de sección · 0.15.0

Fecha: 25 de octubre de 2026.

## Problema y cambio

Cada enlace interno cargaba otro documento HTML. El navegador finaliza la
pantalla completa cuando descarga el documento que la solicitó.

Los cuatro puntos de entrada conservan sus rutas y su contenido. Un script
clásico en el encabezado crea un único iframe del mismo origen; la portada,
el aula estudiantil, el panel docente y la sala docente se abren dentro de él.
`embed.js` solicita y cierra la pantalla completa en el documento exterior,
que permanece montado durante la navegación. Una nueva página lee su estado
actual y muestra «Reducir aula» si corresponde. Esc se respeta y no provoca
una solicitud automática para volver a ampliar.

El panel docente añade el mismo control, con nombre accesible, estado pulsado,
foco visible y superficie de 44 × 44 px. Las paletas y el diseño se conservan.

## Inicio, historial y acceso

- Los módulos declarados con `data-aula-module` se importan en orden únicamente
  dentro del iframe. El contenedor no inicia otra sesión, presencia o aplicación.
- El iframe conserva el historial nativo. Su carga, los cambios de hash y las
  operaciones de History API sincronizan dirección y título en el contenedor.
- Los avisos al contenedor solo incluyen un tipo de evento. Se verifican origen,
  ventana emisora y las cuatro rutas permitidas antes de leer la dirección.
- Los callbacks de correo conservan sus rutas y separan las sesiones de docente
  y estudiante. La limpieza del fragmento de acceso también actualiza la barra
  de direcciones; los avisos no incluyen tokens ni URLs.
- Google abre la autorización en el documento principal. El `redirect_to`
  permanece igual; no se modificaron las URLs autorizadas en Supabase.
- Si falla la importación se muestra un aviso accesible con un botón para
  recargar el contenido.

El contenedor interno es una decisión de navegación, no un control de acceso.
La autenticación y los permisos existentes siguen en Supabase. No se modifican
registros, políticas, migraciones, cupos, equipos ni conversaciones.

## Verificación

- `npm test`: 222 pruebas aprobadas, incluidas 13 de navegación, pantalla
  completa y callbacks reales ejecutados con servicios ficticios.
- `npm run check`: 27 módulos válidos.
- `git diff --check`: sin errores.
- Navegador real con copia de las páginas y servicio desconectado: Inicio →
  panel docente → Atrás → recuperación estudiantil; dirección y título
  sincronizados, un único contenedor y ningún iframe anidado.
- Encabezado docente en ancho de 320 px: control de 44 × 44 px visible,
  sin desbordamiento horizontal. Se conserva el diseño de la portada.
- El navegador remoto de pruebas devuelve `TypeError: not granted` al solicitar
  pantalla completa, tanto en el aula como en una página aislada con una sola
  llamada nativa. Por ello la persistencia en pantalla completa no pudo
  confirmarse visualmente en este entorno. Las pruebas verifican que las cuatro
  rutas conservan el mismo documento propietario y que los controles leen,
  activan y desactivan su estado, incluido Esc y el retorno con BFCache.

## Límites

La persistencia cubre los enlaces internos dentro de la pestaña actual.
Recargar el documento exterior, abrir otra pestaña, cambiar de aplicación o
salir a un proveedor externo sigue la política de pantalla completa del navegador.
No se guarda una preferencia que intente reactivarla sin una acción del usuario.
