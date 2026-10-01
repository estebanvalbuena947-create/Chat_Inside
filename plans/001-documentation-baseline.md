# Plan de ejecución: línea base documental de Chat Zernio

## Contexto leído

- `AGENTS.md`
- `docs/AI_CONTRACT.md`
- `docs/PROJECT_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/ZERNIO_CHAT_MASTER_SPEC.md`
- Material en `specs/`, `plans/`, `prompts/` y `.agents/`

## Clasificación

- **Tipo:** central.
- **Motivo:** define límites de dominio, seguridad, datos, integraciones y procesos asíncronos de la futura plataforma.

## Diseño documentado

- **Propietarios:** dominio para conversaciones/mensajes; aplicación para casos de uso y transacciones; adaptadores para Zernio/n8n; infraestructura para datos, colas y storage; UI para presentación.
- **Datos/migraciones:** modelo inicial pendiente de aprobación de la fase de implementación; todas las entidades operativas incluirán `tenant_id`.
- **Riesgos:** contratos de proveedor no confirmados, coste y límites de tiempo real, malware, eventos fuera de orden, duplicación y aislamiento horizontal.
- **Rollback:** esta fase solo modifica documentación; `git revert` revierte la línea base sin afectar datos ni infraestructura.

## Cortes siguientes, no autorizados aún

### Corte 1 — Validación contractual

- Verificar Zernio y n8n en desarrollo/staging con contratos reales anonimizados.
- Confirmar Supabase, Redis, canales, límites y SLO.

### Corte 2 — Fundaciones

- Crear monorepo, configuración tipada, identidad, tenant, observabilidad y CI.

### Corte 3 — Inbox y salida

- Implementar inbox/outbox, worker, adaptador Zernio, mensajes y SSE.

### Corte 4 — UI, multimedia y Agent Gateway

- Implementar bandeja, compositor, archivos aprobados, etiquetas, respuestas rápidas y automatización.

## Condición de detención

Detener antes de implementar si no hay contrato oficial de Zernio/n8n, aprobación de entorno de desarrollo, decisión de secretos/proveedor, definición de límites de archivos o autorización humana para la siguiente fase.
