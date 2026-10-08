# Plan de ejecución: el bot sabe si puede escribir o si tiene que usar plantilla

## Contexto leído

- `AGENTS.md`, `docs/AI_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/QUALITY_GATES.md`
- `specs/025-ventana-de-whatsapp-para-el-bot.md`
- `docs/TOOLS_CONTRACT.md` (contrato vigente del bot)
- `apps/api/src/tools/tool-conversation.service.ts`, `tool-messages.service.ts`, `idempotency-key.ts`
- `specs/023-...` y `specs/024-...` (el despacho de plantillas y el aviso a n8n, ya hechos)
- Evidencia real: mensaje `automation` rechazado con `zernio_http_400` el 2026-10-07 19:28

## Clasificación

- Tipo: **central**
- Motivo: cambia el contrato del bot (mensajes y lectura de conversación), añade una regla de
  mensajería con umbral temporal y afecta a un efecto externo de pago.

## Diseño propuesto

- **Propietario de la regla:** dominio (`packages/domain`), junto a los demás umbrales de mensajería;
  la puerta del bot solo la aplica y la traduce a una respuesta operable.
- **Módulos afectados:** `packages/domain`, `apps/api/src/tools`, `docs/TOOLS_CONTRACT.md`.
- **Contratos que cambian:** `GET /v1/tools/conversations/:id` gana `whatsappWindow`;
  `POST /v1/tools/messages` acepta `whatsappTemplate`. Ambos aditivos.
- **Datos/migraciones:** ninguna.
- **Riesgos:**
  1. Rechazar un envío legítimo si nuestra base no tiene el entrante (p. ej. conversación iniciada por anuncio) → se mitiga no bloqueando cuando no hay ningún entrante registrado.
  2. Aplicar la regla a canales cuya ventana no está verificada → se limita a WhatsApp.
  3. Duplicar la regla en cada flujo → la calcula el servidor y se documenta una sola vez.
- **Rollback:** retirar la comprobación devuelve el comportamiento anterior; sin datos que revertir.

## Cortes de implementación

### Corte 1 — Dominio

- Archivos: `packages/domain/src/whatsapp-window.ts`, `packages/domain/src/index.ts`
- Resultado verificable: una sola fórmula para la ventana, con su umbral y sus límites.
- Pruebas: abierta, cerrada, límite exacto, sin entrante, instante inválido.

### Corte 2 — Lectura para el bot

- Archivos: `apps/api/src/tools/tool-conversation.service.ts`
- Resultado verificable: la conversación informa `whatsappWindow` calculada con el entrante más reciente (consulta propia, no la página de historial) y `null` cuando no aplica.
- Pruebas: WhatsApp con entrante reciente y antiguo, otro canal, sin entrante.

### Corte 3 — Envío para el bot

- Archivos: `apps/api/src/tools/tool-messages.service.ts`
- Resultado verificable: acepta `whatsappTemplate` y la encola por el camino compartido; rechaza el texto fuera de plazo y las combinaciones imposibles, sin encolar.
- Pruebas: plantilla encolada, texto fuera de plazo rechazado, texto + plantilla rechazado, plantilla + multimedia rechazada, dentro de plazo sin cambios.

### Corte 4 — Documentación y revisión

- Documentos: `docs/TOOLS_CONTRACT.md`, `docs/DECISIONS.md`, esta especificación.
- Controles: `corepack pnpm typecheck`, `lint`, `format:check`, `test`.

## Condición de detención

Detener y reportar si la ventana de WhatsApp no se puede determinar con datos propios, si el rechazo
rompe algún flujo en producción (los rechazos quedan en los registros de n8n), o si aparece un canal
donde la regla sea distinta y verificable.
