# Revisión integral de AulaVirtualJv · 28 de octubre de 2026

Versión resultante: **0.24.0**. Base publicada: `8846a4e` (0.23.0).

## Recorridos y correcciones

| Área | Hallazgo y ajuste |
| --- | --- |
| Inicio de sesión estudiantil | Un alta anónima pendiente podía guardar sus credenciales después de cerrar sesión. Cada intento conserva su generación; salir descarta ese resultado y permite un intento nuevo independiente. El acceso docente sigue separado. |
| Registro | Una consulta de correo anterior podía bloquear o adelantar el formulario al volver al mismo campo. Se comprueban intento, pantalla, materia y datos actuales antes de aplicar la respuesta o habilitar el botón. El servidor mantiene la validación definitiva de duplicados. Un intento anterior no habilita los controles de otro registro y una sesión revocada al completar datos deja disponible la recuperación. |
| Personalización | Los botones reconstruidos perdían el foco del teclado. Ahora lo conserva la opción seleccionada. Guardar congela una copia de la apariencia y bloquea otras elecciones hasta confirmar; evita envíos simultáneos y descarta errores tardíos después de salir. |
| Privacidad del equipo | El control de compartir teléfono conserva el foco al actualizar el listado y utiliza un icono de teléfono, también en el simulador. El correo mantiene su visibilidad dentro del equipo y el teléfono sigue siendo voluntario. |
| Celular | Colores y peinados tienen controles de al menos 44 px de altura. Los campos de registro usan 16 px y 44 px de altura. En el editor de dos columnas el retrato queda visible mientras se recorren las opciones; en el ancho mínimo conserva la disposición vertical. |
| Recuperación | Las consultas y acciones verifican que la ventana y su generación sigan vigentes. Cerrar, salir o abrir otra pantalla descarta la respuesta anterior. Una consulta pendiente no reabre el aula ni reemplaza el contenido de otro diálogo. |
| Acceso docente | El envío del enlace informa que está trabajando y evita solicitudes simultáneas desde el mismo formulario. Las etiquetas de selección de estudiante y confirmación de nombre quedan asociadas a sus controles. |
| Tema y cupos | Guardar bloquea campos y cierre mientras se confirma. La operación mantiene el tema y materia originales, descarta respuestas de una sesión anterior y distingue un guardado exitoso de un fallo al actualizar la lista. Los errores permiten reintentar con los datos escritos. |
| Presencia docente | Las materias ausentes de una respuesta conservan estado desconocido. El total aparece como «—» y se anuncia la actualización parcial; un cero confirmado sigue mostrándose como cero. Un contador histórico sin lista no inventa una lista vacía. |
| Mantenimiento | Se retiran dos variables sin uso de la sala docente. `package-lock.json` estaba en 0.20.0: queda sincronizado con 0.24.0. Se comprueba que todos los módulos de producción sean alcanzables y que los recursos de las cuatro páginas usen la misma versión. |

Se conserva la identidad visual elegida, Nunito local, ambas paletas, Pixel
moderno, el mapa, los animales y el tutorial. La ampliación mantiene su documento
exterior. Los cambios se aplican a todas las materias mediante los módulos
compartidos.

## Verificación

- **308 pruebas de JavaScript aprobadas**, con casos nuevos de respuestas fuera
  de orden, cierre durante una solicitud, reintento, foco de teclado, guardado
  simultáneo y presencia parcial.
- **28 módulos** con sintaxis correcta; comprobación de diferencias sin errores.
- **15 comprobaciones SQL aprobadas**, con cuentas y materias ficticias dentro
  de transacciones terminadas en `ROLLBACK`: códigos, renombrado de materia,
  operaciones generales y adjuntos, revisión de matrícula, bloqueos y cupos,
  API retirada, grupos listos para check, edad, contactos, documentos,
  recuperación, seguimiento docente, privacidad del equipo, renombrado de
  equipo y check de grupo creado.
- Revisión visual mediante las pantallas y controladores reales, un servicio
  ficticio local y la conexión externa bloqueada. Se prueban escritorio,
  tablet y celular, nombres largos, materias vacías, formularios, datos parciales,
  personalización, Mi equipo, chat y sala docente.

La inspección agregada de datos existentes encontró **cero grupos de correos
repetidos y cero grupos de teléfonos normalizados repetidos por materia**, y
**cero estudiantes asociados a equipos de otra materia**. No acredita que dos
personas con datos distintos sean la misma persona: los documentos son datos
declarados. Las pruebas de documentos comprueban su normalización y unicidad.

Se verificaron las **46 RPC usadas por el cliente**: existen y permiten al rol
autenticado. Ninguna función de los esquemas de aplicación concede ejecución al
rol `anon`; las tablas de aplicación tienen RLS habilitado. Las sesiones
estudiantiles anónimas de Supabase utilizan el rol autenticado y las operaciones
comprueban su pertenencia o propiedad.

## Asesores y límites

La revisión de Supabase mantiene los avisos de la arquitectura existente:

- [Funciones con privilegios y autorización interna](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
  Las comprobaciones SQL verifican aislamiento y propiedad. Cambiar permisos de
  manera indiscriminada impediría el acceso de estudiantes y docentes.
- [RLS sin políticas directas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
  Las tablas se utilizan a través de RPC autorizadas, no mediante acceso directo
  desde el navegador.
- Acceso de sesiones anónimas a Storage: las políticas limitan los archivos al
  equipo propio y al propietario docente. Se conserva el registro sin contraseña.
- [Protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection):
  el flujo publicado usa enlaces de correo y Google.
- [Tres claves foráneas sin un índice coincidente](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys):
  dos pertenecen a la antigua tabla de solicitudes y una a mensajes, cuya búsqueda
  por equipo ya tiene índice. No se eliminan índices por estadísticas de uso
  insuficientes.

No se cambió el esquema de la base de datos ni se modificaron registros reales.
No se enviaron correos ni mensajes reales durante la revisión. Las pruebas de
adjuntos verifican permisos y lógica; no comprueban la transferencia real de
binarios ni la entrega de correo por el proveedor. 
