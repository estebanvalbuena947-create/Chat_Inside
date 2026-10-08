# Plan de ejecución: envío con plantilla aprobada de WhatsApp

## Contexto leído

- `AGENTS.md`, `docs/AI_CONTRACT.md`, `docs/PROJECT_MAP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/QUALITY_GATES.md`
- `specs/023-envio-con-plantilla-de-whatsapp.md`
- `plans/035-plantillas-aprobadas-de-whatsapp.md` (corte 1, ya hecho)
- Código: `packages/contracts/src/index.ts`, `packages/domain/src/messages.ts`,
  `apps/api/src/conversations/tenant-message.service.ts`, `apps/api/src/zernio/*`,
  `apps/worker/src/zernio-outbound-worker.ts`, `apps/web/app/page.tsx`
- Contrato de Zernio comprobado contra su documentación oficial (`send-inbox-message`), no contra el sitio comercial.

## Clasificación

- Tipo: **central**
- Motivo: cambia el contrato público de mensajes, el esquema de `messages`, el despacho externo del
  trabajador y la interfaz de la bandeja. Toca más de un módulo y un efecto externo de pago.

## Diseño propuesto

- **Propietario de la regla:** dominio de mensajes (`packages/domain/src/messages.ts`) para «qué se
  puede enviar» (referencia completa, coherencia de la copia visible); el **catálogo** de plantillas
  sigue siendo de `apps/api/src/zernio`, que es quien conoce al proveedor. La interfaz solo presenta.
- **Módulos afectados:** `packages/contracts`, `packages/domain`, `apps/api/src/zernio`,
  `apps/api/src/conversations`, `apps/worker`, `apps/web`.
- **Contratos que cambian:** `createOutboundMessageSchema` (unión discriminada),
  `conversationMessageSchema` (`whatsappTemplate`), `whatsappTemplateSchema` (`channelAccountIds`,
  `variables`), `conversationSummarySchema` (`channelAccountId`).
- **Datos/migraciones:** `messages.whatsapp_template_name`, `messages.whatsapp_template_language`
  (nulos) más restricción de coherencia. Aditiva; sin reescritura de filas.
- **Riesgos:**
  1. Gastar una plantilla de otra cuenta del espacio → se corta con la comprobación de catálogo.
  2. Creer que el texto guardado es lo que se envió → la carga es la referencia; la copia es solo visible.
  3. Reintentar un fallo que no puede funcionar (plantilla retirada, cuenta sin WABA) → clasificación explícita.
  4. Cambio de contrato rompiendo a quien ya envía texto → `kind` opcional con valor por defecto.
  5. Respuestas de botón no mapeadas: se documenta como no objetivo, no se promete.
- **Rollback:** dejar de ofrecer el botón y volver a encolar solo texto; las columnas quedan nulas y sin uso.

## Cortes de implementación

### Corte 1 — Contrato y dominio

- Archivos: `packages/contracts/src/index.ts`, `packages/domain/src/messages.ts`
- Resultado verificable: el contrato expresa «texto o plantilla, nunca ambos»; el dominio sabe leer
  los huecos de una definición de plantilla y decidir si es enviable, sin conocer al proveedor.
- Pruebas: unión (texto sin `kind`, plantilla, ambos campos juntos), huecos en cualquier componente.

### Corte 2 — Persistencia y catálogo

- Archivos: `supabase/migrations/20261009120000_add_whatsapp_template_reference.sql`,
  `apps/api/src/zernio/whatsapp-template-catalog.ts`, `apps/api/src/zernio/zernio-channel.service.ts`
- Resultado verificable: el catálogo devuelve, por plantilla, qué cuentas internas la tienen y qué
  huecos declara; el listado autenticado lo usa sin duplicar la lectura del proveedor.
- Pruebas: lectura tolerante, huecos detectados, cuentas agregadas, sin cuentas de WhatsApp.

### Corte 3 — Aplicación

- Archivos: `apps/api/src/conversations/tenant-message.service.ts`,
  `apps/api/src/conversations/tenant-conversation.service.ts`, `apps/api/src/app.module.ts`
- Resultado verificable: encolar una plantilla valida catálogo y pertenencia a la cuenta; la
  idempotencia compara la referencia; el resumen de conversación expone la cuenta interna.
- Pruebas: rechazo por ajeno/variables, inserción con copia visible y referencia, conflicto de clave.

### Corte 4 — Despacho

- Archivos: `apps/worker/src/zernio-outbound-worker.ts`
- Resultado verificable: el despacho manda `template` y no `message`; `400`/`502` no se reintentan.
- Pruebas: cuerpo del despacho, clasificación de reintento, texto intacto.

### Corte 5 — API y UI

- Archivos: `apps/web/app/page.tsx`
- Resultado verificable: el panel es clicable, filtra por la cuenta de la conversación, avisa de las
  que no se pueden enviar, pide confirmación y muestra la burbuja con su estado.
- Pruebas: manuales en la bandeja; sin pruebas unitarias de interfaz en este repositorio.

### Corte 6 — Documentación y revisión

- Documentos: `docs/DECISIONS.md`, `plans/035-plantillas-aprobadas-de-whatsapp.md`, esta especificación.
- Controles: `corepack pnpm typecheck`, `lint`, `format:check`, `test`.

## Condición de detención

Detener y reportar si el contrato del proveedor para `template` no coincide con lo documentado, si
aparece la necesidad de guardar estado propio de las plantillas, o si el envío exige credenciales de
Meta que hoy no tenemos.
