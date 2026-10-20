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
- Solo `auto` permite nuevos envios del bot. El encolado compartido lo exige y el trabajador relee
  el modo por tenant antes de Zernio, tras preparar los adjuntos; un bloqueo queda fallido sin
  reintento. El notificador de mensajes entrantes omite los avisos a n8n con el mismo criterio.
  No afecta envios humanos ni cancela HTTP ya iniciado (ADR-068).
- Un usuario no puede conocer ni operar recursos de otro tenant.

## Tiempo real

La UI recibe SSE por tenant autenticado a través del BFF. La API mantiene una
suscripción privada de Supabase Broadcast por tenant y proceso; los cambios
confirmados de mensajes, conversaciones, adjuntos, lecturas, contactos, cuentas
y etiquetas publican invalidaciones mínimas mediante triggers `SECURITY INVOKER`.
No hay sondeo periódico de tablas para producir el cursor. Cada conexión nueva
recibe `inbox.resync`, incluso si presenta `Last-Event-ID` de otra versión: el
cursor es una señal opaca, no un registro de eventos reproducible. Los fallos de
Broadcast cierran el stream y la web muestra reconexión. Los keepalives solo
mantienen el transporte; el pulso de presencia conserva su función independiente.

El spike validó canal privado de servidor, rechazo de una suscripción anónima,
entrega tras commit y ausencia de entrega tras rollback. Una prueba de la función
de trigger con tabla temporal validó inserciones, actualizaciones y borrados bajo
`service_role`, sin cambios persistentes a recursos operativos. No añade
dependencias ni políticas de acceso para usuarios. Broadcast es best effort: se
resincroniza por REST al conectar, reconectar o retomar una pestaña; no se garantiza
replay ni detección de una invalidación perdida sin desconexión. El fallo interno
de `realtime.send` deja un aviso en PostgreSQL, según su implementación instalada.
Medir cuotas y latencia real después del despliegue (ADR-067, plan 050).
La Data API y las tablas operativas no se exponen al navegador.

## Despliegue y rollback

Habrá entornos separados `local`, `test`, `staging` y `production`; cada uno tendrá datos, colas, buckets y secretos propios. El despliegue usa migraciones expandir-antes-de-contraer, health checks, observabilidad, rollback documentado y reconciliación tras incidentes, y **ya está hecho** en el servidor propio: ver `docs/DEPLOY-SERVIDOR.md`.
