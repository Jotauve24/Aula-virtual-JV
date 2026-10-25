# Acceso y controles del tutorial · 0.14.0

## Alcance y dirección

Revisión de las dos capturas compartidas el 25 de octubre de 2026: la tarjeta de
código con ayudas dispersas y las instrucciones/controles del tutorial.
Se conserva la dirección anterior de Taste (The page is the object), la maqueta
real del aula, Nunito, las dos paletas globales, cursivas y subrayados. Es una
mejora de componentes dentro de una dirección existente; no hay un nuevo sorteo,
imágenes generadas, dependencias ni cambios de arquitectura.

## Resultado

- Ayuda de 44 × 44 px junto al código, con nombre, título y apertura de diálogo.
- Recuperación dentro de la tarjeta de acceso y recordatorio del perfil breve.
- Instrucción, progreso, pasos y reproducción dentro de un bloque común.
- Paso actual con fondo, borde y marcador coral; pasos anteriores en salvia.
- Repetir como icono y flechas con texto cuando hay espacio. Etiquetas accesibles
  en todos los anchos, foco visible y controles de al menos 44 px.
- Iconos SVG estables: el reproductor actualiza solo su etiqueta al cambiar de
  estado y conserva su representación en pausa/reproducción.
- Corrección observada durante la revisión: la regla genérica del botón de la
  maqueta anulaba el ocultamiento de las acciones de confirmar/lugar guardado.
  El selector ahora conserva una sola acción para cada fase, según el estado
  existente del tutorial. Las ocho tarjetas caben completas a 1024 px.

## Verificación

208 pruebas funcionales y sintaxis válida en 26 módulos. Revisados los ocho
pasos y su orden, pausa/reproducción conservando los SVG, ayuda por teclado,
cierre con Escape, validación con código inválido, limpieza del error al editar
y habilitación del botón con código del formato correcto sin enviarlo.

Browser/CUA: 1440 px → 1425/1425; 1024 → 1009/1009; 768 → 753/753;
320 → 305/305 (ancho útil/scrollWidth). En 390 px se revisó la tarjeta de acceso y
la navegación en dos filas. Todos los controles del reproductor miden 44 px de
alto; ayuda, repetición y flechas tienen al menos 44 × 44 px. Sin datos reales,
inscripciones, mensajes enviados ni cambios de cuenta para esta verificación.

Crítica visual final: se agrupan las ayudas, el paso actual se distingue a simple
vista y las instrucciones son más breves. Se redujeron los huecos de los textos
manteniendo un espacio reservado según el ancho para evitar saltos al reproducir.
La maqueta sigue siendo una ilustración a escala; sus rótulos pequeños se explican
en el texto legible del tutorial. Se aplica la revisión equivalente por Browser/CUA;
no se ejecuta el inspector directo de Taste por las instrucciones del proyecto.
