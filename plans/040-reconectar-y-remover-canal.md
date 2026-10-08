# Plan de ejecución: reconectar y remover canal

## Contexto leído

- `AGENTS.md`, `docs/AI_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/QUALITY_GATES.md`
- `specs/026-reconectar-y-remover-canal.md`
- `specs/011-automatic-zernio-channel-connection.md` (el flujo de conexión que se reutiliza)
- `apps/api/src/zernio/*`, `apps/api/src/conversations/tenant-message.service.ts`
- Contrato del proveedor: `DELETE /v1/accounts/{accountId}` (documentación oficial, _Disconnect account_)

## Clasificación

- Tipo: **central**
- Motivo: efecto externo nuevo (desconectar en el proveedor), permiso por rol, cambios de datos y de
  contrato, y una ruta nueva que afecta a canales y a mensajes.

## Diseño propuesto

- **Propietario de la regla:** `apps/api/src/zernio` (la cuenta de canal y su ciclo de vida).
- **Módulos afectados:** `packages/contracts`, `apps/api/src/zernio`, `apps/api/src/conversations` (solo la comprobación de encolado), `apps/web`.
- **Contratos que cambian:** gana `disconnectedAt` el canal; dos rutas nuevas. Aditivo.
- **Datos/migraciones:** `channel_accounts.disconnected_at` anulable.
- **Riesgos:**
  1. Marcar como retirado un canal cuyo `DELETE` falló → se marca **solo** si el proveedor aceptó o contestó `404`.
  2. Dejar la operación sin respuesta retirando el canal equivocado → requiere rol de administrador y confirmación explícita.
  3. Enviar a una cuenta ya desconectada → el encolado falla con motivo.
  4. Ocultar historia al retirar → **no** se oculta; queda escrito en la especificación.
- **Rollback:** no usar la columna devuelve el comportamiento anterior; los canales vuelven a listarse.

## Cortes de implementación

### Corte 1 — Persistencia y cliente

- Archivos: `supabase/migrations/..._add_channel_disconnected_at.sql`, `apps/api/src/zernio/zernio-api.client.ts`
- Resultado verificable: la columna existe y el cliente sabe desconectar (aceptando `404` como éxito).
- Pruebas: `404` como éxito; `500` como fallo reintentable.

### Corte 2 — Servicio y contrato

- Archivos: `apps/api/src/zernio/zernio-channel.service.ts`, `zernio-channels.controller.ts`, `packages/contracts/src/index.ts`
- Resultado verificable: retirar marca y excluye; reconectar reabre el flujo; el listado y el catálogo ignoran los retirados.
- Pruebas: idempotencia, rol, espacio ajeno, exclusión en listado y catálogo.

### Corte 3 — Encolado

- Archivos: `apps/api/src/conversations/tenant-message.service.ts`
- Resultado verificable: un envío a un canal retirado falla con motivo y no se encola.
- Pruebas: rechazo explícito y camino normal intacto.

### Corte 4 — Interfaz

- Archivos: `apps/web/app/page.tsx`, `apps/web/app/api/channels/**`
- Resultado verificable: botones **Reconectar** y **Remover** con confirmación, visibles para administradores.
- Pruebas: manuales.

### Corte 5 — Documentación y controles

- Documentos: `docs/DECISIONS.md`, `docs/OPERATIONS.md`, esta especificación.
- Controles: `corepack pnpm typecheck`, `lint`, `format:check`, `test`.

## Condición de detención

Detener y reportar si el proveedor no acepta desconectar una cuenta por API, si la desconexión arrastra
datos que no podemos conservar, o si el encolado no puede distinguir un canal retirado.
