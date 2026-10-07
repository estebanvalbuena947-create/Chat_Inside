# Plan 010 — Ciclo de vida de mensajes Zernio

- **Estado:** implementado
- **Fecha:** 2026-08-14
- **Autorización:** continuación de desarrollo solicitada por el administrador.

## Regla

Un mensaje saliente cambia de estado solamente cuando Zernio identifica de forma explícita el mismo mensaje. Los eventos duplicados o fuera de orden no hacen retroceder su estado y un evento de otra cuenta o conversación no puede afectar al tenant.

## Diseño

1. El adaptador de salida valida `data.messageId` de la respuesta de Zernio y la guarda como referencia externa del mensaje local antes de completar su outbox. Si Zernio incluye `data.sentAt`, se conserva; si lo omite, la confirmación local de la respuesta HTTP se guarda como `sent_at`. Esa marca no representa entrega ni lectura.
2. El worker normaliza exclusivamente `message.sent`, `message.delivered`, `message.read` y `message.failed`, vuelve a verificar la cuenta de canal y busca el mensaje por `(tenant_id, channel_account_id, provider_message_id)`. Cuando esté presente, `message.platformMessageId` es la referencia de plataforma; `message.id` queda como respaldo compatible.
3. Si no existe una correlación explícita, el evento se completa sin crear ni modificar mensajes: no se comparan cuerpos, nombres ni horarios.
4. La política de dominio conserva la transición monotónica. El estado `failed` es terminal; `read` prevalece sobre los eventos tardíos.
5. La UI muestra etiquetas legibles en español. La configuración de suscripción en Zernio no se modifica automáticamente.

## Riesgos y rollback

- No requiere migración: la referencia de mensaje de proveedor ya existe.
- Si Zernio no envía uno de los eventos suscritos, el mensaje queda en el último estado confirmado, sin suponer entrega o lectura.
- El rollback operativo es desactivar los eventos de ciclo de vida en Zernio; las filas locales ya procesadas permanecen como auditoría de estado.

## Pruebas

- Contrato de respuesta `data.messageId`, con y sin `sentAt`.
- Evento con cuenta equivocada, referencia desconocida, duplicado y fuera de orden.
- Las etiquetas de interfaz no alteran el estado persistido.
