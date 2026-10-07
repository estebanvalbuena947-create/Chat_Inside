# Arquitectura

## Estilo

Monolito modular TypeScript en un monorepo `pnpm`, desplegado como tres procesos escalables por separado: `web`, `api` y `worker`. No se crearán microservicios sin evidencia de aislamiento, volumen o propiedad de equipos que lo justifique.

## Componentes

```text
Agente humano ── Next.js ── REST + SSE ── API NestJS/Fastify
                                              │
Zernio ── webhook firmado ── inbox durable ───┼── PostgreSQL (Supabase)
                                              │         │
n8n ── Agent Gateway ── worker Node.js ───────┤         └── Storage privado
                                              │
                                      Colas en PostgreSQL ── outbox / DLQ
                                              │
                                       Adaptador Zernio ── Zernio
```

## Capas y responsabilidades

### Presentación

`apps/web` renderiza bandeja, historial y compositor. Consume REST y SSE de la API propia; no contiene reglas de negocio ni llama a Zernio, Supabase privilegiado o n8n.

### Aplicación

Los casos de uso autorizan la intención, coordinan transacciones, publican eventos internos y establecen el límite de idempotencia. La API responde rápido al webhook después de persistir el inbox; el worker hace el trabajo costoso.

### Dominio

Entidades y políticas sin dependencias de framework: estados de conversación, estados monotónicos de mensaje, transición a humano, permisos y elegibilidad de medios.

### Infraestructura y adaptadores

PostgreSQL/Supabase, las colas en tablas propias, el almacen privado, SSE, Zernio y n8n implementan puertos internos. El adaptador de Zernio es el único que conoce sus endpoints, encabezados, límites y errores. **REQUIERE VERIFICACIÓN OFICIAL** cada detalle de su contrato y capacidades por canal.

## Datos y consistencia

- PostgreSQL es la fuente de verdad local para los datos operativos.
- Toda entidad operativa tiene `tenant_id`; los repositorios reciben contexto de tenant.
- `channel_accounts` resuelve una cuenta de proveedor a un único tenant antes de aceptar eventos externos.
- RLS complementa, no reemplaza, la autorización de aplicación.
- Comandos locales críticos usan transacciones fuertes; estados externos se modelan con consistencia eventual.
- `webhook_events` es el inbox durable deduplicado; `outbox_events` conecta cambios de datos con efectos externos.
- Las migraciones SQL versionadas serán la fuente de verdad y deberán ser compatibles hacia atrás.

## Invariantes

- Un webhook duplicado no crea más de un mensaje ni efecto.
- Un reintento de envío reutiliza exactamente la misma clave idempotente y cuerpo.
- El estado de un mensaje no retrocede: `read` prevalece sobre `delivered`, `sent` y `sending`.
- Un medio no aprobado no puede incorporarse a un mensaje saliente.
- Un handoff cambia la automatización a `paused`, excepto una política futura explícitamente aprobada.
- Un usuario no puede conocer ni operar recursos de otro tenant.

## Tiempo real

SSE es la opción inicial para UI: eventos por tenant autenticado, `Last-Event-ID`, reconexión y recarga REST cuando el cursor haya expirado. Supabase Realtime se comparará en un spike de seguridad, coste y escalabilidad antes de adoptarse. La Data API de Supabase no será un atajo para la UI: las tablas operativas no se expondrán al navegador.

## Despliegue y rollback

Habrá entornos separados `local`, `test`, `staging` y `production`; cada uno tendrá datos, colas, buckets y secretos propios. El despliegue usa migraciones expandir-antes-de-contraer, health checks, observabilidad, rollback documentado y reconciliación tras incidentes, y **ya está hecho** en el servidor propio: ver `docs/DEPLOY-SERVIDOR.md`.
