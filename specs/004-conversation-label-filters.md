# Especificación: filtros de bandeja por etiqueta interna

- **Estado:** implementada y validada localmente
- **Responsable:** organización de atención
- **Fecha:** 2026-08-14

## Problema

La biblioteca de etiquetas permite clasificar chats, pero el equipo no puede localizar de forma rápida todas las conversaciones que comparten una etiqueta.

## Resultado esperado

Una persona con membresía puede elegir una etiqueta del tenant y ver únicamente conversaciones vinculadas a ella. El filtro se combina con los filtros ya existentes de estado y búsqueda, y se puede retirar para recuperar toda la bandeja.

## Reglas

1. La API valida que la etiqueta elegida pertenece al tenant antes de filtrar; una etiqueta ausente u horizontal responde `404`.
2. El filtro de etiqueta se aplica en la consulta de conversaciones de la API; la interfaz no lee tablas operativas ni infiere pertenencia.
3. Estado, texto de búsqueda y etiqueta se combinan como condiciones `AND` desde la perspectiva de la persona operadora.
4. Elegir o quitar un filtro es solo una lectura: no modifica etiquetas, conversaciones, mensajes, outbox ni Zernio.

## Contrato y seguridad

- `GET /v1/tenants/:tenantId/conversations?limit=…&labelId=…` acepta un UUID opcional.
- El BFF reenvía únicamente el parámetro validado por la API y conserva la sesión en servidor.
- No hay migración, nueva tabla, política ni permiso de Data API. Se mantiene RLS y los privilegios cerrados existentes.

## Errores, compatibilidad y rollback

- Parámetro inválido: `400`; sin sesión: `401`; sin membresía: `403`; etiqueta fuera de tenant o inexistente: `404`.
- Sin `labelId`, la respuesta es compatible con la bandeja actual.
- Rollback operativo: ocultar el selector y dejar de enviar el parámetro. No existen escrituras ni datos que revertir.

## Pruebas y aceptación

- Cubrir el filtro válido, ausencia de etiqueta, aislamiento de tenant y el comportamiento actual sin parámetro.
- Confirmar que búsqueda y estado se conservan en la UI junto con la etiqueta.
- Ejecutar pruebas, tipos, lint, formato, build de API y health local.
