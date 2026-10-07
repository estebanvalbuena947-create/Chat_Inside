# Especificación: multimedia de las conversaciones

- **Estado:** implementada
- **Responsable:** conversaciones y almacenamiento
- **Fecha:** 2026-09-29

**Cierre:** implementada y verificada el 2026-09-29 con una fotografia real. La pasada periodica que reintenta las copias fallidas tambien existe: `apps/worker/src/media-repair.ts`, con sus pruebas. Revisado el 2026-10-06.

## Resultado

La multimedia que envía un contacto se conserva, se ve dentro de la conversación y se puede consultar en una galería con el nombre de quien la envió y la fecha.

## El problema de fondo

El proveedor entrega la multimedia como un **enlace firmado del CDN de Instagram** que caduca en días: se comprobó que los adjuntos del 13 y 14 de agosto ya responden `404`, mientras que el de unas horas antes seguía vivo. Guardar solo el enlace produce una galería de imágenes rotas, así que la copia debe hacerse en el momento en que el mensaje llega.

## Reglas

1. La multimedia se copia al almacenamiento propio al procesar el mensaje entrante; el enlace del proveedor se conserva solo como referencia.
2. **Ningún adjunto puede impedir que un mensaje se guarde.** Un adjunto con forma inesperada, un enlace caducado o un fallo de descarga se anotan y el mensaje permanece; el proceso nunca lanza por esta razón.
3. El tipo se decide por los **bytes reales** del archivo, nunca por lo que declare el proveedor. Lo que no se puede reconocer no se escribe en el bucket.
4. Solo se aceptan direcciones públicas por `https` y sin credenciales, y se rechazan las redirecciones: un enlace del proveedor es entrada no confiable.
5. La ingesta es idempotente: un reintento del webhook no duplica el adjunto y vuelve a intentar la copia si aún faltaba.
6. El bucket es privado y su ruta interna nunca se entrega: la API firma enlaces temporales.
7. Una publicación compartida **sí trae su medio** (la imagen o el vídeo de la publicación) y el texto que la acompañaba. Se copia como cualquier otro adjunto y su texto se guarda para mostrar el contexto.
8. La galería y las imágenes dentro de la conversación las ve cualquier integrante del tenant, porque ya ve esas conversaciones.

## Contrato

- `GET /v1/tenants/:tenantId/media?kind=&search=&cursor=&limit=` devuelve `{ items, nextCursor }`, con el nombre del contacto, el tipo, la fecha y un enlace firmado de corto plazo (`url` nulo si no hay copia).
- `search` filtra por nombre de contacto. Se resuelve en dos pasos —contactos y luego conversaciones— igual que la búsqueda de la bandeja, y un término sin caracteres utilizables devuelve una página vacía en lugar de todo el archivo.
- La vista se presenta como lista con miniatura: nombre del contacto, tipo, fecha y accesos a ver el archivo o ir a la conversación.
- El historial de mensajes incorpora `attachments[]` con `{ id, kind, contentType, url }`.
- Sin sesión `401`; sin pertenencia `403`; cursor no emitido por la aplicación `400`.

## Datos y rollback

- Tabla `message_attachments` con claves compuestas por tenant, unicidad `(tenant_id, message_id, ordinal)`, RLS y permisos retirados a los roles públicos, igual que el resto.
- Bucket privado `conversation-media` con límite de tamaño y tipos permitidos.
- Rollback: dejar de exponer la galería y el campo `attachments`. Los mensajes y las copias permanecen; el bucket puede vaciarse aparte.
- La pasada periódica que reintenta las copias marcadas como fallidas ya existe: `apps/worker/src/media-repair.ts`, que usa el índice parcial para encontrarlas.
