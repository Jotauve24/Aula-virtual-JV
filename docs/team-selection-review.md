# Equipo iluminado y nombre editable · 0.16.0

Fecha: 27 de octubre de 2026.

## Resultado

El espacio del equipo seleccionado tiene una luz suave, basada en la geometría
real de su sala. Los rótulos del mapa son compactos y translúcidos, sin el cartel
opaco ni los contornos superpuestos que tapaban los muebles. Se mantienen el
nombre, la ocupación, el acceso al tema y la selección accesible. En teléfono,
la segunda línea se resume a ✓ y ocupación para conservar una altura de 44 px.
La luz no intercepta pulsaciones y se oculta sin equipo o durante el registro y
la personalización del avatar.

El lápiz junto al nombre en Mi equipo abre un formulario con Guardar nombre y
Cancelar. Escape cancela la edición. Valida 2–80 caracteres; bloquea envíos
duplicados mientras espera; conserva el texto tras un fallo y ante actualizaciones
en segundo plano. La respuesta guardada actualiza mapa, lista, insignia y chat.
Los demás integrantes reciben el nombre al actualizarse el aula (cada 15 segundos).
El docente lo recibe en las lecturas y exportaciones existentes.

## Permisos y datos

La migración `20261027125859_team_members_rename_own_team.sql` está aplicada.
El RPC público `team_rename` es SECURITY INVOKER y delega en una función privada
con autorización explícita por `auth.uid()`. Solo un integrante actual y registrado
puede renombrar su propio equipo de una materia activa. No habilita UPDATE directo
sobre tablas. La edición docente existente se conserva.

Se bloquean equipos ajenos, materias distintas, equipos archivados, nombres
repetidos en la misma materia y escrituras desde una versión anterior del nombre.
Los bloqueos siguen el orden materia → estudiante → equipo. Solo se actualiza
`topics.name`: no cambian ID, código, posición, instrucciones, cupos, integrantes,
avatares, contactos ni chat. Los nombres se renderizan como texto y la exportación
existente conserva celdas de texto, no fórmulas.

La simulación docente comparte formulario y apariencia; sus nombres se guardan
solo en memoria y se limpian al reiniciar. No usa el RPC ni modifica grupos reales.

## Verificación

- `npm test`: 233 pruebas aprobadas, incluidos el formulario, sus estados de espera,
  fallo y reintento, los cambios simultáneos y las respuestas tardías tras salir.
- `npm run check`: 28 módulos válidos. `git diff --check` sin errores.
- SQL de integración con identidades sintéticas: permisos de miembros, validación,
  nombres repetidos, versión obsoleta, materia/equipo ajenos y estado deshabilitado
  o archivado. También compara los datos del curso, estudiantes, grupos y chat
  antes/después. Se ejecutó antes de aplicar y sobre la función instalada;
  todas las identidades y datos de prueba terminaron en ROLLBACK.
- Asesor de seguridad de Supabase antes/después: sin hallazgos nuevos.
- Navegador con los controladores reales y servicios locales ficticios: nombre
  actualizado en mapa, Mi equipo y chat; estado Guardando; fallo con borrador
  conservado; reintento; recarga; Escape; elección y renombrado local en la
  demostración docente; reinicio sin cambios reales.
- Revisión visual a 1440, 768, 390 y 320 px, con un grupo, cuatro grupos,
  equipo completo, sin selección, sin equipos y nombre de 80 caracteres.
  Sin desbordamiento horizontal. Rótulos y lápiz con altura de 44 px en móvil.

Se conservaron las paletas y la tipografía. La luz y la transparencia son
excepciones explícitas solicitadas por el usuario a las reglas generales de Taste;
se aplican al estado del mapa. No se cambió la disposición del aula ni sus
colisiones. La verificación visual utilizó CUA; no se ejecutó el inspector directo
de Taste por las restricciones del entorno. Los ejemplos no se publican.
