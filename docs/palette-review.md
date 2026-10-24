# Paletas compartidas por el usuario

Versión 0.12.0, 24 de octubre de 2026. Alcance: portada, tutorial, panel docente,
revisión docente de recuperaciones y colores del logo. Se conserva la composición
existente, la tipografía y el recorrido estudiantil.

## Referencias y aplicación

Se usaron los códigos impresos en las dos imágenes proporcionadas por el usuario.
La primera fotografía altera ligeramente algunos píxeles de las muestras; los
códigos escritos son la referencia para los valores CSS.

| Paleta | Colores |
| --- | --- |
| Coral, durazno y salvia | `#99B898` `#FECEA8` `#FF847C` `#E84A5F` `#2A363B` |
| Petróleo, verde azulado y crema | `#031926` `#468189` `#77ACA2` `#9DBEBB` `#F4E9CD` |

| Papel visual | Aplicación |
| --- | --- |
| Petróleo y carbón | Encabezado, escenario del tutorial y texto principal |
| Verde azulado | Logo, iconos, foco, progreso y controles |
| Verde suave y ópalo | Cabecera de la tarjeta del tutorial y reproducción |
| Champaña | Base cálida y texto sobre fondos oscuros |
| Coral y salmón | Palabra principal en cursiva y subrayados |
| Durazno | Contador y ayuda del código |
| Salvia | Pasos completados del tutorial |

Las diez muestras quedan como variables explícitas en `campus.css`. El fondo
general `#FBF8EF` es un tono claro derivado del champaña. Los botones y el texto
pequeño utilizan variantes oscuras del verde azulado y del coral para conservar
la lectura. Las cursivas y subrayados solicitados se mantienen; esta preferencia
explícita prevalece sobre las restricciones generales de paleta de Taste.

Se recolorearon los SVG existentes del logo sin modificar sus formas. Se
actualizaron sus versiones de caché y las de CSS/JavaScript a 0.12.0. No se
añadieron fuentes, paquetes, fotografías ni dependencias. Las ilustraciones de
equipos, personajes y animales conservan sus colores e identidad.

## Verificación

- Las 19 pruebas pertinentes de tutorial, recursos estáticos y estructura docente pasan.
- La sintaxis de los 26 módulos es válida y el cambio no altera funciones de base de datos.
- Las vistas de 1440, 768 y 390 px no tienen desplazamiento horizontal: sus anchos visibles y de documento coinciden en 1425, 753 y 375 px.
- El docente se revisó con datos ficticios: 14 estudiantes, cuatro equipos y dos personas sin equipo. Se comprobó también el diálogo de renombrar sin guardar cambios.
- Se comprobaron el código inválido, la limpieza del error al escribir y el estado de ingreso habilitado. Las pruebas están desconectadas de la base de datos y no se publican.

Contrastes de los colores finales:

| Elemento | Relación |
| --- | --- |
| Texto secundario sobre el fondo | 6,10:1 |
| Texto blanco del botón principal | 6,05:1 |
| Coral oscuro en texto pequeño | 5,46:1 |
| Coral original del título grande | 3,55:1 |
| Texto de cabecera sobre verde suave | 7,01:1 |
| Número de paso completado | 8,25:1 |
| Control de reproducción | 8,98:1 |

El coral original se reserva para el título grande; los textos pequeños usan su
variante oscura. Se verificó el renderizado con Browser/CUA. No se ejecutó el
inspector directo de navegador de Taste.
