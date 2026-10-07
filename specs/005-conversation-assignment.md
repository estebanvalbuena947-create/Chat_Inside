# Especificación: asignación interna de conversaciones

- **Estado:** aprobada para implementación
- **Responsable:** organización de atención
- **Fecha:** 2026-08-14
- **Estado de cierre:** implementada y validada localmente

## Problema y resultado

El equipo necesita indicar de forma visible quién atiende una conversación, sin que dos decisiones concurrentes se sobrescriban, sin cruzar tenants y sin crear acciones en Zernio.

Un administrador o supervisor puede asignar una conversación a cualquier integrante de su tenant o dejarla sin asignar. Cualquier integrante del tenant puede ver la persona asignada.

## Reglas e invariantes

1. El objetivo de una asignación debe ser una membresía vigente del mismo tenant; la clave foránea compuesta mantiene esta regla también en la base de datos.
2. Solo `admin` y `supervisor` pueden cambiar la asignación. `agent` puede verla, pero no cambiarla.
3. Cada comando incluye `assignmentVersion`. Si el destino ya coincide, repetirlo es exitoso y no vuelve a escribir. Si otra persona cambió el destino, el comando obsoleto responde `409`.
4. La lista de integrantes contiene solo id, rol y correo de inicio de sesión del mismo tenant, se obtiene en API de servidor y nunca desde el navegador hacia Supabase.
5. Asignar no crea mensajes, outbox, eventos a Zernio ni modifica estado, etiquetas o automatización.

## Contratos y errores

- `GET /v1/tenants/:tenantId/members` lista los integrantes del tenant autenticado.
- `PATCH /v1/tenants/:tenantId/conversations/:conversationId/assignment` recibe `{ assignedUserId, assignmentVersion }` y devuelve el resumen actualizado.
- `401` para sesión inválida; `403` para falta de membresía/rol; `404` para conversación o integrante inexistente en el tenant; `409` para una versión obsoleta con un destino distinto; `400` para cuerpo inválido.

## Datos, seguridad y rollback

La migración aditiva agrega `assignment_version` a `conversations`; las filas existentes empiezan en `1`. No agrega políticas ni permisos de Data API: RLS sigue activo y `anon`/`authenticated` continúan sin acceso directo. El correo se usa solo como etiqueta de interfaz para integrantes ya autorizados del mismo tenant; no se registra en logs.

Rollback operativo: ocultar el selector y no enviar el comando. La columna y las asignaciones existentes se conservan, sin afectar el worker ni los mensajes.
