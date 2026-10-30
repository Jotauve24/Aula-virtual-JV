# Ayuda con video · 0.26.0

La portada abre una guía narrada desde un único botón «Ver video · 37 s»,
junto al título del tutorial, tanto en computadora como en celular. El aula
estudiantil tiene un icono de ayuda; el panel y la sala docente abren su guía
específica. Son recursos estáticos, sin solicitudes a cuentas o materias.

Desde 0.27.4 se retiran los accesos repetidos de la cabecera y de la introducción
móvil, junto con sus estilos. «Animar pasos» y «Pausar pasos» controlan únicamente
el recorrido interactivo, y se distinguen del video narrado.

## Comportamiento

- Un solo reproductor por documento, creado al solicitar ayuda; sin autoplay
  ni descarga de video al ingresar. El usuario pulsa los controles nativos.
- Estudiantes: versión horizontal de 37 s y composición vertical de 37 s.
  Se elige la vertical al abrir en hasta 600 px. Girar el dispositivo no cambia
  la fuente durante la reproducción. Hay descarga para celular.
- Docentes: guía propia de 54,5 s con voz femenina, desde la creación de una
  sección hasta el seguimiento y el listado. No se muestra en la ayuda del alumno.
- Subtítulos en español activados inicialmente y pasos escritos desplegables.
  Si el video falla, los pasos siguen disponibles y se ofrece abrirlo aparte.
- Un diálogo nativo controla el foco, Escape y fondo inerte. Al cerrarlo se
  pausa el video y se devuelve el foco al control que lo abrió. Al ocultar la
  pestaña o navegar también se detiene el audio; no se reanuda automáticamente.
- Abrir la guía suspende temporalmente la música y los avisos sonoros del aula,
  respetando la preferencia previa de sonido. La guía animada de la portada se
  suspende mientras el diálogo está abierto.

No se cambia el ingreso, registro, recuperación, identidad, permisos, equipos,
chat, datos de Supabase ni el documento persistente de pantalla completa.
Las referencias compartidas del runtime, manifiesto e iconos siguen la versión de package.json.

## Verificación

Las pruebas del controlador comprueban carga diferida, selección móvil, guía
por rol, cierre, Escape, navegación, pestaña oculta, reapertura y error de
video. Las pruebas de sonido verifican que el silencio temporal no cambie la
preferencia guardada. La suite existente cubre módulos, instalación, navegación,
registro, recuperación, chat y administración.

Los tres archivos se decodifican completos con FFmpeg. Estudiantes: 1110
fotogramas por formato; docentes: 1635. Ambos nuevos videos tienen póster como
primer fotograma y contenedor con inicio rápido. El audio docente mide
−16,5 LUFS y −1,8 dBFS de pico verdadero.

La revisión visual se realiza con el navegador soportado y fixtures locales
sin conexión a datos reales. Se conservan Nunito, las dos paletas, la cursiva
y el subrayado pedidos por el usuario, el aula y sus personajes. Es una adición
de controles y diálogo, por lo que Taste permite seguir el diseño existente
sin sortear otra dirección. Se usan controles de al menos 44 px, foco visible,
contraste, subtítulos y alternativas escritas; las transiciones respetan
movimiento reducido. La sombra pertenece a un diálogo flotante.

El linter general también señala rótulos, numeración del tutorial y controles
de sonido que ya existían. Esos componentes se conservan dentro del alcance
de AGENTS.md. Se revisan por separado los dos archivos nuevos. No se ejecuta
el inspector que controla Chrome directamente: se usa CUA para las mediciones
y las capturas equivalentes, de acuerdo con la política del entorno.

## Revisión visual final

Se inspeccionó la portada antes y después, y la ayuda en los cuatro puntos de
entrada. En los fixtures de 768, 390 y 320 px, el ancho del documento coincide
con su ancho desplazable (753/753, 375/375 y 305/305 px, descontando la barra
vertical del navegador de prueba). No hay desplazamiento horizontal. A 320 px
con 740 px de altura, el diálogo cabe entre y=8 e y=732; el título ocupa dos
líneas y el cierre mantiene 44 × 44 px. Las opciones inferiores se consultan
con el desplazamiento interno del diálogo.

Se verificó reproducción efectiva de los tres videos, subtítulos visibles,
selección de la versión vertical, apertura de los pasos escritos, cierre con
botón y Escape, devolución del foco y pausa después del cierre. El video
estudiantil se puede abrir también durante el registro y dentro de la sala;
el docente conserva una guía distinta en su panel y su sala. Las comprobaciones
usan exclusivamente identidades ficticias.

Crítica del componente: la acción de entrar con código conserva su jerarquía;
la ayuda es secundaria, la imagen principal es el aula real y los pasos se
pueden leer sin reproducir. Nunito, petróleo, teal y champaña enlazan el diálogo
con las cuatro pantallas. En celular se recompone el video y se mantienen sus
controles nativos. El contenido pequeño de las pantallas animadas puede
ampliarse con el control del reproductor o consultarse en los pasos escritos.
Puntuación editorial del alcance: diseño 8/10, usabilidad 8,5/10, creatividad
7,5/10 y contenido 8,5/10; ponderada 8,1/10. No es una nueva dirección visual.

Validación local final: 335 pruebas aprobadas, sintaxis correcta en 30 módulos,
y 0 FAIL / 0 WARN en el linter de Taste para los dos archivos nuevos.


## Acceso único · 0.27.4

La portada contiene un único botón que abre el video estudiantil, junto a «Así funciona el aula». Se retiraron los otros dos disparadores y las reglas de estilo que solo usaban ellos. El recorrido interactivo conserva sus controles y distingue «Animar pasos» de «Pausar pasos», con nombres accesibles que mencionan la animación.

Verificación: 365 pruebas existentes aprobadas y sintaxis de 33 módulos. Se comprobó un disparador de video en escritorio y en los marcos de 768, 390 y 320 px; los anchos útiles y desplazables coinciden en 753, 375 y 305 px. El botón abre la guía correspondiente al ancho, con subtítulos y pasos escritos, y cerrar devuelve el foco al mismo botón. El control de animación inicia y pausa el recorrido sin abrir el video. La revisión usa los ejemplos de la portada y no accede a cuentas o materias.
