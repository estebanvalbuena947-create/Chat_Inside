# Plan de ejecución: aviso de toque de plantilla a n8n

## Contexto leído

- `AGENTS.md`, `docs/AI_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/QUALITY_GATES.md`
- `specs/024-aviso-de-toque-de-plantilla-a-n8n.md`
- `specs/008-agent-gateway-foundation.md` y `plans/021-agent-gateway-foundation.md` (el gateway de n8n existe como puerto sin transporte)
- `apps/worker/src/zernio-inbox-worker.ts`, `zernio-inbound-normalizer.ts`, `zernio-outbound-worker.ts`, `abandoned-claims.ts`
- Evidencia real del toque: `webhook_events.payload` del `message.received` de las 18:57

## Clasificación

- Tipo: **central**
- Motivo: efecto externo nuevo (aviso a n8n), datos de cliente que salen del sistema, cola y reintentos, y configuración nueva en el trabajador y en el stack.

## Diseño propuesto

- **Propietario de la regla:** el **adaptador** (`zernio-inbound-normalizer`) decide qué es un toque, porque eso es forma del proveedor; el **dominio** valida qué puede salir (`packages/contracts`, contrato del aviso); el **trabajador** encola y despacha.
- **Módulos afectados:** `packages/contracts`, `packages/domain` (forma del uuid), `apps/worker`, `docker-stack.yml`.
- **Contratos que cambian:** ninguno existente. Se añade el contrato del aviso hacia n8n.
- **Datos/migraciones:** **ninguna**. La cola `outbox_events` ya tiene estado, intentos, `failure_code` y `unique (tenant_id, idempotency_key)`; se añade un `event_type` propio y el despacho de mensajes se filtra por el suyo.
- **Riesgos:**
  1. Que el filtro por `event_type` en el despacho de mensajes rompa el envío ya probado → prueba que lo cubre.
  2. Perder el aviso si el proceso cae entre guardar el mensaje y encolar → el reintento del proveedor entra por la rama de duplicado y encola igual (la clave determinista evita el doble aviso).
  3. Mandar PII a n8n → el contrato del aviso solo admite identificadores internos; se prueba.
  4. Reintentar un secreto equivocado → `4xx` no reintentable.
- **Rollback:** quitar `N8N_AGENT_WEBHOOK_URL` del stack; el evento se salta con registro visible y los encolados terminan `failed`.

## Cortes de implementación

### Corte 1 — Dominio y contrato

- Archivos: `packages/domain/src/identifiers.ts`, `packages/contracts/src/index.ts`, `apps/api/src/tools/idempotency-key.ts`
- Resultado verificable: una sola forma de derivar un uuid determinista (compartida) y un contrato del aviso que no admite PII.
- Pruebas: forma del uuid, contrato (campos permitidos y rechazados).

### Corte 2 — Detección del toque

- Archivos: `apps/worker/src/zernio-inbound-normalizer.ts`
- Resultado verificable: el mensaje normalizado expone el toque (`buttonPayload` + referencia del citado) o `null`.
- Pruebas: con/sin `buttonPayload`, con/sin citado, payload vacío, texto largo.

### Corte 3 — Encolado

- Archivos: `apps/worker/src/zernio-inbox-worker.ts`
- Resultado verificable: el toque cita una plantilla nuestra → un evento; citado ajeno o de texto → ninguno; reenvío → sigue habiendo uno.
- Pruebas: encolado, no-encolado, idempotencia ante duplicado, sin webhook configurado.

### Corte 4 — Despacho

- Archivos: `apps/worker/src/outbox-claim.ts`, `apps/worker/src/n8n-transport.ts`, `apps/worker/src/tap-notification-worker.ts`, `apps/worker/src/zernio-outbound-worker.ts`, `apps/worker/src/main.ts`
- Resultado verificable: el aviso sale con su contrato y sus cabeceras; `4xx` no se reintenta; `5xx`/timeout hasta 3 intentos; el despacho de mensajes ignora los avisos.
- Pruebas: forma del POST, clasificación de reintento, aislamiento entre las dos colas.

### Corte 5 — Configuración y documentación

- Archivos: `docker-stack.yml`, `.env.example`, `docs/DECISIONS.md`, `plans/035-...`, esta especificación.
- Controles: `corepack pnpm typecheck`, `lint`, `format:check`, `test`.

## Condición de detención

Detener y reportar si el toque no trae forma de identificar la plantilla citada, si n8n exige un
contrato distinto al pactado, o si el aviso necesita datos personales para ser útil.
