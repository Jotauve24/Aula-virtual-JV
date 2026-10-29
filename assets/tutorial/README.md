# Guías de AulavirtualJV

Recursos locales para el reproductor de ayuda. No se precargan videos al entrar.

| Recurso | Formato | Duración |
| --- | --- | --- |
| estudiantes.mp4 | 1920 × 1080, 30 fps | 37 s |
| estudiantes-vertical.mp4 | 1080 × 1920, 30 fps | 37 s |
| docentes.mp4 | 1920 × 1080, 30 fps | 54,5 s |

Los tres videos usan H.264 y audio AAC estéreo. Tienen póster, metadatos de
idioma español y subtítulos integrados opcionales; el reproductor web carga
las pistas WebVTT, activadas inicialmente. Los controles nativos permiten
pausar, silenciar, buscar y ampliar. La versión vertical puede descargarse
desde la guía estudiantil.

Son recreaciones animadas de los controles del producto, con sus avatares,
mapa, logo y fuente Nunito, conservando el orden código → registro → avatar →
aula → elección confirmada → equipo y chat. La guía docente incluye materias,
código, grupos, aviso de matrícula, check y listado. El check documenta una
acción realizada en la plataforma institucional; no crea allí un grupo ni
verifica automáticamente una matrícula.

Todos los nombres, códigos y datos de las escenas son ficticios. No se usaron
cuentas ni registros reales. La voz femenina es sintética, no clonada, generada
localmente con Kokoro v1, voz `ef_dora`, fonética `es-419`. La música es una
composición original sintetizada para la demostración. Los videos identifican
la voz generada por IA y los datos de ejemplo.

Fuentes del flujo y del motor:

- BRAG Slim: https://github.com/latent-spaces/brag/tree/main/skills/brag-slim
- TTS: https://github.com/NoizAI/skills/tree/main/skills/tts
- Motor Kokoro ONNX (MIT): https://github.com/thewh1teagle/kokoro-onnx
- Modelo Kokoro (Apache 2.0): https://huggingface.co/hexgrad/Kokoro-82M
- Nunito (OFL): ../fonts/OFL-Nunito.txt

La síntesis adicional del docente se completó con `ORT_DISABLE_TELEMETRY=1`
antes de inicializar el motor y con `disable_telemetry_events()`, según la
opción oficial de privacidad de ONNX Runtime. Ningún motor de síntesis se
ejecuta en la aplicación ni en el navegador del estudiante.
