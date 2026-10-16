# Auditoría UI/UX – AulaVirtualJv + Design Intelligence

**Fecha de revisión:** 15 de octubre de 2026  
**Alcance:** lectura del código de la rama `main` y revisión de la metodología pública de UI UX Pro Max.  
**Estado:** diagnóstico inicial; no supone pruebas visuales en dispositivos físicos, evaluación exhaustiva WCAG ni una medición de usuarios.

## Conclusión

No rediseñar la plataforma desde cero. Aprovechar la metodología de UI UX Pro Max para crear reglas de diseño propias y pruebas de usabilidad, sin instalar su librería como dependencia de producción. La sala pixel art, los animales, el avatar docente, las rutas, los grupos y el chat son elementos distintivos a **conservar**.

La identidad recomendable es **«Aula digital cálida + juego pixel art»**: interfaz educativa sobria y legible alrededor de una sala lúdica. Mantener HTML, CSS y JavaScript sin frameworks y no modificar Supabase ni la lógica de alumnos/grupos/chat en los cambios exclusivamente visuales.

## Alcance revisado

- `index.html`, `assets/styles.css`: ingreso de estudiantes y vista previa del aula.
- `live.html`, `assets/live.js`, `assets/live-world.css`: registro paso a paso, avatar, mapa, temas, controles táctiles y chat.
- `docente.html`, `assets/live.css`, `assets/teacher-live.css`, `assets/teacher.js`: materias, métricas, gestión de grupos, listas y estados.
- `docente-sala.html`, `assets/teacher-view.css`, `assets/teacher-view.js`: simulación ZombieAdmin.
- `assets/student-account.css`, `assets/student-recovery.js`: recuperación de cuentas.
- `assets/brand.css`, `assets/chat-ui.js`, `assets/retro-audio.css`: coherencia de marca, chats y sonidos.

### Fortalezas existentes

1. Identidad visual reconocible y personalización pixel art.
2. Registro progresivo con validación, recuperación de perfil y continuidad en el navegador.
3. Navegación por pestañas, selección de temas también en listados, y `aria-label` en diversos controles.
4. Indicador de usuarios conectados con información de estado y actualización periódica.
5. Avisos en el chat, estados de error, y controles para sonido.
6. Soporte parcial de `prefers-reduced-motion`, `:focus-visible`, diseño adaptable y controles de flechas para móviles.
7. Separación entre sala real de estudiantes y simulación de ZombieAdmin.

## Hallazgos y oportunidades (no implican fallo confirmado si requieren prueba visual)

| Prioridad | Hallazgo comprobado / riesgo | Recomendación | Archivos principales |
| --- | --- | --- | --- |
| P0 | Parte de los textos secundarios usan tamaños de 9–12 px, especialmente en móviles y estadísticas. | Incrementar tamaño, interlineado y jerarquía de información; verificar pantallas de 320, 375 y 390 px. | `assets/live-world.css`, `assets/teacher-live.css`, `assets/live.css` |
| P0 | Algunos colores de textos pequeños están por debajo de 4,5:1 de contraste en combinaciones presentes en CSS: `#698094` sobre `#ffffff` ≈ 4,10:1; `#648071` sobre `#f0f7f4` ≈ 3,97:1. | Oscurecer los textos secundarios y comprobar cada par de color en su estado y fondo reales. | `assets/teacher-live.css` |
| P0 | Hay opciones y controles visuales de 32–38 px. No son automáticamente una infracción WCAG, pero pueden resultar incómodos en pantallas táctiles. | Preferir 44–48 px en botones frecuentes, cerrar cuadros, flechas, paletas y selección de avatar; mantener áreas táctiles sin modificar la estética. | `assets/live-world.css`, `assets/student-account.css`, `assets/teacher-view.css` |
| P1 | El mapa Canvas concentra la interacción espacial; existen alternativas como botones de temas y cruceta. | Dar instrucciones contextuales más breves y accesos directos visibles («Ver temas» y «Ir al equipo»); verificar recorrido completo solo con teclado. | `live.html`, `assets/live.js` |
| P1 | El registro inicial emplea un contenedor con `role="dialog"` y `aria-modal` en lugar de un diálogo nativo. | Comprobar que el foco entre y permanezca donde corresponde, que la navegación por teclado sea clara y que el contexto se restaure al terminar. | `live.html`, `assets/live.js` |
| P1 | El panel docente reúne tareas administrativas y seguimiento en el detalle de una materia. | Reorganizar visualmente la página: información de la materia, estudiantes/equipos, acciones cotidianas, opciones avanzadas y acciones destructivas. No cambiar el comportamiento. | `docente.html`, `assets/live.css`, `assets/teacher.js` |
| P1 | Hay varios archivos CSS con reglas repetidas y sobrescrituras móviles, incluyendo tratamientos distintos de tarjetas y etiquetas. | Introducir tokens de espaciado, tipo, color, borde y estados; consolidar gradualmente reglas sin reescritura total. | `assets/styles.css`, `assets/live.css`, `assets/live-world.css`, `assets/teacher-live.css` |
| P2 | Los controles y avisos del chat usan una jerarquía propia. | Homologar mensajes de éxito, error, envío, adjunto y notificación; conservar privacidad y funcionalidad actuales. | `assets/chat-ui.js`, `assets/live-world.css` |
| P2 | El aula tiene animaciones y música independientes de sus controles de uso. | Mantenerlos como identidad; validar rendimiento, sensibilidad al movimiento, estado inicial del audio y legibilidad del escenario en móvil. | `assets/world.js`, `assets/animals.js`, `assets/retro-audio.js` |

**Contraste:** usar WCAG 2.2, criterio 1.4.3. El objetivo de texto normal es al menos 4,5:1, salvo excepciones previstas.  
**Tamaño táctil:** WCAG 2.2, criterio 2.5.8, establece un mínimo de 24×24 px, con excepciones; 44–48 px aquí es un objetivo de comodidad recomendado, no una obligación WCAG universal.

## Sistema de diseño propuesto

**No sustituir el diseño actual por glassmorphism o un tema genérico.** Conservar una familia de colores y dos usos complementarios:

- **Estudiante:** fondos cálidos, verde principal `#28594c`, gráficos pixel art y bordes discretamente lúdicos.
- **Docente:** misma marca y elementos base; azul profundo como color contextual para datos y métricas, verde para confirmaciones.
- **Acentos:** terracota o dorado suave únicamente en puntos de atención y foco, con contraste comprobado.
- **Tipografía:** interfaz y formularios con `Inter/system-ui`, al menos 14–16 px en texto operativo importante; títulos más expresivos donde ya funciona la serif.
- **Espaciado:** escala controlada `4, 8, 12, 16, 24, 32` px.
- **Controles:** variante principal, secundaria, peligrosa, iconográfica y estado deshabilitado. Objetivo táctil frecuente de 44–48 px.
- **Bordes:** suaves y consistentes en paneles; estética pixel art reservada al mapa, temas y elementos lúdicos.
- **Movimiento:** animaciones de ambiente de bajo costo; foco y mensajes de error no dependen exclusivamente de animaciones, color o sonido.
- **Responsive:** documentar diseño para 320, 375, 390, 768, 1024, 1440 px, zoom 200–400 % cuando aplique.

## Orden de implementación recomendado

### Fase A – Pulido conservador (primero)

1. Mejorar tipografía secundaria y contraste de colores con mediciones.
2. Aumentar objetivos táctiles donde haga falta y revisar separaciones.
3. Verificar que el registro, ventanas de temas y chat no desborden pantallas pequeñas.
4. Consolidar variables CSS comunes sin cambiar la apariencia de la sala.
5. Añadir pruebas de contraste/tamaño y comprobación visual manual por pantalla.

**Riesgo:** bajo. **No toca** la base de datos, los grupos, el chat ni los modelos de posición.

### Fase B – Usabilidad estudiantil

1. Simplificar indicaciones: descubrir tema → elegir equipo → conversar.
2. Señalización contextual en la sala y acceso alterno a temas independiente del mapa.
3. Mejorar foco, mensajes, validación y navegación entre preguntas.
4. Revisar accesibilidad de `Canvas`, cuadros de diálogo y controles táctiles.

**Riesgo:** medio por interacción. Probar registro nuevo y regreso de un estudiante existente.

### Fase C – Panel docente

1. Orden de lectura por tareas docentes frecuentes, dejando acciones destructivas separadas.
2. Fichas de materia más escaneables con estado, inscritos, conectados y acción primaria.
3. Mensajes de estado consistentes durante consultas, carga y recuperación.
4. Adaptación móvil de métricas, nombres largos, mesas y listados.

**Riesgo:** bajo-medio. Mantener autorizaciones, presencia y exportación intactas.

### Fase D – Refinamientos opcionales

1. Animaciones de transición discretas al elegir un tema o entrar en equipo, con movimiento reducido.
2. Refinar tarjetas de personaje y personalización si la prueba con estudiantes demuestra necesidad.
3. Estudiar una opción de «Ayuda» / tutorial inicial que se pueda volver a consultar.
4. Pruebas con alumnado y docentes reales antes de reorganizar funciones.

## Criterios de aceptación y validación

- No se cambia la lógica de Supabase, el registro, los grupos, la privacidad ni los chats reales.
- No se incorpora React, Tailwind obligatorio ni dependencias innecesarias.
- Las salas, mascotas, animaciones y ZombieAdmin permanecen funcionales.
- Probar alumnos nuevos, regreso con el mismo navegador, recuperación, equipo, mensajes y adjuntos.
- Probar teclado completo y retorno del foco al cerrar ventanas.
- Probar las diferentes anchuras de pantalla y zoom 200 %; no perder acciones con desbordamientos.
- Revisar pares de color y tamaños táctiles en estados normal, activo, error, deshabilitado y foco.
- Verificar preferencias de movimiento reducido y control manual del sonido.
- Ejecutar `npm run check` y `npm test`, más pruebas visuales manuales.

## Referencias externas

- [UI UX Pro Max – repositorio oficial](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [Metodología de búsqueda y sistemas de diseño](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/src/ui-ux-pro-max/templates/base/skill-content.md)
- [WCAG 2.2 – Contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 2.2 – Tamaño mínimo de objetivos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WCAG 2.2 – Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

**Decisión propuesta:** aprobar primero la **Fase A**, con un PR pequeño y capturas comparativas antes/después, sin rehacer pantallas ni instalar UI UX Pro Max como dependencia del sitio.
