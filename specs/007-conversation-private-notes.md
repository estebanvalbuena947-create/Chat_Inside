# Especificacion: notas privadas por conversacion

- **Estado:** aprobada para implementacion
- **Responsable:** conversaciones
- **Fecha:** 2026-08-14
- **Cierre:** implementada con migracion `20260815004834_add_conversation_private_notes`.

## Resultado

Los miembros del mismo tenant pueden registrar y consultar notas internas en una conversacion. Las notas sirven para contexto operativo del equipo y nunca forman parte del historial del cliente, mensajes, webhooks, Zernio o n8n.

## Reglas

1. Una nota pertenece de forma obligatoria al tenant y a una conversacion de ese tenant.
2. Cualquier miembro autenticado del tenant puede listar y crear notas privadas de la conversacion.
3. Cada creacion recibe una clave de idempotencia. Repetir la misma solicitud devuelve la misma nota y no crea una segunda.
4. Las notas son acumulativas en este corte: no se editan ni eliminan, preservando el contexto y autoria interna.
5. El texto debe tener entre 1 y 2000 caracteres tras eliminar espacios extremos.
6. La UI se comunica por BFF con la API propia. No hay acceso desde el navegador a Supabase ni efectos hacia proveedores externos.

## Contrato

- `GET /v1/tenants/:tenantId/conversations/:conversationId/notes`
- `POST /v1/tenants/:tenantId/conversations/:conversationId/notes` con `{ body, idempotencyKey }`
- Sin sesion: `401`; sin membresia: `403`; tenant o conversacion inexistente: `404`; entrada invalida: `400`.

## Datos, seguridad y rollback

- `conversation_notes` mantiene FKs compuestas para impedir referencias cruzadas entre tenants, RLS activada y privilegios revocados para `anon`/`authenticated`.
- El rollback de aplicacion es ocultar la UI y dejar de crear nuevas notas; la migracion es aditiva y no destruye notas existentes.
