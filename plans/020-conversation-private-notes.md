# Plan 020 - Notas privadas por conversacion

- **Estado:** implementado
- **Fecha:** 2026-08-14
- **Cierre:** implementado; no se incluye edicion o eliminacion de notas en este corte.

1. Crear migracion aditiva con aislamiento tenant, idempotencia e indice de lectura.
2. Agregar contratos y servicio API de conversacion para listar y crear notas.
3. Exponer BFF y panel derecho con listado y compositor de notas.
4. Probar autorizacion, alcance tenant, repeticion idempotente, limite de texto y controles de calidad.

## Riesgos

- Las notas son datos internos potencialmente sensibles: no se incluyen en SSE, logs, Zernio, n8n ni mensajes.
- Este corte no incluye edicion ni eliminacion para conservar autoria y evitar conflictos de concurrencia prematuros.
