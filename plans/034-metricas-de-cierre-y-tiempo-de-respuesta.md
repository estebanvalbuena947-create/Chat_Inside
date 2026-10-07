# Plan de ejecución: métricas de cierre y de tiempo de respuesta del asesor

## Contexto leído

- `AGENTS.md`
- `docs/ARCHITECTURE.md`, `docs/PROJECT_MAP.md`
- `apps/api/src/metrics/metrics.service.ts` (módulo que ya existe)
- `apps/api/src/conversations/tenant-conversation.service.ts` (camino que cambia el estado)
- `packages/contracts/src/index.ts` (`metricsSummarySchema`)
- `plans/014-conversation-status-management.md`

## Clasificación

- Tipo: **central**
- Motivo: toca datos (una columna nueva), un contrato público (el resumen de métricas) y la regla de
  negocio de cuándo una conversación cuenta como cerrada y por quién. Afecta a API y a la interfaz.

## Diseño propuesto

**Regla 1 — quién cerró.** Una conversación cerrada se atribuye **por participación, no por el botón**:
si ningún asesor escribió en ella, la llevó el bot de principio a fin (`byBot`); si un asesor
respondió alguna vez, la atendió una persona (`byAdvisor`). Se descartó guardar «quién pulsó cerrar»
porque eso mide quién ordena la lista, no quién atendió al cliente, y porque el bot todavía no cierra
conversaciones: ese dato nacería casi siempre vacío. La participación sí es un hecho ya registrado
(`messages.sender_type = 'agent'`).

**Regla 2 — tiempo de respuesta.** Es el tiempo desde el mensaje del cliente hasta la **primera**
respuesta de un asesor en esa conversación. Se mide la primera y no todas porque lo que se quiere
saber es cuánto esperó el cliente. Un periodo sin ninguna respuesta de asesor devuelve `null`, no `0`:
un cero mentiría.

**Umbrales (política del negocio):** verde por debajo de 5 minutos, ámbar entre 5 y 10, rojo por
encima de 10. Viajan en la respuesta para que la interfaz pinte los colores sin repetir la política.

- **Propietario de la regla:** `apps/api/src/metrics` (agregación pura y comprobable sin base de datos).
- **Módulos afectados:** `packages/contracts`, `apps/api/src/metrics`,
  `apps/api/src/conversations` (escribir `resolved_at`), `apps/web` (tarjetas y colores), y una
  migración.
- **Contratos que cambian:** `metricsSummarySchema` gana `closure` y `responseTime`. Aditivo.
- **Datos/migraciones:** `conversations.resolved_at timestamptz` (aditiva, con comentario y reversa).
  Se escribe en el mismo `update` que ya cambia el estado, y se limpia si la conversación se reabre.
- **Compatibilidad:** `closedConversations` se conserva como total del periodo, con el invariante
  `byBot + byAdvisor = closedConversations`, que se prueba.
- **Riesgos:** (1) contar como «bot» una conversación que un asesor atendió fuera de la plataforma
  —mitigado porque sólo cuenta lo que está registrado, y es la definición declarada—;
  (2) el tope de lectura de 20 000 filas ya existente, que marca el resultado como mínimo;
  (3) que el desglose por asesor necesite nombres y otra consulta: **queda fuera de este corte**.
- **Rollback:** la migración es aditiva (`drop column`); el contrato y la interfaz pueden volver al
  corte anterior sin tocar datos.

## Cortes de implementación

### Corte 1 — Dominio/modelo y contrato

- Archivos: `supabase/migrations/*_add_conversation_resolved_at.sql`,
  `packages/contracts/src/index.ts`.
- Resultado verificable: la columna existe y el contrato declara el desglose y los umbrales.
- Pruebas: las del contrato (validación de forma) y la escritura de `resolved_at` al cambiar el estado.

### Corte 2 — Aplicación y persistencia

- Archivos: `apps/api/src/metrics/metrics.service.ts`,
  `apps/api/src/conversations/tenant-conversation.service.ts`.
- Resultado verificable: el resumen trae el desglose y los tiempos, calculados con dos consultas más.
- Pruebas: funciones puras `summarizeClosure` y `summarizeResponseTimes` con casos límite (sin
  respuestas, respuesta antes que el cliente, empates de tiempo, umbrales exactos 5 y 10 minutos) y el
  invariante del total.

### Corte 3 — API/UI

- Archivos: `apps/web/app/page.tsx`, `apps/web/app/globals.css`.
- Resultado verificable: la tarjeta de cerradas se divide en bot/asesor y aparece el tiempo de
  respuesta con sus tres colores.
- Pruebas: las del cliente web que ya existan para el panel.

### Corte 4 — Documentación y revisión

- Documentos: `docs/DECISIONS.md` (las dos definiciones y por qué) y este plan.
- Controles: `corepack pnpm format:check`, `lint`, `typecheck`, `test`.

## Condición de detención

Detener y reportar antes de continuar si aparece una contradicción con la especificación, una migración
destructiva, una dependencia nueva, un riesgo de seguridad o un contrato externo no verificado.
