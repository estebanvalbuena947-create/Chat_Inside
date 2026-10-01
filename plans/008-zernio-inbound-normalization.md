# Plan 008 — Normalización de mensajes entrantes de Zernio

- **Estado:** aprobado para implementación
- **Fecha:** 2026-08-13
- **Autorización:** el administrador autorizó convertir los eventos `message.received` ya ingresados en datos visibles de bandeja.

## Regla

Solo un evento `message.received` ya autenticado, persistido y perteneciente a una cuenta asociada puede crear o actualizar un contacto, una conversación y un mensaje del mismo tenant. El mismo mensaje de proveedor no puede aparecer dos veces y un fallo se hace visible en el inbox durable.

## Diseño

1. Las conversaciones y mensajes entrantes guardan la cuenta de canal y su referencia externa; los índices únicos incluyen el tenant y la cuenta.
2. `webhook_events` incorpora estado de reclamación. El worker reclama una fila pendiente antes de procesarla; un segundo worker no podrá reclamarla simultáneamente.
3. El worker procesa únicamente `message.received`. Valida el sobre conocido de Zernio, vuelve a comprobar el vínculo cuenta/tenant y usa los identificadores entregados por Zernio para contactos, conversaciones y mensajes.
4. Los eventos no soportados se marcan procesados sin inventar datos. Un sobre inválido o inconsistente se marca fallido con un código seguro, sin guardar contenido del mensaje en logs.
5. Los adjuntos, histórico previo, estados salientes, SSE, n8n y envío de mensajes no se implementan aquí.

## Riesgos y rollback

- Eventos simultáneos de una misma conversación están protegidos por restricciones únicas y deduplicación de mensaje; los eventos en curso requieren un reconciliador para recuperarse tras una caída, que se incorporará antes de producción.
- El rollback operativo es desactivar el webhook en Zernio y detener el worker. La migración solo expande el esquema y no borra datos.
- Un identificador ausente o no reconocido provoca fallo visible del evento; nunca se asigna al tenant por nombre o por el contenido recibido.

## Corrección posterior a la primera entrega

- La primera entrega real evidenció que el índice parcial de `contacts(tenant_id, external_reference)` no puede ser usado por `upsert` de Supabase sin un predicado de conflicto. Se reemplaza por una restricción única no parcial, compatible con referencias nulas y con los reintentos idempotentes.
- Antes de aplicar el cambio se comprobó que no hay contactos existentes, por lo que no puede haber conflicto de datos. El rollback de esquema consiste en recrear el índice parcial si fuera necesario; no se eliminan filas.
