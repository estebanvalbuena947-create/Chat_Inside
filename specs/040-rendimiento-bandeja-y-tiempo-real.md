# Especificación 040 — Rendimiento de bandeja y tiempo real

- **Estado:** implementada y validada localmente; migración aplicada; publicación manual pendiente
- **Fecha:** 2026-10-18
- **Responsable:** aplicación, infraestructura y presentación

## Problema y evidencia

La detección de cambios debe reaccionar a escrituras confirmadas y no ejecutar
consultas periódicas cuando no cambia ningún dato. Actualmente cada stream SSE
consulta cuatro tablas cada dos segundos, incluso sin actividad. El 19 de octubre
el usuario solicitó reemplazar ese sondeo por avisos al producirse un cambio.

Diagnóstico de solo lectura en producción tras el reinicio de PostgreSQL:

- Inicio de instancia: 18:20:59 UTC. Muestra: 18:26:24 UTC.
- Las cuatro consultas del cursor acumulan 10.588 ejecuciones y 59.341,2 ms de
  64.846,4 ms totales registrados en `pg_stat_statements` (91,5 % del tiempo SQL).
  Es tiempo de ejecución acumulado, no porcentaje de CPU ni una medida de latencia web.
- `EXPLAIN (ANALYZE, BUFFERS)` del último webhook: escaneo de 10.879 filas,
  ordenación y 12,198 ms; del último mensaje: recorrido de 6.711 entradas del índice
  por conversación, ordenación y 3,888 ms. Son muestras puntuales con caché caliente.
- Faltan índices por `(tenant_id, received_at)` en webhooks y
  `(tenant_id, created_at)` en mensajes. Los índices existentes cubren otros accesos.
- La web tiene respaldo cada 30 segundos con SSE abierto y cada cuatro segundos
  durante degradación; los refrescos de lista e historial no cancelan la petición
  anterior. Reservas y reseñas se importan estáticamente en la pantalla del chat.
- La velocidad de apertura completa todavía no está medida en navegador.

### Contraste del asesor — 2026-10-19

La captura aportada cubre del 12 al 19 de octubre; su resumen de CPU no permite
atribuir por sí solo la carga instantánea actual ni demostrar una regresión tras
el cambio de instancia. La muestra del 91,5 % anterior pertenece al 18 de octubre.

Verificaciones de solo lectura a las 14:32 UTC del 19 de octubre:

- `webhook_events`: `n_live_tup=346`, `n_dead_tup=1080`, pero `count(*)=11225`
  y `pg_class.reltuples=10571`. Son estimaciones/contadores de estadísticas, no
  evidencia de que solo existan 346 webhooks ni de pérdida de datos.
- Autovacuum está activado, sin opciones específicas en esa tabla. Umbrales:
  50 filas + 20 % para vacuum y 50 + 10 % para analyze. Con la estimación del
  planificador, el umbral orientativo de vacuum es unas 2164 tuplas muertas:
  1080 no basta para concluir que el proceso esté averiado. Revisar también
  transacciones largas, progreso y registros antes de ajustar parámetros.
- No consta vacuum/analyze en los contadores actuales de esa tabla. Incluir
  comprobación de mantenimiento y `ANALYZE` después de cambios de índices/datos;
  valorar `VACUUM (ANALYZE)` normal fuera de hora punta si procede, nunca inferir
  necesidad de `VACUUM FULL` a partir de estos contadores.
- La lista lee `latest:messages` e `inbound:messages` por separado. La primera
  necesita el último mensaje de cualquier dirección; según la especificación 013,
  la segunda debe identificar el último entrante. El código actual no filtra
  `inbound.direction`: registrar esta discrepancia y cubrir entrante → lectura →
  saliente antes de consolidar consultas. Una optimización no debe usar el último
  mensaje saliente como prueba de un entrante no leído. Una RPC/vista solo se
  propone después de comparar planes y preservar ese contrato.
- El historial devuelve como máximo 100 mensajes recientes, ordenados solo por
  `created_at`, y `nextCursor: null`; no usa grandes OFFSET. Orden estable con
  desempate por `id` y futura continuación por `(created_at,id)` son un cambio de
  contrato/funcionalidad, no una corrección de un OFFSET existente. La lista de
  conversaciones ya tiene paginación por conjunto de claves.
- La búsqueda JSON localizada usa una ruta fija:
  `payload->'message'->>'id'`, en la reparación de multimedia del worker
  (ciclo cada cinco minutos). Si sus mediciones justifican un índice, corresponde
  a `(tenant_id, (payload->'message'->>'id'))`, sin claves de ejemplo ni un GIN
  genérico añadido por defecto.
- Asesor actual: nueve claves foráneas sin índice y cuatro políticas con aviso
  `auth_rls_initplan`. Revisarlas por acceso real y con pruebas de aislamiento;
  no crear los nueve índices a ciegas. La API usa cliente privilegiado de servidor,
  por lo que esos avisos RLS no prueban el origen del coste de sus lecturas.

Estos puntos amplían la evidencia y el seguimiento propuesto; no autorizan
cambios de políticas, contratos ni mantenimiento de producción.

## Resultado e invariantes

1. En funcionamiento normal, la detección de cambios no realiza sondeo periódico,
   con uno o varios suscriptores. Un evento confirmado provoca una invalidación
   para el tenant afectado; las ráfagas se agrupan antes de refrescar recursos.
2. Cada suscripción se autoriza antes de recibir cualquier cursor. El estado
   compartido se indexa por tenant, nunca comparte identidad ni permisos.
3. Se conservan los eventos SSE opacos, la reconexión y la recuperación REST. El
   origen de invalidaciones será el guardado confirmado, cubriendo API, worker y
   demás escritores inventariados. Es una señal de cambio, no una notificación
   del momento en que un contacto empieza a teclear en su teléfono.
4. Una lectura lenta no se solapa con otra del mismo recurso. Los errores se
   registran con contexto seguro y no producen cursores falsos de éxito.
5. Cerrar el stream libera el suscriptor; cerrar el último detiene y elimina el
   ciclo. La cancelación del navegador alcanza la conexión saliente del BFF.
6. Lista e historial agrupan refrescos concurrentes y descartan respuestas de
   conversaciones o filtros anteriores. Al retomar visibilidad o recuperar la
   conexión se resincronizan. Se eliminan los refrescos de respaldo periódicos
   en modo conectado; un keepalive de transporte no consulta tablas.
7. Pantallas secundarias se descargan al abrirlas con estado de carga accesible;
   los datos imprescindibles de la conversación siguen disponibles al iniciar.

## Alcance y propietarios

- Persistencia: evaluar notificaciones transaccionales con datos mínimos y los
  índices útiles para lecturas reales tras retirar las consultas de sondeo.
- Aplicación API: recepción y agrupación de invalidaciones, aislamiento por tenant
  y limpieza SSE. Una suscripción de servidor compartida, no una por pestaña.
- BFF: propagación de cancelación, sin caché de sesiones ni permisos.
- Presentación: coordinación de lecturas, visibilidad y carga diferida de reservas,
  reseñas y respuestas rápidas. No traslada reglas de dominio al navegador.
- Candidato de transporte interno: Supabase Broadcast privado desde la base hasta
  la API; conservar SSE entre API/BFF y navegador. La adopción queda sujeta al
  spike de seguridad, costes y escalabilidad exigido por la arquitectura. No
  conectar el navegador a tablas operativas ni transmitir filas completas.
- Fuera de este corte: cambiar autenticación o ampliar el alcance funcional de
  conversaciones. No incorporar dependencias antes de justificar su necesidad.

## Errores y casos límite

Probar tenants distintos, suscripción no autorizada, conexiones simultáneas,
escritura durante la lectura inicial, desconexión durante una lectura, último
suscriptor, rollback de escritura, escrituras externas a la API, fallo de
transporte seguido de recuperación, cliente lento, ráfagas y reconexión con cursor.
En web: cambio rápido de conversación/filtro, pestaña oculta, retorno visible,
SSE degradado y panel secundario que falla al cargar.

## Compatibilidad, riesgos y rollback

El contrato REST y la forma de las señales SSE se conservan; el cursor necesita
una decisión explícita de compatibilidad y recuperación al cambiar de origen.
Los índices consumen
espacio y añaden coste a escrituras; validar su beneficio con planes reales.
Crear de forma concurrente si el procedimiento de migración lo permite, fuera de
transacción, con comprobación de índices válidos y sin bloquear escrituras.
Coordinar con cualquier migración pendiente antes de desplegar.

La alternativa elegida debe entregar eventos a todas las réplicas de API y cubrir
escrituras de todos los procesos. Medir el coste de triggers y Broadcast, cuotas,
fallos durante la escritura y comportamiento cuando no hay clientes. Una señal
perdida se recupera leyendo el estado confirmado al reconectar; no se promete
entrega exactamente una vez ni reproducción completa del historial de eventos.
La memoria queda acotada. El rollback restaura la imagen anterior; retirar los
triggers/canal mediante migración compatible si procede. Los índices aditivos
pueden permanecer. No eliminar el camino anterior antes de validar la recuperación.

## Verificación y aceptación

- Pruebas de comportamiento para autorización, aislamiento, concurrencia y limpieza.
- Con 1/10 suscriptores, un periodo sin cambios produce cero consultas periódicas
  de detección de cambios; el pulso de presencia y las comprobaciones de seguridad
  se miden por separado. Cada tenant recibe solo sus invalidaciones.
- Inserción, actualización y cambios relevantes se reflejan tras confirmar la
  escritura, sin depender de un temporizador. Un rollback no avisa de éxito.
- Las consultas que permanezcan usan accesos medidos adecuados. Crear índices
  solo si benefician el nuevo patrón, comparando planes antes y después.
- Sin solapamiento de recargas; resincronización inicial y tras reconexión sin
  perder cambios concurrentes ni mostrar un estado falsamente actualizado.
- Medir peticiones y apertura de bandeja/historial en navegador antes y después,
  con igual cuenta, red y datos. No prometer un porcentaje de mejora sin evidencia.
- Pasan tipos, lint, formato y pruebas; build antes de despliegue.
- Documentar resultados, decisiones y límites de la validación real.
