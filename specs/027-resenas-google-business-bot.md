# Especificación: reseñas de Google Business para el Bot

Las reseñas entran sólo desde eventos firmados de Zernio (`review.new` y `review.updated`). El Inbox
las persiste y deduplica antes de notificar a n8n. El Bot puede publicar automáticamente sólo reseñas
de cuatro o cinco estrellas sin contenido sensible; las restantes requieren transferencia humana.

Cada intento de respuesta usa una clave idempotente y vuelve a leer la reseña antes de publicar, pues
Google conserva una única respuesta del propietario y una publicación nueva reemplaza la anterior.
