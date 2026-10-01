# Especificacion: vista de conversaciones asignadas a mi

- **Estado:** aprobada para implementacion
- **Responsable:** conversaciones
- **Fecha:** 2026-08-14
- **Cierre:** implementada como filtro de lectura compatible y resuelto por identidad de sesion.

## Resultado

Todo integrante autenticado del tenant conserva acceso a la vista `Todas`. La vista `Asignadas a mi` muestra exclusivamente las conversaciones cuyo `assigned_user_id` coincide con la identidad autenticada que hace la solicitud.

## Reglas

1. La API, y no el navegador, resuelve la identidad de `Asignadas a mi` desde el token de sesion.
2. El alcance `all` conserva el listado completo del tenant para cualquier miembro autenticado.
3. El alcance `assigned_to_me` combina el filtro de responsable con filtros de etiqueta existentes sin filtrar por nombres, correos o IDs provenientes de la UI.
4. Una conversacion sin responsable no aparece en `Asignadas a mi`.
5. No se modifica asignacion, estado, bot, mensajes ni datos de Supabase; es una consulta de lectura.

## Contrato y rollback

- `GET /v1/tenants/:tenantId/conversations?assignmentScope=all|assigned_to_me`.
- El valor por defecto es `all` por compatibilidad.
- Rollback: ocultar la pestana; la API mantiene el comportamiento previo al omitir el parametro.
