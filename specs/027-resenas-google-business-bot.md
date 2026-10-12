# Especificación: reseñas de Google Business para el Bot

Las reseñas entran sólo desde eventos firmados de Zernio (`review.new` y `review.updated`). El Inbox
las persiste y deduplica antes de notificar a n8n.

## Quién responde

- **Cuatro y cinco estrellas**: las responde el bot automáticamente, con el texto de una plantilla del
  espacio (`resena_google_positiva`). El bot no escribe el texto: lo pide, y el servidor rellena sus
  huecos. Cambiar la respuesta es editar una fila, no un flujo.
- **Una a tres estrellas**: se derivan a una persona con `POST /v1/tools/reviews/{id}/route` y quedan
  esperando en el apartado **Reseñas** de la interfaz, donde alguien las lee y escribe la respuesta.
  Una respuesta automática a una queja con nombre y apellidos suena a plantilla y hace más daño que el
  silencio.

Una reseña que ya tiene respuesta no se toca: ni el bot la responde, ni aparece en la bandeja.

## Una sola respuesta, y no se pisa

Google conserva **una única** respuesta del propietario: publicar otra reemplaza la anterior, incluida
una escrita a mano en la interfaz de Google, y no hay historial. De ahí tres reglas:

1. Antes de publicar se lee la reseña. Si ya tiene respuesta, la operación se rechaza con `409`.
2. La respuesta se marca como publicada **después** de que el proveedor la acepte. Si el proveedor
   falla, la reseña sigue pendiente y se puede reintentar.
3. Si la publicación salió bien pero no se pudo registrar, la respuesta lo dice explícitamente: no se
   puede deshacer, y reintentar publicaría encima.

## El contrato del proveedor

`POST /v1/accounts/{accountId}/gmb-reviews/{reviewId}/reply` con `{ comment }`, leído en
[docs.zernio.com](https://docs.zernio.com/google-business/reply-to-google-business-review). Dos detalles
que no son obvios: `reviewId` es el **último tramo** del nombre de recurso de Google —no el nombre
completo— y la respuesta se asocia a la **sede seleccionada** de la cuenta.

## Evento verificado

Zernio entrega `review.new` con `id`, `event`, `review.id`, `review.rating`, `review.text`,
`review.reviewer.name`, `review.createdAt`, `review.hasReply` y `account.id`. El identificador de
reseña es el nombre completo de recurso de Google y debe tratarse como opaco.

El aviso que el trabajador manda a n8n lleva `event: 'google.review.received'`, `tenantId` y la reseña
con `provider_review_id`, `rating`, `body`, `reviewer_name`, `review_updated_at`, `zernio_account_id` y
`replied_at`.
