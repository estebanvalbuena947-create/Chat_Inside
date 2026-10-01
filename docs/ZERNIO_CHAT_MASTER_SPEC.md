# Especificación maestra — Chat Zernio

**Versión:** 2.0
**Estado:** diseño aprobado; implementación pendiente
**Fecha:** 2026-08-13

## 1. Objetivo y límites

Construir una aplicación web segura, escalable y multiusuario para atender conversaciones provenientes de canales conectados a Zernio. Los agentes humanos pueden responder, organizar y asignar conversaciones; un agente existente en n8n puede responder automáticamente, proponer borradores o transferir a un humano mediante un gateway restringido.

Fuera de alcance: reservas, citas, calendarios, disponibilidad, horarios, pagos, pedidos, catálogos comerciales, servicios, tratamientos, profesionales y cualquier lógica operativa de spa. Una marca de spa puede existir como nombre o apariencia de tenant, nunca como dominio funcional.

## 2. Capacidades

- Bandeja virtualizada con cursor, búsqueda, filtros, estado, canal, asignación, etiquetas, no leídos y modo de agente.
- Historial progresivo de mensajes entrantes y salientes de humanos, n8n y sistema; texto, imágenes, videos, estado de entrega y error.
- Compositor con texto, adjuntos, vista previa, progreso, cancelación, reintento seguro y respuestas rápidas internas mediante atajos.
- Etiquetas y respuestas rápidas locales por tenant; no se sincronizan ni reemplazan conceptos de plataformas externas.
- Roles de administrador, supervisor y agente con autorización por recurso.
- Actualización en tiempo real para cambios de conversación, mensaje, etiqueta, asignación, transferencia, fallos y modo de agente.

## 3. Estados e invariantes

Conversación: `open`, `pending`, `resolved`. Un mensaje entrante debe reabrir una conversación resuelta.

Mensaje saliente: `draft`, `queued`, `sending`, `sent`, `delivered`, `read`, `failed`. Los eventos duplicados o fuera de orden no pueden degradar el máximo estado confirmado. Las capacidades concretas de estado dependen del canal y quedan **REQUIERE VERIFICACIÓN OFICIAL**.

Automatización: `auto`, `suggest`, `paused`. En `auto` la respuesta validada puede crear un envío; en `suggest` genera un borrador; en `paused` no se invoca n8n. Una transferencia a humano cambia a `paused` por defecto.

## 4. Integraciones

### Zernio

Zernio conecta los canales y transporta mensajes. La aplicación recibe webhooks, verifica autenticidad, persiste y deduplica eventos, gestiona estados, archivos, envíos idempotentes, reconciliación y auditoría. La UI y n8n nunca reciben su API key ni le llaman directamente. Endpoints, payloads, encabezados, firmas, límites y capacidades deben obtenerse de documentación oficial y pruebas de staging; hasta entonces son **REQUIERE VERIFICACIÓN OFICIAL**.

Validación documental del 2026-08-13: Zernio documenta HMAC-SHA256 del cuerpo crudo en `X-Zernio-Signature`; reconoce un webhook con respuesta `2xx` en menos de cinco segundos, entrega al menos una vez y expone un ID de evento estable para deduplicar. El envío soporta `Idempotency-Key`: misma clave y cuerpo devuelve la respuesta original, cuerpo diferente devuelve `422`, una operación en curso devuelve `409` y la retención de clave es de 24 horas. El HTTP de envío confirma aceptación, no entrega. Las capacidades finales se validarán por canal en staging.

### Supabase

Se evaluará para PostgreSQL, Auth, RLS, Storage privado, URLs firmadas y migraciones. Cada entidad operativa tendrá `tenant_id`; RLS será defensa adicional; `service_role` se restringe a backend/workers. No se usarán datos reales ni se conectará producción durante el inicio.

### n8n

El workflow existente no se modifica ni se reconstruye. El Agent Gateway envía contexto mínimo con `correlationId`, `tenantId`, `conversationId` y `messageId`; aplica autenticación de servicio, validación JSON, timeout, reintentos limitados, circuit breaker y auditoría.

Salida preliminar de n8n:

```json
{
  "action": "reply",
  "reply": { "text": "Texto", "mediaAssetIds": [] },
  "labels": { "add": [], "remove": [] },
  "handoff": null,
  "confidence": 0.95,
  "reasonCode": "GENERAL_RESPONSE"
}
```

Este contrato es **REQUIERE VALIDACIÓN CON EL WORKFLOW REAL DE N8N**. El agente solo puede devolver identificadores internos de multimedia aprobada, no URLs arbitrarias.

## 5. Flujos confiables

### Entrada

`Zernio → webhook validado → inbox durable → worker → conversación/mensaje local → SSE → Agent Gateway opcional`.

El webhook confirma después de la persistencia durable y antes de cinco segundos; no realiza procesamiento pesado. Un reconciliador recupera eventos persistidos que no hayan sido encolados o completados.

### Salida humana o automatizada

`UI o Agent Gateway → API autorizada → mensaje local + outbox en una transacción → worker → adaptador Zernio → estados por webhook`.

La misma operación conserva una única clave idempotente y cuerpo. Los errores transitorios tienen reintentos limitados; los definitivos se hacen visibles y los agotados van a DLQ.

### Multimedia

`Navegador → autorización → URL firmada → Storage privado → validación + cuarentena + antivirus → aprobado → outbox → Zernio`.

Se valida tamaño, extensión, MIME declarado/real, firma binaria, hash, tenant, cargador y compatibilidad con canal. No se envía un activo pendiente, rechazado o de otro tenant. El worker usará la modalidad multipart confirmada por la documentación de Zernio para no hacer público un objeto de Storage.

## 6. Seguridad, observabilidad y calidad

La implementación debe cumplir [SECURITY.md](SECURITY.md), registrar trazas sin contenido sensible y medir recepción de webhooks, duplicados, fallos de envío, colas, agente, medios y SSE. Incluye rate limits, DLQ, reconciliación, backups/restauraciones y alertas.

Antes de producción: pruebas unitarias, integración con PostgreSQL/Redis, contratos de Zernio/n8n, pruebas de RLS e idempotencia, E2E, carga y validación real por canal. No se declarará compatibilidad de una capacidad de Zernio sin evidencia oficial y de staging.

## 7. Supabase MCP para desarrollo

El MCP oficial es una herramienta de Codex, no una dependencia de runtime. Está limitado al `project_ref` de desarrollo, sin tokens en Git. Las migraciones iniciales del esquema se aplicaron tras aprobación humana explícita; cambios de Auth/Storage, secretos, datos de clientes y cualquier producción siguen requiriendo autorización explícita. La UI no accede al MCP ni a claves privilegiadas.

## 8. Decisiones pendientes

- Proyecto Supabase de desarrollo y proveedor de despliegue.
- Redis administrado y estrategia de alta disponibilidad.
- Contrato y autenticación reales de n8n.
- Canales Zernio, volumen, cuotas y capacidades del piloto.
- Límites de archivos, retención, número de agentes/tenants y SLO de disponibilidad.
