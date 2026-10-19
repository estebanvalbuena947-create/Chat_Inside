# Plan 050 — Reducir carga de CPU y acelerar la bandeja

- **Estado:** implementado y validado localmente; migración aplicada; despliegue manual pendiente
- **Fecha:** 2026-10-18
- **Revisión de evidencia:** 2026-10-19, recomendaciones del asesor contrastadas.
- **Dirección solicitada:** 2026-10-19, avisos al guardar cambios y retirada del
  sondeo continuo. Sustituye la propuesta anterior de sondeo compartido cada 2 s.
- **Clasificación:** central; afecta persistencia, API, BFF y presentación.

## Contexto leído

`AGENTS.md`, `docs/AI_CONTRACT.md`, `docs/PROJECT_MAP.md`,
`docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/QUALITY_GATES.md`,
`specs/001-zernio-chat-platform.md`,
`specs/040-rendimiento-bandeja-y-tiempo-real.md`,
`plans/013-realtime-sse.md` y las implementaciones de cursor, SSE,
bandeja, autenticación y contexto de tenant.

## Diseño y cortes

### 1. Validar un origen de eventos confirmado

- Inventariar las escrituras que afectan bandeja e historial: mensajes recibidos y
  enviados, estados, asignación, automatización y las otras invalidaciones que hoy
  cubre el cliente. Cubrir API, worker y escritores externos antes de retirar sondeo.
- Comparar mediante spike el transporte de eventos con los requisitos existentes
  de seguridad, coste y escalabilidad. Candidato preferido: trigger con Broadcast
  privado y payload mínimo hacia una suscripción de servidor en la API; mantener
  SSE/BFF para el navegador. No emitir filas completas ni dar acceso directo a tablas.
- Verificar notificación tras confirmación, rollback, ráfagas, entrega a varias
  réplicas, cuotas, fallo del servicio y coste añadido a las escrituras. No asumir
  garantía de entrega de Broadcast: resincronizar el estado persistido al reconectar.
- Documentación oficial consultada:
  `https://supabase.com/docs/guides/realtime/broadcast` y
  `https://supabase.com/docs/guides/realtime/subscribing-to-database-changes`.

### 2. Reducir consultas e implantar avisos por evento

- Revisar si siguen siendo útiles, tras eliminar sondeo, los índices de
  `webhook_events(tenant_id, received_at DESC)` y
  `messages(tenant_id, created_at DESC)`. Solo crear los que aporten beneficio
  medido, mediante migración versionada creada con CLI. Verificar aplicación
  concurrente, validez y compatibilidad con el ejecutor antes de tocar producción.
- Aplicar los índices de uno en uno y comparar cada plan antes/después con
  solicitudes representativas, sin sumar varios cambios a la misma medición.
- Revisar estadísticas, umbrales y actividad de autovacuum. Actualizar estadísticas
  tras el cambio; evaluar vacuum normal según evidencia y carga. La cifra de 346
  filas de `pg_stat_user_tables` no representa las 11.225 filas reales verificadas
  el 19 de octubre. No usar ese cociente para justificar mantenimiento bloqueante.
- Introducir un coordinador de invalidaciones en `apps/api/src/realtime` que
  agrupe eventos por tenant y recurso, con recursos acotados y limpieza de clientes.
  Retirar el ciclo de cuatro consultas cada dos segundos tras validar su reemplazo.
- Mantener la autorización por sesión y tenant en cada conexión. Establecer orden
  de suscripción/lectura inicial que no pierda una escritura entre ambas fases.
- Cubrir cierre de respuesta, abortos, fallos de lectura y clientes lentos con
  recursos acotados; cancelar el upstream desde `apps/web/app/api/events/route.ts`.
- Conservar forma de eventos y autorización vigente. Definir cursor y compatibilidad
  de reconexión al nuevo origen. No cachear permisos ni adoptar SECURITY DEFINER
  automáticamente por copiar un ejemplo de la documentación.
- Pruebas: 1/10 clientes inactivos sin consultas de sondeo, dos tenants,
  escrituras concurrentes, rollback, error/recuperación, ráfagas, limpieza y ningún
  acceso previo a autorización. Validar el cierre de cada fuente de escritura.

### 3. Reducir trabajo de apertura y recargas del navegador

- Medir primero la apertura autenticada y el número de peticiones iniciales.
- Extraer coordinación de refrescos de lista/historial: agrupar señales durante
  una lectura, cancelar peticiones obsoletas y mantener aislamiento de filtros y
  conversación. Evitar renders que disparen nuevas peticiones solapadas.
- Retirar los temporizadores periódicos de recarga de bandeja/historial en modo
  conectado. Resincronizar al cargar, reconectar y volver de una pestaña oculta;
  conservar pulso de presencia y controles de sesión. Los keepalives de SSE no
  acceden a la base. Mostrar la pérdida de conexión y reintentar con espera
  controlada; no declarar el chat actualizado si falla el transporte.
- Cargar reservas/reseñas mediante importación diferida y respuestas rápidas al
  primer uso, preservando carga, errores, accesibilidad e invalidación tras edición.
- No diferir integrantes/etiquetas que ya necesita la conversación sin comprobar
  antes sus consumidores. No modificar autenticación para ahorrar llamadas.
- Pruebas de eventos agrupados, peticiones lentas, cambios rápidos, abortos,
  visibilidad, degradación SSE y apertura inicial de los paneles.

### Seguimiento SQL — decisiones condicionadas a medición

- Revisar la doble relación `latest/inbound` del listado. Antes de optimizar,
  demostrar los casos de mensajes entrantes y salientes con lectura intermedia:
  son conceptos distintos en la especificación 013 y el filtro entrante falta en
  la implementación actual. Proponer un corte de corrección explícito; no ocultar
  un cambio de no leídos dentro de una sustitución por RPC/vista.
- El historial actual está limitado a 100 mensajes y no usa OFFSET. Proponer
  aparte el desempate por `id` y cursor `(created_at,id)` con compatibilidad del
  contrato `nextCursor`, pruebas con fechas iguales y llegadas concurrentes.
- Medir la reparación de multimedia antes de añadir un índice de expresión para
  la ruta fija `payload->'message'->>'id'`. No aplicar índices con `fixed_key`.
- Priorizar las nueve FK y cuatro políticas RLS del asesor según consultas
  ejecutadas y planes. Cambios RLS requieren demostrar mismos permisos por rol y
  tenant. No desactivar RLS, ampliar grants ni introducir SECURITY DEFINER.
- Estos seguimientos no forman parte de una autorización implícita del primer
  corte: presentar diseño y compatibilidad antes de ampliar el comportamiento.

## Medición, despliegue y rollback

Registrar diferencias de `pg_stat_statements` en ventanas comparables sin
reiniciar estadísticas globales, planes `EXPLAIN (ANALYZE, BUFFERS)`, lecturas por
tenant y tiempos de apertura. El tiempo SQL acumulado no se presenta como CPU.

En cada corte ejecutar `corepack pnpm typecheck`, `corepack pnpm lint`,
`corepack pnpm format:check` y `corepack pnpm test`. Antes de despliegue ejecutar
`corepack pnpm build` y revisión del diff. Desplegar con el procedimiento Swarm
existente, comprobando primero los cambios ajenos y migraciones pendientes.
Actualizar arquitectura, decisión, plan SSE y registro de validación al implementar.

Rollback: volver a la imagen anterior de API/web; los índices aditivos son
compatibles y pueden permanecer. Retirar triggers/canales por migración compatible
si procede. No hay cambios destructivos de datos. Validar específicamente el cursor
SSE y la resincronización al alternar entre versiones.

## Riesgos y condición de detención

No atribuir todo el incidente previo a estas consultas: las mediciones confirman
trabajo evitable, pero no identifican por sí solas todo el consumo del host.
Detener ante mezcla con cambios ajenos, incompatibilidad del ejecutor de
migraciones concurrentes, cambios de permisos, pérdida de aislamiento o imposibilidad
de verificar la carga autenticada. Presentar el resultado y el bloqueo concreto.

## Autorización

El usuario aprobó implementar con «hazlo» el 2026-10-19 y eligió ejecutar el
despliegue al terminar. La implementación mantiene independientes los cambios
previos de adjuntos que ya estaban en el árbol de trabajo.
Después autorizó explícitamente guardar y publicar esta optimización en `main`.
La integración se prepara sobre `origin/main` en un checkout limpio; no incorpora
los cambios locales pendientes de tamaño de adjuntos.

## Resultado del corte — 2026-10-19

- Migración remota `20261019145219_inbox_change_broadcast` aplicada y comprobada:
  siete triggers y función invoker. Archivo local alineado con la versión que
  registró el servidor (se creó primero con CLI y se conservó su contenido).
- API: una suscripción privada por tenant/proceso, señales agrupadas y ninguna
  consulta de tablas en inactividad. SSE con resync inicial, keepalive sin base,
  cierre por error, abortos y backpressure.
- Web: sin temporizadores de recarga, cancelación de lecturas anteriores,
  agrupación de eventos, resincronización al volver y estado de reconexión.
  Reservas/reseñas se importan bajo demanda y respuestas rápidas al abrirlas.
- No se añadieron los índices propuestos para sondeo: esas consultas se retiraron.
  Las optimizaciones SQL de seguimiento quedan separadas, sin cambios funcionales
  a la atención/no leídos ni al historial de mensajes.
- Validación real: canal privado, rechazo anónimo, commit/rollback, función sobre
  tabla temporal y diez suscriptores reales contra la migración aplicada.
- Controles completos: tipos, lint, formato, pruebas y build correctos. El build
  avisa de la configuración previa sin plugin ESLint de Next; no impide compilar.
- Pendiente manual acordado: subir el paquete y ejecutar `deploy.sh`, validar dos
  cuentas/pestañas en producción y medir CPU/apertura. Ver `docs/DEPLOY-EVENTOS.md`.
