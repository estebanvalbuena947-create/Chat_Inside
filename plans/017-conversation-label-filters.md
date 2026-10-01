# Plan 017 — Filtros de conversaciones por etiqueta

- **Estado:** implementado y validado localmente
- **Fecha:** 2026-08-14

## Clasificación y diseño

- Tipo: central; amplía un contrato de lectura y atraviesa API, BFF y presentación.
- Propietario: organización de atención define la etiqueta; el servicio de conversaciones ejecuta la lectura tenant-scoped después de comprobar membresía y existencia de la etiqueta.
- No cambia el esquema: la FK e índices existentes de `conversation_labels` cubren el vínculo. No hay integración externa.

## Cortes

1. Añadir `labelId` opcional y validar la etiqueta en API antes de consultar los vínculos `conversation_labels` del tenant y restringir la consulta de conversaciones a sus IDs.
2. Reenviar el parámetro mediante el BFF autenticado y añadir selector/limpieza del filtro en la bandeja.
3. Cubrir lectura filtrada, etiqueta horizontal y lectura sin filtro; actualizar decisión y validación.

## Riesgos y detención

- El join debe ser `inner` únicamente cuando exista `labelId`, para no esconder conversaciones sin etiquetas en la bandeja normal.
- No se continúa si se requiere acceso directo del navegador a Supabase, una migración o una política permisiva.
