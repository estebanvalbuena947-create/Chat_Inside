# Especificacion: activar o desactivar bot por conversacion

- **Estado:** aprobada para implementacion
- **Responsable:** conversaciones
- **Fecha:** 2026-08-14
- **Cierre:** implementada con migracion `20260814235912_add_conversation_automation_version`; pendiente solo la integracion futura del Agent Gateway.

## Problema y resultado

El bot debe poder atender automaticamente cada conversacion, pero una persona del equipo debe poder detenerlo de inmediato en un chat puntual y reactivarlo despues. La decision nunca debe afectar conversaciones de otro tenant.

Cada conversacion comienza con `automation_mode = auto`. Cualquier integrante autenticado del tenant puede cambiar entre `auto` (bot habilitado) y `paused` (bot deshabilitado) mediante un boton visible en el chat.

## Reglas

1. Solo una membresia del tenant puede consultar o cambiar el interruptor de una conversacion de ese tenant.
2. Cada comando incluye `automationVersion`. Una repeticion del mismo objetivo es exitosa sin segunda escritura; una version vencida con un objetivo distinto devuelve `409`.
3. El boton usa unicamente los estados `auto` y `paused`. El valor historico `suggest` se mantiene compatible y no habilita envios automaticos.
4. Este corte guarda y presenta la decision. No crea mensajes, outbox, llamadas a Zernio ni llamadas a n8n.
5. Antes de que un futuro Agent Gateway cree un envio, debera comprobar que el modo sigue en `auto`; debera comprobarlo nuevamente antes del efecto externo.

## Contrato y seguridad

- `PATCH /v1/tenants/:tenantId/conversations/:conversationId/automation` recibe `{ automationMode, automationVersion }`.
- Sin sesion: `401`; sin membresia: `403`; conversacion inexistente u horizontal: `404`; entrada invalida: `400`; conflicto concurrente: `409`.
- La web utiliza BFF autenticado. RLS continua activa y `anon`/`authenticated` no reciben acceso directo a tablas operativas.

## Migracion y rollback

La migracion aditiva agrega `automation_version` con valor inicial `1`. Rollback operativo: ocultar el boton; no borra estado ni modifica mensajes.
