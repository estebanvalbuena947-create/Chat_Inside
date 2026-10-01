# Especificación: respuestas rápidas por tenant

- **Estado:** implementada y validada localmente
- **Fecha:** 2026-08-14

## Problema

Los equipos de atención repiten textos frecuentes. Deben poder reutilizarlos sin exponerlos entre clientes, sin que una selección envíe un mensaje por sí misma y sin que un agente pueda alterar la biblioteca administrada por el tenant.

## Regla

Una respuesta rápida pertenece exactamente a un tenant y contiene un título y un cuerpo de texto. Cualquier integrante del tenant puede leerla y colocar su cuerpo en el borrador de una conversación; solo un administrador del mismo tenant puede crearla, editarla o eliminarla. Seleccionar una respuesta rápida nunca crea un mensaje, un evento outbox ni un efecto en Zernio.

## Datos

`canned_responses` conserva `tenant_id`, título, cuerpo, autor de creación, fechas, una clave de idempotencia de creación y una versión de edición. Las longitudes máximas son 80 caracteres para el título y 8.000 para el cuerpo. La tabla tendrá RLS habilitado y no tendrá acceso directo para roles de navegador.

## Contratos

- `GET /v1/tenants/:tenantId/canned-responses`: lista respuestas del tenant para una membresía válida.
- `POST /v1/tenants/:tenantId/canned-responses`: crea una respuesta; solo administrador; usa clave de idempotencia.
- `PATCH /v1/tenants/:tenantId/canned-responses/:responseId`: actualiza texto; solo administrador; exige versión actual.
- `DELETE /v1/tenants/:tenantId/canned-responses/:responseId`: elimina; solo administrador; exige versión actual.

La web solo habla con rutas BFF autenticadas y la API propia. La UI no consulta Supabase ni decide privilegios.

## Errores esperados

- Sin sesión: `401`.
- Sin membresía: `403`.
- Miembro no administrador que administra: `403`.
- Identificador o texto inválido: `400`.
- Recurso fuera del tenant o inexistente: `404`.
- Edición o eliminación con versión desactualizada: `409`, sin cambiar datos.

## Criterios de aceptación

- Las respuestas de Inside Spa no se pueden leer ni administrar desde otro tenant.
- Un agente puede seleccionar una respuesta y modificar el borrador antes de enviarlo.
- Un agente no puede crear, editar ni borrar respuestas.
- Un administrador puede crear, editar y borrar respuestas.
- Una repetición de creación con la misma clave no duplica el registro.
- Seleccionar, crear, editar o borrar una respuesta no contacta a Zernio.
