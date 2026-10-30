# Códigos recientes · 0.27.5

Al volver a la portada, el último código utilizado queda escrito y el botón Entrar a mi materia está habilitado. No se enfoca el campo automáticamente ni se abre el teclado del celular. Tocar el campo o su flecha muestra hasta cinco materias recientes; elegir una escribe su código y deja el foco en Entrar. El selector se cierra con Escape, al salir del formulario o al pulsar fuera de él.

Se conserva el código anterior de las versiones previas. Los códigos nuevos se recuerdan al enviarlos desde la portada; después de un ingreso autorizado, el aula agrega el nombre confirmado de la materia. Un código que el servidor rechaza como inexistente se elimina sin borrar otros códigos ni la sesión. Una desconexión temporal conserva los accesos recientes.

El historial pertenece a ese navegador o a la app instalada. Solo guarda código y nombre de hasta cinco materias; no contiene tokens, correo, nombres de estudiantes, documentos ni teléfonos. Olvidar recientes borra los códigos recordados, sin cerrar sesiones ni eliminar inscripciones. Si el almacenamiento no está disponible, sigue funcionando el ingreso manual y el historial de la página abierta.

Elegir un código no autentica ni crea perfiles por sí solo. Se usa el mismo formulario y el mismo traspaso de código a live.html. La sesión existente, la validación del servidor, la recuperación y las restricciones contra inscripciones duplicadas siguen decidiendo el ingreso. No se cambia Supabase, su configuración ni sus permisos.

Las pruebas incluyen el código anterior ya escrito, cambio de materia, identidad conservada, formatos inválidos, almacenamiento corrupto o bloqueado, selección sin foco de destino, cierre del selector y borrado voluntario. La verificación visual usa códigos y materias ficticios.

Verificación final: 375 pruebas aprobadas y sintaxis de 34 módulos. En el navegador se probó entrar directamente con el código prellenado, regresar y escoger otra materia, el código anterior a esta versión y la ausencia de historial. Se inspeccionaron escritorio y marcos de 768, 390 y 320 px; los anchos útiles y desplazables coinciden en 753, 375 y 305 px. Los nombres largos se ajustan dentro del selector. La portada no enfoca el campo al cargar, y elegir una materia deja listo Entrar.
