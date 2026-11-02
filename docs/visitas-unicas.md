# Visitas únicas · 0.27.11

Los cuatro puntos de entrada muestran el mismo total global en la cabecera.
El indicador usa una base champán de la paleta. El número tiene el mismo tamaño
y peso que la etiqueta, en una sola línea y con la misma composición en las cuatro páginas.
Se acumula desde la activación, sin inventar visitas anteriores. Cada IP se
registra una vez, incluso entre sesiones, navegadores y materias. Un Wi-Fi con
una sola IP pública cuenta una visita; cambios de IP, VPN, conexiones IPv4 e
IPv6 diferentes pueden sumar otra. Es una medida de direcciones que visitan el
sitio, no de personas, matrícula ni usuarios conectados.

## Registro y privacidad

`site-visits` obtiene la IP del encabezado `CF-Connecting-IP` establecido por el
gateway de Supabase/Cloudflare. Ignora IPs del cuerpo y `X-Forwarded-For`.
Si falta una dirección válida no registra una visita: el cliente conserva la
lectura del total y reintenta. La función valida la clave pública mediante la
Data API antes de usar la credencial de servidor, que permanece en el entorno
de Edge Functions. El POST requiere el origen de GitHub Pages.

Postgres normaliza cada dirección y crea una huella HMAC-SHA256 con una clave
aleatoria privada. Solo se guarda esa huella, sin IP original, nombre, correo,
identificador de estudiante ni relación con una materia. Una restricción única
y un incremento dentro de la misma transacción evitan duplicados simultáneos.
La forma IPv4-mapped IPv6 y su IPv4 cuentan como una dirección.

El navegador solo puede leer la fila agregada `public.site_visit_totals`. RLS
y los permisos impiden escribir el contador, consultar huellas o ejecutar el
registro con claves de cliente. La función pública RPC es un envoltorio invoker;
solo el rol de servidor puede acceder al registro privado.

## Actualización

Una suscripción Realtime escucha exclusivamente cambios de la fila agregada.
Se recupera el total al reconectar y cada 60 segundos como respaldo. Al ocultar
la página se suspenden conexiones y solicitudes; volver a mostrarla permite
registrar un eventual cambio de red sin duplicar la IP anterior.

El total nunca disminuye por una respuesta HTTP tardía. Ante un fallo se indica
que el dato está pendiente o desactualizado; un dato no disponible no aparece
como cero. El título accesible explica el alcance y la fecha de inicio.

## Instalación y comprobación

1. Aplicar `20261102150525_unique_site_visits.sql`. Requiere el esquema `private`,
   pgcrypto en `extensions` y la publicación `supabase_realtime` del proyecto.
2. Desplegar `supabase/functions/site-visits/index.ts` como `site-visits` con
   `verify_jwt=false`: la función realiza su propia autenticación de API key y
   admite las claves modernas publicables. Utiliza las variables integradas
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; no requiere nuevos secretos.
3. Comprobar GET sin registrar visitas y POST repetidos desde el origen permitido.
   Dos POST con la misma IP deben devolver el mismo total.
4. Publicar HTML y recursos con la misma versión. La CSP permite únicamente el
   endpoint HTTPS y WebSocket de este proyecto para el contador.

`npm test` incluye normalización, estados sin red, respuestas tardías, pausa y
reanudación, heartbeat, reconexión y controles del endpoint. La prueba SQL
`tests/site-visits.integration.sql` usa direcciones reservadas de documentación,
comprueba deduplicación IPv4/IPv6 y permisos, y revierte todos sus cambios.
No debe ejecutarse quitando su transacción/rollback ni usarse para sembrar cifras.
