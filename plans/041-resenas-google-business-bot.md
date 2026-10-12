# Plan: reseñas Google Business y Bot

1. Contrato y migración de reseñas, decisiones y auditoría. **Hecho** (falta aplicar
   `20261012190000_google_review_reply_tracking`, que añade el texto publicado y quién lo escribió).
2. Adaptador Zernio: responder con idempotencia. **Hecho**:
   `ZernioApiClient.replyToGoogleReview`, con el contrato leído en docs.zernio.com y el recorte del
   identificador de reseña.
3. Worker: procesar webhooks de reseña, persistir y encolar aviso propio a n8n. **Hecho** (ya existía).
4. Bot: respuesta automática de cuatro y cinco estrellas y derivación del resto. **Hecho**: los dos
   extremos de herramientas (`…/reviews/{id}/reply` y `…/reviews/{id}/route`) y el flujo
   `Flujos_v2/Reseñas Google - respuesta automática y aviso al asesor.json`.
5. UI de revisión: apartado **Reseñas** con la lista de las pendientes y el cuadro de respuesta, más
   sus rutas de navegador. **Hecho**.
6. Despliegue y prueba con una reseña real: pendiente.
