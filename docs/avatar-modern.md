# Avatares Pixel moderno · 0.23.0

La referencia elegida es la opción B de las propuestas visuales: rostro amable,
ojos con brillo y sonrisa, silueta escalonada, peinados definidos, luces en ropa
y zapatos. El dibujo final es arte nativo en rectángulos, compartido por SVG y
canvas; no depende de recortar las imágenes de referencia ni de recursos externos.

## Compatibilidad

`avatarSVG` y el dibujo del aula utilizan `spriteRects` en el mismo espacio
de 34 × 52. Se mantiene el anclaje al suelo, el espacio ocupado, los nombres,
la geometría de mesas, las rutas y la velocidad. Las vistas frontal, posterior
y de perfil cambian según la dirección; el paso coordina brazos y piernas sin
añadir movimiento automático a los retratos. El peinado sentado utiliza la misma
paleta y textura; las sillas y el asiento conservan sus coordenadas.

Se conservan `skin`, `shirt`, `outfit`, `hair` y `presentation`. El índice válido
de `outfit` tiene prioridad y los perfiles antiguos conservan el color de `shirt`.
Los tres peinados, las siete prendas y todos los tonos existentes se dibujan sin
cambiar el perfil; tampoco se agregan campos ni se modifica la RPC de guardado.
Los avatares incompletos usan valores visuales seguros. La paleta de luces se
reutiliza por combinación de colores, sin guardar datos de personas.

El dibujo compartido se aplica a portada, tutorial, selección de personaje,
estudiantes caminando y compañeros sentados, incluidas las salas docentes. Los
personajes especiales ZombieAdmin, Avatar X y animales conservan su propio arte.
Las marcas de equipos, chat, documentos, edad y observaciones no se modifican.

## Comprobación

Las pruebas cubren conservación de colores e identidad, perfiles antiguos,
geometría positiva dentro del sprite para todos los peinados, presentaciones,
direcciones y fases del paso, correspondencia de los perfiles izquierdo/derecho,
valores visuales seguros y escape de atributos SVG. Las etiquetas siguen siendo
texto accesible; los SVG decorativos no añaden foco al teclado.

La revisión visual usa datos ficticios y las pantallas reales de personalización
y aula en escritorio, tablet y celular, junto con una comparación del dibujo
anterior y el nuevo. No se modifican perfiles reales para revisar el aspecto.
