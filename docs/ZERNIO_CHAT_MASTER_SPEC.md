# Instrucción maestra para desarrollar una bandeja de chat segura, escalable e interconectada con Zernio

**Versión:** 1.0  
**Fecha de verificación técnica:** 12 de agosto de 2026  
**Uso previsto:** especificación de arquitectura, contrato de implementación y prompt principal para VS Code + Codex u otro agente de programación.  
**Caso inicial:** spa con un agente conversacional ya configurado, envío y recepción de texto, imágenes y video.  
**Diseño futuro:** reutilizable para varios clientes, marcas y proyectos.

---

## 0. Cómo utilizar este documento

1. Guarde este archivo como `docs/ZERNIO_CHAT_MASTER_SPEC.md` dentro del repositorio.
2. Guarde las reglas permanentes del agente en `AGENTS.md`.
3. Entregue a Codex primero este documento y pídale **diseño y plan**, no implementación inmediata.
4. Implemente por fases y no mezcle arquitectura, interfaz, migraciones y refactorizaciones no relacionadas en un solo cambio.
5. No considere el sistema terminado hasta ejecutar pruebas con una cuenta real de Zernio y los canales reales que utilizará el cliente.

> Ningún proveedor o equipo puede garantizar literalmente disponibilidad o funcionamiento absoluto del 100 %, porque intervienen Zernio, Meta/WhatsApp/Instagram, la red y la infraestructura contratada. En este documento “funcionando al 100 %” significa: todos los criterios de aceptación verificables pasan, no existen defectos críticos conocidos, los flujos reales fueron probados de extremo a extremo y el sistema tiene monitoreo, reintentos, recuperación y procedimientos operativos.

---

# PARTE I — PROMPT MAESTRO LISTO PARA CODEX

Copie desde aquí hasta el final de la sección y entréguelo al agente de programación.

```md
Actúa como arquitecto principal, ingeniero full-stack senior, especialista en seguridad de aplicaciones y responsable de calidad.

Debes diseñar e implementar una bandeja de atención omnicanal conectada a Zernio. El sistema será usado inicialmente por un spa, pero la arquitectura debe permitir reutilizarlo en otros proyectos y habilitar varios tenants en el futuro sin reescribir los módulos principales.

Ya existe un agente conversacional. No debes entrenarlo ni reemplazarlo. Debes integrarlo mediante un contrato interno seguro. El agente no puede acceder directamente a Zernio, a la base de datos, a secretos ni a herramientas sin autorización.

## Objetivo funcional

Construir una aplicación web que permita:

- recibir conversaciones y mensajes desde Zernio mediante webhooks;
- visualizar una bandeja de conversaciones en tiempo real;
- contestar mensajes de texto;
- recibir, almacenar, visualizar y enviar imágenes y videos;
- mostrar estados de envío, entrega, lectura y error cuando el canal los soporte;
- marcar conversaciones como leídas;
- usar etiquetas internas;
- usar respuestas guardadas internas relacionadas con etiquetas;
- asignar conversaciones a agentes humanos;
- activar, pausar o usar en modo sugerencia al agente conversacional;
- escalar una conversación del agente a una persona;
- archivar o reabrir conversaciones;
- mantener auditoría, trazabilidad y aislamiento por tenant;
- seguir funcionando correctamente ante webhooks duplicados, reintentos, timeouts, eventos fuera de orden y límites de la API.

## Decisiones técnicas obligatorias

1. Usar TypeScript de extremo a extremo.
2. Usar Node.js en su versión LTS activa compatible con todas las dependencias; el SDK oficial de Zernio requiere Node.js 18 o superior.
3. Usar un monorepo con pnpm workspaces.
4. Frontend: Next.js + React + TypeScript.
5. Backend: NestJS con adaptador Fastify, TypeScript y API REST versionada.
6. Procesos asíncronos: un worker Node.js separado con BullMQ y Redis.
7. Base de datos principal: PostgreSQL.
8. Acceso a datos: Drizzle ORM con migraciones SQL explícitas. Se permite SQL nativo para índices parciales, RLS y restricciones no cubiertas por el ORM.
9. Tiempo real desde servidor hacia UI: Server-Sent Events (SSE). Usar WebSocket únicamente si se implementa presencia, escritura en vivo o colaboración bidireccional que realmente lo justifique.
10. Archivos: almacenamiento privado compatible con S3, enlaces firmados de corta duración y análisis antivirus.
11. Autenticación: proveedor OIDC compatible, sesión de servidor en cookie HttpOnly, Secure y SameSite. No guardar tokens de sesión en localStorage.
12. Contratos y validaciones: Zod.
13. Pruebas: Vitest, Supertest, Testcontainers y Playwright.
14. Observabilidad: OpenTelemetry, logs JSON estructurados, métricas, trazas y alertas.
15. Empaquetado: Docker. La API y el worker deben poder escalar por separado.
16. Integración Zernio: SDK oficial `@zernio/node` cuando cubra la operación; cliente HTTP tipado para cualquier operación faltante. El adaptador Zernio debe ser la única capa que conozca rutas, encabezados y errores del proveedor.
17. Comenzar como monolito modular, no como microservicios. Conservar límites que permitan extraer workers o módulos solo cuando las métricas lo justifiquen.

## Prohibiciones

- No llamar Zernio desde el navegador.
- No exponer la API key de Zernio, el secreto del webhook ni el token del agente a la UI.
- No usar la API de Zernio como base de datos de lectura de la interfaz.
- No confiar en `tenantId`, `accountId`, `conversationId`, `userId` ni roles enviados por el navegador sin resolverlos y autorizarlos en el servidor.
- No guardar lógica de negocio en componentes React.
- No usar polling permanente contra Zernio.
- No procesar trabajo pesado dentro del webhook.
- No aceptar archivos basándose solamente en extensión o `Content-Type`.
- No mostrar HTML recibido como mensaje mediante `dangerouslySetInnerHTML`.
- No permitir que el agente genere URLs arbitrarias de archivos.
- No permitir que el agente ejecute SQL, llame Zernio o seleccione herramientas fuera de una lista autorizada.
- No reintentar indefinidamente.
- No crear mensajes duplicados ante reintentos.
- No ocultar errores de envío.
- No usar las etiquetas de conversación como estado fuente de una reserva, pago u otra entidad de negocio.
- No declarar el proyecto terminado sin pruebas reales de extremo a extremo.

## Flujo obligatorio de trabajo

Antes de escribir código:

1. Lee `AGENTS.md`, este documento, arquitectura, seguridad y especificaciones.
2. Clasifica el cambio como local o central.
3. Entrega un diseño con límites de módulos, flujo de datos, riesgos y decisiones.
4. Entrega un plan por cortes pequeños.
5. Identifica migraciones, compatibilidad y rollback.
6. Define pruebas unitarias, integración, contrato, seguridad, concurrencia y E2E.
7. Espera aprobación del plan cuando el flujo de trabajo humano lo requiera.

Durante la implementación:

1. Implementa primero contratos y dominio.
2. Después casos de uso.
3. Después persistencia, colas e integraciones.
4. Después API y tiempo real.
5. Después UI.
6. Después pruebas E2E, observabilidad y documentación.
7. Ejecuta formato, lint, tipos, pruebas y build en cada corte.

Al finalizar cada corte informa:

- regla implementada;
- archivos modificados y motivo;
- migraciones;
- pruebas ejecutadas;
- riesgos restantes;
- pasos manuales;
- evidencia de que no se duplican mensajes ni se cruza información entre tenants.
```

---

# PARTE II — ARQUITECTURA DE REFERENCIA

## 1. Principio central

La UI debe leer y escribir contra **la API propia**. La API propia mantiene una base local de conversaciones y mensajes. Zernio actúa como proveedor de transporte y sincronización con los canales externos.

```text
Agente humano                    Agente conversacional existente
      │                                      │
      ▼                                      ▼
┌───────────────┐                    ┌──────────────────┐
│ Next.js / UI  │                    │ Agent Gateway    │
└───────┬───────┘                    └────────┬─────────┘
        │ REST + SSE                           │ contrato seguro
        ▼                                      ▼
┌───────────────────────────────────────────────────────────┐
│                  API modular NestJS/Fastify               │
│ Auth · Tenants · Inbox · Messages · Media · Labels        │
│ Respuestas · Asignaciones · Auditoría · Integraciones     │
└───────────────┬─────────────────────┬─────────────────────┘
                │                     │
                ▼                     ▼
         PostgreSQL               Redis/BullMQ
                │                     │
                │                     ▼
                │               Worker asíncrono
                │                     │
                │                     ▼
                │              Adaptador Zernio
                │                     │
                ▼                     ▼
        Almacenamiento S3          API de Zernio
                                         │
                                         ▼
                         WhatsApp / Instagram / Facebook / otros
```

## 2. Responsabilidades

### Zernio

- conexión con los canales;
- recepción y envío externo de mensajes;
- identificadores externos de conversaciones y mensajes;
- estados de entrega y lectura disponibles por plataforma;
- plantillas e interactividad propias del canal;
- webhooks de eventos;
- backfill y consulta para reconciliación.

### Aplicación propia

- autenticación y autorización de agentes humanos;
- aislamiento entre clientes o tenants;
- bandeja de conversaciones;
- base local de mensajes;
- etiquetas;
- respuestas guardadas;
- asignaciones;
- modo del agente conversacional;
- almacenamiento seguro de archivos;
- auditoría;
- búsqueda;
- reglas de negocio del spa u otros proyectos;
- idempotencia interna;
- monitoreo, alertas y recuperación.

### Agente conversacional

- interpretar intención;
- redactar una respuesta o sugerencia;
- solicitar herramientas autorizadas;
- solicitar medios aprobados mediante identificadores internos;
- pedir escalamiento humano.

El agente **no** decide autorización, no maneja credenciales, no envía directamente a Zernio y no obtiene acceso general a datos.

---

# PARTE III — ESTRUCTURA DEL REPOSITORIO

```text
zernio-inbox/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── inbox/
│   │   │   ├── composer/
│   │   │   ├── media/
│   │   │   ├── labels/
│   │   │   └── admin/
│   │   ├── lib/
│   │   └── tests/
│   ├── api/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── tenants/
│   │       │   ├── users/
│   │       │   ├── channel-accounts/
│   │       │   ├── contacts/
│   │       │   ├── conversations/
│   │       │   ├── messages/
│   │       │   ├── labels/
│   │       │   ├── canned-responses/
│   │       │   ├── assignments/
│   │       │   ├── media/
│   │       │   ├── agent-gateway/
│   │       │   ├── realtime/
│   │       │   ├── audit/
│   │       │   └── zernio-webhook/
│   │       └── common/
│   └── worker/
│       └── src/
│           ├── jobs/
│           │   ├── process-zernio-event.job.ts
│           │   ├── send-zernio-message.job.ts
│           │   ├── copy-inbound-media.job.ts
│           │   ├── scan-upload.job.ts
│           │   ├── invoke-agent.job.ts
│           │   └── reconcile-inbox.job.ts
│           └── main.ts
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── db/
│   ├── zernio-adapter/
│   ├── agent-adapter/
│   ├── security/
│   ├── observability/
│   ├── ui/
│   ├── config/
│   └── testing/
├── docs/
│   ├── ZERNIO_CHAT_MASTER_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── DATA_MODEL.md
│   ├── API.md
│   ├── RUNBOOK.md
│   ├── THREAT_MODEL.md
│   └── DECISIONS.md
├── infra/
│   ├── docker/
│   ├── migrations/
│   ├── terraform/
│   └── monitoring/
└── tests/
    ├── contract/
    ├── integration/
    ├── e2e/
    ├── load/
    └── security/
```

## Regla de dependencias

```text
UI → contratos HTTP
API/controllers → casos de uso
Casos de uso → dominio + puertos
Adaptadores → puertos
Dominio → ninguna dependencia de framework o proveedor
```

El dominio nunca debe importar Next.js, NestJS, Redis, PostgreSQL, BullMQ, Zernio ni el SDK del agente.

---

# PARTE IV — MÓDULOS DEL SISTEMA

## 1. Identity & Access

Responsable de sesiones, roles y permisos.

Roles iniciales:

- `admin`: configuración, usuarios, cuentas, etiquetas, respuestas y acceso total autorizado;
- `supervisor`: bandeja general, asignación, auditoría operativa y reapertura;
- `agent`: ver y responder conversaciones permitidas;
- `viewer`: solo lectura.

Permisos granulares sugeridos:

```text
conversation.read
conversation.reply
conversation.assign
conversation.resolve
conversation.label
media.upload
media.send
canned_response.manage
channel_account.manage
user.manage
audit.read
agent_mode.change
```

Cada endpoint que recibe un identificador debe validar tanto el permiso como la pertenencia del objeto al tenant y al alcance del usuario.

## 2. Tenants y cuentas de canal

Aunque el primer cliente sea un solo spa, toda tabla de negocio debe incluir `tenant_id`. Nunca use un `accountId` recibido desde la UI como autoridad. El servidor obtiene el `accountId` de la conversación local previamente autorizada.

## 3. Conversations

Responsable de:

- estado local `open | pending | resolved`;
- estado remoto separado `active | archived`;
- no leídos;
- asignación;
- último mensaje;
- modo de automatización `auto | suggest | paused`;
- etiquetas;
- prioridad y SLA opcionales.

## 4. Messages

Responsable de:

- dirección `inbound | outbound | system`;
- emisor `customer | human_agent | ai_agent | system`;
- texto y tipo de contenido;
- respuesta a otro mensaje;
- estado local y remoto;
- idempotencia;
- errores operables;
- adjuntos.

Estados salientes:

```text
draft → queued → sending → sent → delivered → read
                         └───────────────→ failed
```

No permitir regresiones de estado. Un evento tardío `sent` no puede cambiar un mensaje que ya está `read`.

## 5. Labels

Etiquetas locales para organización. No confundirlas con `messageTag` de plataformas ni con estados de entidades del negocio.

## 6. Canned responses

En el código se llamarán `canned_responses` para no confundirlas con `quickReplies` de Zernio, que son botones interactivos visibles para el destinatario.

Una respuesta guardada contiene:

- nombre;
- atajo;
- cuerpo;
- variables permitidas;
- etiquetas asociadas;
- canales compatibles;
- estado activo/inactivo;
- autor y versiones.

La selección inserta el texto en el editor. No se envía automáticamente.

## 7. Media

Responsable de carga, validación, análisis, almacenamiento privado, miniaturas, URLs firmadas, compatibilidad de canal y envío.

## 8. Zernio Adapter

Único módulo autorizado para:

- usar `ZERNIO_API_KEY`;
- invocar la API de Zernio;
- traducir respuestas y errores;
- aplicar timeouts y reintentos;
- enviar `Idempotency-Key`;
- interpretar rate limits.

## 9. Agent Gateway

Único módulo autorizado para comunicarse con el agente ya existente. Debe aislar su contrato de los detalles internos de la bandeja.

## 10. Audit

Registra acciones relevantes sin almacenar secretos ni contenido completo innecesario.

---

# PARTE V — MODELO DE DATOS MÍNIMO

## Tablas principales

```text
tenants
users
memberships
zernio_profiles
channel_accounts
contacts
contact_identities
conversations
messages
message_attachments
labels
conversation_labels
canned_responses
canned_response_labels
assignments
webhook_events
outbox_events
agent_runs
media_assets
sync_checkpoints
audit_logs
```

## Campos esenciales

### `tenants`

```text
id uuid PK
slug text UNIQUE
name text
timezone text
status text
created_at timestamptz
updated_at timestamptz
```

### `channel_accounts`

```text
id uuid PK
tenant_id uuid FK
zernio_profile_id text
zernio_account_id text
platform text
status text
metadata jsonb
UNIQUE (tenant_id, zernio_account_id)
```

### `conversations`

```text
id uuid PK
tenant_id uuid FK
channel_account_id uuid FK
zernio_conversation_id text
contact_id uuid FK
local_status text
remote_status text
automation_mode text
assigned_user_id uuid NULL
unread_count integer
last_message_preview text
last_message_at timestamptz
last_inbound_at timestamptz
resolved_at timestamptz NULL
created_at timestamptz
updated_at timestamptz
UNIQUE (tenant_id, channel_account_id, zernio_conversation_id)
```

### `messages`

```text
id uuid PK
tenant_id uuid FK
conversation_id uuid FK
zernio_message_id text NULL
client_command_id uuid NULL
send_idempotency_key text NULL
direction text
sender_type text
content_type text
text_body text NULL
status text
status_rank integer
reply_to_message_id uuid NULL
provider_created_at timestamptz
sent_at timestamptz NULL
delivered_at timestamptz NULL
read_at timestamptz NULL
failed_at timestamptz NULL
error_code text NULL
error_detail_safe jsonb NULL
created_by_user_id uuid NULL
created_at timestamptz
updated_at timestamptz
```

Restricciones:

```text
UNIQUE parcial (tenant_id, zernio_message_id) WHERE zernio_message_id IS NOT NULL
UNIQUE parcial (tenant_id, client_command_id) WHERE client_command_id IS NOT NULL
UNIQUE parcial (tenant_id, send_idempotency_key) WHERE send_idempotency_key IS NOT NULL
```

### `message_attachments`

```text
id uuid PK
tenant_id uuid FK
message_id uuid FK
media_asset_id uuid NULL
kind text                     # image | video | audio | file
original_name text NULL
safe_name text
claimed_mime text NULL
detected_mime text
size_bytes bigint
sha256 text
storage_key text
scan_status text              # pending | clean | rejected | error
provider_url_encrypted text NULL
provider_refresh_url_encrypted text NULL
width integer NULL
height integer NULL
duration_ms integer NULL
created_at timestamptz
```

### `webhook_events`

```text
id uuid PK
zernio_event_id text UNIQUE
event_type text
payload_encrypted jsonb
signature_valid boolean
processing_status text         # received | queued | processing | processed | failed | dead
attempts integer
last_error_safe text NULL
received_at timestamptz
processed_at timestamptz NULL
```

### `outbox_events`

```text
id uuid PK
tenant_id uuid FK
aggregate_type text
aggregate_id uuid
event_type text
payload jsonb
status text                    # pending | processing | completed | failed | dead
attempts integer
available_at timestamptz
locked_at timestamptz NULL
created_at timestamptz
completed_at timestamptz NULL
```

### `agent_runs`

```text
id uuid PK
tenant_id uuid FK
conversation_id uuid FK
trigger_message_id uuid FK
mode text
input_hash text
output_encrypted jsonb
status text
tool_calls jsonb
latency_ms integer
token_usage jsonb NULL
error_safe text NULL
created_at timestamptz
```

## Aislamiento por tenant

- Toda consulta debe filtrar por `tenant_id` derivado de la sesión.
- Aplicar PostgreSQL Row-Level Security como defensa adicional.
- Las políticas RLS no reemplazan los controles de autorización en los casos de uso.
- Ningún repositorio debe exponer métodos `findById(id)` sin recibir el contexto del tenant.

Ejemplo de interfaz segura:

```ts
interface ConversationRepository {
  findByIdForTenant(tenantId: string, conversationId: string): Promise<Conversation | null>;
}
```

---

# PARTE VI — INTEGRACIÓN CON ZERNIO

## 1. Configuración inicial

1. Crear una API key de producción con el menor alcance posible.
2. Restringirla a los perfiles necesarios cuando el plan de Zernio lo permita.
3. Habilitar únicamente grupos de recursos requeridos, incluyendo mensajes y webhooks.
4. Guardar la clave una sola vez en el gestor de secretos.
5. Crear un secreto de webhook largo y aleatorio.
6. Registrar un webhook HTTPS público.
7. Suscribir como mínimo:

```text
conversation.started
message.received
message.sent
message.delivered
message.read
message.failed
message.edited
message.deleted
```

Agregar reacciones solo si la UI las implementa.

## 2. URL base

```text
https://zernio.com/api/v1
```

No repetir la URL en controladores. Mantenerla en configuración y encapsularla en `ZernioClient`.

## 3. Endpoint del webhook

```text
POST /webhooks/zernio
```

No usa la sesión de usuario. Se autentica mediante HMAC de Zernio.

## 4. Verificación de firma

- Leer los bytes originales del cuerpo antes de cualquier parseo.
- Leer `X-Zernio-Signature`.
- Calcular HMAC-SHA256 hexadecimal con `ZERNIO_WEBHOOK_SECRET`.
- Comparar en tiempo constante.
- Rechazar solicitudes sin firma o con firma incorrecta.
- No registrar el cuerpo completo en logs de error.

Ejemplo TypeScript:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyZernioSignature(params: {
  rawBody: Buffer;
  signature: string | undefined;
  secret: string;
}): boolean {
  const { rawBody, signature, secret } = params;
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
```

## 5. Recepción durable y respuesta rápida

El webhook debe responder antes de cinco segundos. No debe invocar al agente, descargar videos ni enviar mensajes dentro de la solicitud.

Flujo:

```text
1. Leer cuerpo crudo.
2. Verificar firma.
3. Validar tamaño máximo del payload.
4. Parsear y validar esquema.
5. Insertar `webhook_events` con `zernio_event_id` único.
6. Si ya existe, devolver 200 sin repetir efectos.
7. Confirmar persistencia durable.
8. Publicar un trabajo en la cola.
9. Devolver 200/202.
10. Un reconciliador vuelve a encolar eventos persistidos que no avanzaron.
```

La persistencia en PostgreSQL evita perder un evento si Redis queda temporalmente indisponible. La restricción única impide efectos duplicados.

## 6. Procesamiento entrante

El worker:

1. toma el evento con bloqueo;
2. resuelve `tenant_id` usando `event.account.id` y el mapa de cuentas;
3. rechaza cuentas desconocidas y genera alerta;
4. crea o actualiza contacto y conversación;
5. inserta el mensaje mediante `zernio_message_id` único;
6. actualiza no leídos y último mensaje;
7. copia los adjuntos entrantes al almacenamiento privado;
8. publica un evento SSE;
9. decide si debe invocar al agente;
10. marca el webhook como procesado.

## 7. Envío saliente confiable

La UI envía a la API propia:

```http
POST /api/v1/conversations/{localConversationId}/messages
Idempotency-Key: <UUID generado por el cliente>
```

Cuerpo:

```json
{
  "text": "Mensaje opcional",
  "mediaAssetIds": ["uuid-opcional"],
  "replyToMessageId": "uuid-opcional",
  "source": "human"
}
```

El servidor:

1. autentica al usuario;
2. autoriza acceso al objeto dentro del tenant;
3. valida la conversación y el canal;
4. valida la ventana o plantilla cuando corresponda;
5. valida medios aprobados y limpios;
6. en una transacción crea el mensaje local `queued` y un evento outbox;
7. devuelve el mensaje local inmediatamente;
8. el worker envía a Zernio usando una clave estable;
9. si hay timeout, reintenta con la misma clave y el mismo cuerpo;
10. procesa webhooks posteriores para actualizar `sent`, `delivered`, `read` o `failed`.

Ejemplo del adaptador:

```ts
export interface SendExternalMessageCommand {
  tenantId: string;
  accountId: string;
  conversationId: string;
  idempotencyKey: string;
  text?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
  attachmentName?: string;
}

export interface ZernioMessagePort {
  send(command: SendExternalMessageCommand): Promise<{
    externalMessageId: string;
    acceptedAt: Date;
  }>;
}
```

Reglas de idempotencia:

- `client_command_id` evita duplicados en la API propia.
- `send_idempotency_key` evita duplicados en la cola propia.
- `Idempotency-Key` de Zernio evita dobles envíos ante un timeout externo.
- La misma clave debe reutilizar exactamente el mismo cuerpo.
- Nunca genere una clave nueva durante un reintento de la misma operación.

## 8. Errores y reintentos

| Estado | Acción |
|---|---|
| 400 | No reintentar; marcar error de validación y mostrarlo de forma segura |
| 401 | Detener cola de ese proveedor, alertar credencial inválida |
| 402 | No reintentar en bucle; alertar suspensión/facturación |
| 403 | No reintentar; revisar alcance o permisos de la clave |
| 409 | Si la clave sigue en proceso, esperar y consultar/reintentar con la misma clave |
| 422 | No cambiar cuerpo con la misma clave; registrar conflicto de idempotencia |
| 429 | Respetar `Retry-After`, aplicar jitter y backpressure |
| 5xx | Reintento exponencial limitado con jitter y circuit breaker |
| timeout | Estado incierto; reintentar con la misma clave idempotente |

Máximo sugerido de intentos salientes: configurable, por ejemplo 7. Después, mover a dead-letter y ofrecer reenvío manual autorizado.

## 9. Sincronización inicial y reconciliación

Al conectar una cuenta:

1. listar conversaciones con cursor;
2. guardar el cursor de avance;
3. listar mensajes de cada conversación con cursor;
4. usar upserts idempotentes;
5. repetir un barrido posterior porque algunos canales pueden completar backfill en segundo plano;
6. mantener reconciliación periódica de baja frecuencia;
7. no reemplazar webhooks por polling.

## 10. Marcar como leído

Cuando la conversación esté realmente visible y activa para el agente humano:

1. poner no leídos locales en cero de forma transaccional;
2. encolar la llamada a Zernio para marcar la conversación como leída;
3. registrar error si el canal no lo soporta;
4. no marcar como leído simplemente porque la conversación apareció en una lista.

## 11. Archivar

Mantener dos estados:

```text
local_status: open | pending | resolved
remote_status: active | archived
```

Al resolver puede archivarse en Zernio según configuración. Un mensaje entrante debe reabrir localmente la conversación y, si corresponde, cambiar el estado remoto a activo.

---

# PARTE VII — MULTIMEDIA: IMÁGENES Y VIDEO

## 1. Principio

Ningún archivo se envía directamente desde el navegador a Zernio con una API key. La aplicación controla todo el flujo.

## 2. Carga desde la UI

Flujo recomendado:

```text
1. UI solicita autorización de carga a la API propia.
2. API valida usuario, tenant, tipo y cuota.
3. API genera URL firmada de subida a bucket privado.
4. UI carga el archivo directamente al storage privado.
5. UI notifica finalización con `mediaAssetId`.
6. Worker obtiene el objeto.
7. Verifica tamaño, extensión permitida, MIME detectado y firma mágica.
8. Calcula SHA-256.
9. Ejecuta antivirus/sandbox.
10. Extrae metadatos seguros y genera miniatura.
11. Marca el archivo `clean` o `rejected`.
12. Solo archivos `clean` pueden enviarse.
```

## 3. Tipos permitidos iniciales

Configurable por canal. Como política de producto inicial:

```text
Imágenes: JPEG, PNG, WebP
Videos: MP4 con codecs compatibles con los canales habilitados
```

No permitir SVG, HTML ni archivos ejecutables en el MVP. No confiar en el nombre ni en `Content-Type` del navegador.

## 4. Tamaño

Zernio documenta una carga directa máxima de 25 MB y almacenamiento temporal de siete días. Defina un máximo interno menor, por ejemplo 20 MB, para dejar margen y permitir reglas más estrictas por canal.

Si el archivo supera el máximo:

- rechazar con explicación;
- no comprimir ni transcodificar silenciosamente;
- la transcodificación será un módulo explícito futuro.

## 5. Envío a Zernio

Después del análisis:

1. el worker descarga el objeto privado;
2. lo carga del lado del servidor a `/v1/media/upload-direct` o usa multipart en el endpoint de envío;
3. obtiene una URL temporal de Zernio;
4. envía el mensaje con `attachmentUrl` y `attachmentType` correcto;
5. conserva una copia propia privada para la UI y auditoría;
6. no depende de la URL temporal como almacenamiento permanente.

## 6. Medios entrantes

Los enlaces de proveedores pueden expirar. Al recibir un adjunto:

- descargarlo rápidamente mediante el mecanismo autenticado indicado por Zernio;
- limitar tiempo, tamaño y redirecciones;
- validar tipo real;
- analizarlo;
- copiarlo al bucket privado;
- guardar referencias de proveedor cifradas solo mientras sean necesarias;
- mostrar al navegador una URL firmada propia, no el secreto ni una URL permanente del proveedor.

## 7. Protección SSRF

Cualquier descarga de una URL externa debe:

- aceptar únicamente hosts autorizados o URLs firmadas generadas por servicios conocidos;
- resolver DNS y bloquear IP privadas, loopback, link-local y metadata cloud;
- limitar redirecciones;
- volver a validar destino después de cada redirección;
- aplicar timeout, máximo de bytes y máximo de velocidad/tiempo;
- no enviar encabezados de credenciales a un host diferente.

## 8. Catálogo de medios aprobados para el agente

El agente no devuelve una URL. Devuelve `mediaAssetId` de un catálogo aprobado.

```ts
type ApprovedMedia = {
  id: string;
  tenantId: string;
  title: string;
  kind: 'image' | 'video';
  status: 'draft' | 'approved' | 'inactive';
  serviceIds: string[];
  supportedChannels: string[];
  storageKey: string;
  validFrom: Date;
  validUntil?: Date;
};
```

La aplicación valida el ID antes de enviar.

---

# PARTE VIII — CONTRATO DEL AGENTE YA CONFIGURADO

## 1. Modos

```text
auto: el agente puede generar una respuesta; las acciones siguen siendo validadas por servidor.
suggest: el agente genera borrador para aprobación humana.
paused: el agente no procesa nuevos mensajes.
```

Una asignación humana o un escalamiento puede cambiar automáticamente a `paused`.

## 2. Entrada al agente

```json
{
  "requestId": "uuid",
  "tenant": {
    "id": "uuid",
    "timezone": "America/Bogota",
    "locale": "es-CO"
  },
  "conversation": {
    "id": "uuid-local",
    "channel": "whatsapp",
    "automationMode": "auto"
  },
  "contact": {
    "displayName": "Nombre permitido",
    "attributes": {}
  },
  "messages": [
    {
      "id": "uuid",
      "direction": "inbound",
      "text": "Contenido tratado como no confiable",
      "attachments": [
        {
          "id": "uuid",
          "kind": "image",
          "safeMetadata": {}
        }
      ]
    }
  ],
  "availableTools": [
    "get_approved_media",
    "list_services",
    "escalate_conversation"
  ]
}
```

Enviar únicamente el contexto mínimo necesario. No enviar API keys, tokens, cadenas de conexión, instrucciones internas completas ni conversaciones de otros clientes.

## 3. Salida permitida

```json
{
  "action": "reply",
  "reply": {
    "text": "Respuesta opcional",
    "mediaAssetIds": ["uuid-aprobado"]
  },
  "labels": {
    "add": ["interesado"],
    "remove": []
  },
  "handoff": null,
  "toolCalls": [],
  "confidence": 0.92,
  "reasonCode": "SERVICE_INFORMATION"
}
```

Esquema:

```ts
import { z } from 'zod';

export const AgentOutputSchema = z.object({
  action: z.enum(['reply', 'handoff', 'no_reply']),
  reply: z.object({
    text: z.string().max(5000).optional(),
    mediaAssetIds: z.array(z.string().uuid()).max(4).default([]),
  }).optional(),
  labels: z.object({
    add: z.array(z.string().max(64)).max(10).default([]),
    remove: z.array(z.string().max(64)).max(10).default([]),
  }).default({ add: [], remove: [] }),
  handoff: z.object({
    reasonCode: z.string().max(100),
    note: z.string().max(1000).optional(),
  }).nullable().default(null),
  toolCalls: z.array(z.object({
    name: z.string().max(100),
    arguments: z.record(z.unknown()),
    idempotencyKey: z.string().uuid(),
  })).max(5).default([]),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().max(100),
}).strict();
```

## 4. Seguridad del agente

- Tratar cada mensaje del cliente y cada archivo como entrada hostil.
- Separar instrucciones del sistema de datos del usuario.
- No ejecutar instrucciones incluidas en imágenes, documentos o URLs.
- Autorizar cada herramienta en el servidor.
- Validar argumentos y tenant de cada herramienta.
- Herramientas de lectura y escritura deben tener permisos distintos.
- Acciones de alto impacto requieren confirmación humana.
- Limitar pasos, tiempo, tokens y costo por ejecución.
- No persistir memoria sin validación, clasificación y aislamiento por tenant.
- Validar toda salida antes de publicarla.
- Registrar hashes, decisiones y tool calls sin guardar secretos.
- Permitir apagar el agente globalmente y por conversación.

---

# PARTE IX — API INTERNA

Base:

```text
/api/v1
```

## Bandeja

```text
GET    /conversations
GET    /conversations/:id
GET    /conversations/:id/messages
POST   /conversations/:id/messages
POST   /conversations/:id/read
PATCH  /conversations/:id/status
PATCH  /conversations/:id/assignment
PATCH  /conversations/:id/automation-mode
POST   /conversations/:id/labels/:labelId
DELETE /conversations/:id/labels/:labelId
POST   /conversations/:id/retry-message/:messageId
```

Filtros de listado:

```text
status
platform
labelId
assignedTo
unread
automationMode
search
cursor
limit
sort
```

Usar paginación por cursor, no `offset`, para listas grandes.

## Etiquetas y respuestas

```text
GET    /labels
POST   /labels
PATCH  /labels/:id
DELETE /labels/:id

GET    /canned-responses
POST   /canned-responses
PATCH  /canned-responses/:id
DELETE /canned-responses/:id
```

## Media

```text
POST   /media/uploads/initiate
POST   /media/uploads/:id/complete
GET    /media/:id
DELETE /media/:id
```

## Tiempo real

```text
GET /events/stream
```

Eventos SSE:

```text
conversation.created
conversation.updated
message.created
message.status_changed
message.failed
attachment.ready
assignment.changed
agent.mode_changed
agent.suggestion_ready
```

Cada evento lleva:

```json
{
  "eventId": "uuid-monotónico-o-ordenable",
  "tenantId": "implícito por sesión; nunca confiar en el cliente",
  "type": "message.created",
  "occurredAt": "ISO-8601",
  "data": {}
}
```

Implementar `Last-Event-ID` para reconexión. Si el historial ya expiró, la UI invalida y vuelve a consultar el estado por REST.

## Webhook público

```text
POST /webhooks/zernio
```

## Operaciones internas

```text
POST /internal/agent/turn
POST /internal/jobs/reconcile
```

Deben estar protegidas por red privada, identidad de servicio y autorización mutua; no solo por una URL difícil de adivinar.

---

# PARTE X — DISEÑO DE LA UI

## 1. Ruta principal

```text
/inbox
```

## 2. Distribución de escritorio

```text
┌──────────────────────┬──────────────────────────────────┬──────────────────────┐
│ Bandeja              │ Conversación                     │ Contexto              │
│                      │                                  │                      │
│ Buscar               │ Encabezado                       │ Contacto              │
│ Filtros               │ Historial virtualizado           │ Etiquetas             │
│ Lista virtualizada   │ Estados y adjuntos               │ Asignación            │
│ No leídos            │                                  │ Estado                │
│ Canal / agente       │ Composer                         │ Modo del agente       │
│                      │ Respuestas / archivos / enviar   │ Auditoría resumida    │
└──────────────────────┴──────────────────────────────────┴──────────────────────┘
```

## 3. Bandeja izquierda

Mostrar:

- avatar seguro o iniciales;
- nombre del contacto;
- canal;
- vista previa del último mensaje;
- hora;
- no leídos;
- estado;
- etiquetas principales;
- asignado;
- indicador de agente automático/pausado;
- error pendiente cuando exista.

Requisitos:

- lista virtualizada;
- cursor incremental;
- filtros persistidos en la URL;
- actualización incremental por SSE;
- no volver a renderizar toda la lista por cada evento;
- accesible por teclado.

## 4. Historial central

- paginación inversa por cursor;
- conservar posición al cargar mensajes antiguos;
- agrupar por fecha;
- diferenciar cliente, humano, agente y sistema;
- mostrar texto como contenido escapado;
- previsualizar imágenes mediante URL firmada;
- reproducir video con controles nativos y sin autoplay;
- mostrar progreso de descarga/carga;
- estados `en cola`, `enviando`, `enviado`, `entregado`, `leído`, `falló`;
- botón de reintento solo cuando la operación sea reintentable;
- citar o responder a un mensaje si el canal lo soporta;
- no asumir que todos los canales soportan edición, eliminación, lectura o reacciones.

## 5. Composer

- texto multilinea;
- `Enter` envía y `Shift+Enter` crea línea, configurable;
- contador cuando el canal tenga límites;
- selector de respuestas guardadas con `/`;
- arrastrar/soltar y selector de archivo;
- validación previa de imagen/video;
- vista previa removible;
- progreso de carga;
- botón cancelar;
- borrador local cifrado o almacenado solo en navegador según sensibilidad;
- deshabilitar envío si la conversación no es autorizada o el archivo no está limpio;
- advertencia de ventana de WhatsApp cuando corresponda;
- selector de plantilla aprobado cuando la respuesta libre no sea válida.

## 6. Panel derecho

- información mínima del contacto;
- etiquetas;
- estado local;
- asignación;
- modo del agente;
- historial resumido de cambios;
- acciones peligrosas con confirmación;
- sin exponer identificadores internos innecesarios.

## 7. Responsive

En móvil:

- bandeja como primera pantalla;
- conversación como segunda pantalla;
- panel de contexto en drawer;
- composer siempre visible sin tapar mensajes;
- tamaños táctiles accesibles;
- video e imágenes ajustados al ancho.

## 8. Accesibilidad

Objetivo WCAG 2.2 AA:

- foco visible;
- navegación completa por teclado;
- etiquetas ARIA correctas;
- contraste suficiente;
- estados no comunicados únicamente por color;
- anuncios de nuevos mensajes mediante live region sin interrumpir;
- mensajes y adjuntos con nombres accesibles;
- reducción de movimiento respetada.

## 9. Estado del frontend

- TanStack Query para datos remotos y caché.
- Estado local pequeño para composición y UI.
- No duplicar toda la base de datos en un store global.
- Actualizaciones optimistas únicamente con un ID local estable y posibilidad de rollback.
- El servidor sigue siendo la autoridad.

---

# PARTE XI — SEGURIDAD

## 1. Autenticación

- OIDC con MFA para administradores y supervisores.
- Cookie de sesión HttpOnly, Secure y SameSite.
- Rotación de sesión tras login y cambio de privilegios.
- Expiración absoluta e inactividad.
- Revocación de sesiones.
- No almacenar tokens sensibles en localStorage.

## 2. Autorización

Aplicar tres controles en cada caso de uso:

```text
1. ¿La sesión está autenticada?
2. ¿El rol tiene la capacidad requerida?
3. ¿El objeto pertenece al tenant y al alcance del usuario?
```

Nunca considere un UUID como control de acceso.

## 3. Secretos

- Gestor de secretos administrado.
- Un secreto distinto por entorno.
- Rotación documentada.
- Claves con alcance mínimo.
- No incluir secretos en CI logs, errores, trazas, dumps ni bundles.
- Detectar secretos en commits.

## 4. Seguridad web

- HTTPS obligatorio.
- HSTS.
- CSP estricta con nonces cuando sea necesario.
- `frame-ancestors 'none'` salvo requerimiento documentado.
- `X-Content-Type-Options: nosniff`.
- política de referrer restrictiva.
- CORS con orígenes exactos; no `*` con credenciales.
- protección CSRF para acciones basadas en cookie.
- sanitización/escape de contenido.
- no ejecutar HTML de mensajes.

## 5. Rate limiting y abuso

Aplicar límites por:

- IP antes de autenticación;
- usuario;
- tenant;
- endpoint;
- conversación;
- agente conversacional;
- cargas de archivo;
- mensajes salientes.

La cola debe aplicar fairness entre tenants para que un cliente no consuma toda la cuota compartida de Zernio.

## 6. Archivos

- allowlist de extensiones;
- MIME real por magic bytes;
- nombre aleatorio interno;
- límite de tamaño;
- antivirus;
- bucket privado;
- URLs firmadas cortas;
- autorización en cada descarga;
- cuotas por tenant;
- protección CSRF;
- no servir archivos desde el mismo origen ejecutable cuando sea evitable;
- `Content-Disposition` seguro para archivos no renderizables.

## 7. Datos y privacidad

- minimizar PII;
- cifrado en tránsito y en reposo;
- cifrado adicional para payloads sensibles si el riesgo lo requiere;
- política de retención configurable;
- borrado lógico y proceso de eliminación real;
- exportación y eliminación por cliente cuando aplique;
- ocultar cuerpo de mensajes en logs por defecto;
- acceso a conversaciones sensibles auditable.

## 8. Logs

Cada log debe incluir:

```text
request_id
trace_id
tenant_id pseudonimizado
user_id pseudonimizado
conversation_id local
operation
duration_ms
result
safe_error_code
```

No incluir:

```text
API keys
secreto HMAC
tokens de sesión
cuerpo completo de mensajes
URLs firmadas completas
contenido de archivos
contraseñas
datos de pago
```

## 9. Supply chain

- lockfile obligatorio;
- dependencias fijadas;
- revisión de dependencias nuevas;
- escaneo de vulnerabilidades;
- SBOM por release;
- firma de imágenes de contenedor;
- imágenes mínimas y usuario no root;
- actualización automatizada con pruebas.

## 10. Amenazas mínimas que deben modelarse

- BOLA y acceso cruzado entre tenants;
- elevación de privilegios;
- XSS mediante contenido de mensajes;
- CSRF;
- SSRF mediante URLs de adjuntos;
- archivos maliciosos;
- webhook falsificado o repetido;
- replay de comandos;
- doble envío;
- prompt injection;
- abuso de herramientas del agente;
- exfiltración de datos;
- agotamiento de cuota o costos;
- robo de secretos;
- dependencia caída;
- eventos fuera de orden;
- pérdida de cola;
- URL multimedia expirada.

---

# PARTE XII — ESCALABILIDAD Y RESILIENCIA

## 1. Escalado horizontal

- `web`: estático/edge cuando sea adecuado.
- `api`: instancias stateless detrás de balanceador.
- `worker`: escalar por longitud de cola y latencia.
- PostgreSQL administrado con réplicas solo cuando las métricas lo exijan.
- Redis administrado con persistencia y alta disponibilidad.
- SSE distribuido mediante Redis Pub/Sub o Streams.

## 2. Índices mínimos

```text
conversations (tenant_id, local_status, last_message_at DESC)
conversations (tenant_id, assigned_user_id, last_message_at DESC)
messages (tenant_id, conversation_id, provider_created_at DESC, id DESC)
messages (tenant_id, zernio_message_id)
webhook_events (processing_status, received_at)
outbox_events (status, available_at)
conversation_labels (tenant_id, label_id, conversation_id)
```

Usar búsqueda PostgreSQL de texto completo para el MVP. Introducir motor externo solo cuando volumen y requisitos lo justifiquen.

## 3. Backpressure

- limitar concurrencia global y por tenant;
- observar encabezados de rate limit de Zernio;
- respetar `Retry-After`;
- pausar temporalmente trabajos cuando la cuota esté baja;
- priorizar mensajes humanos sobre reconciliaciones masivas;
- ejecutar backfills en lotes suaves;
- cola dead-letter con replay controlado.

## 4. Outbox e inbox patterns

- `webhook_events` actúa como inbox durable y deduplicado.
- `outbox_events` une cambios de base de datos con efectos externos.
- Un dispatcher repara eventos atascados.
- Cada consumidor debe ser idempotente.

## 5. Consistencia

- mensajes y estados externos: consistencia eventual;
- autorización, asignación y comandos locales: consistencia fuerte;
- nunca confirmar en UI un envío externo basándose solo en la animación optimista;
- mostrar claramente `en cola` o `enviando`.

## 6. Backup y recuperación

- PostgreSQL con point-in-time recovery;
- backups cifrados y pruebas periódicas de restauración;
- versionado/lifecycle del bucket;
- infraestructura reproducible;
- runbook para rotar secretos y reconstruir cola;
- reconciliación con Zernio después de una interrupción.

---

# PARTE XIII — OBSERVABILIDAD

## Métricas

```text
webhook_received_total
webhook_invalid_signature_total
webhook_duplicate_total
webhook_processing_latency_ms
webhook_dead_letter_total
message_send_total
message_send_failure_total
message_delivery_latency_ms
zernio_request_total por status
zernio_rate_limit_total
queue_depth
queue_oldest_job_age
agent_run_total
agent_handoff_total
agent_error_total
media_scan_failure_total
sse_connections
api_latency_ms
```

## Alertas críticas

- webhook no recibe eventos durante un intervalo anormal;
- firmas inválidas aumentan;
- webhook o suscripción aparece inactiva;
- cola antigua supera umbral;
- tasa de fallos salientes aumenta;
- 401/402/403 de Zernio;
- 429 sostenidos;
- almacenamiento o base cerca de cuota;
- antivirus no disponible;
- errores de aislamiento/autorización;
- agente supera límites de costo o latencia.

## Trazabilidad

Propagar un `trace_id` desde:

```text
webhook → evento durable → worker → base de datos → agente → outbox → Zernio → webhook de estado
```

No enviar PII innecesaria al proveedor de observabilidad.

---

# PARTE XIV — CI/CD Y ENTORNOS

## Entornos

```text
local
test
staging
production
```

Cada entorno usa:

- base de datos distinta;
- Redis distinto;
- bucket distinto;
- claves Zernio distintas cuando sea posible;
- secreto de webhook distinto;
- agente/configuración distinta;
- dominios y CORS distintos.

## Pipeline obligatorio

```text
1. instalar con lockfile
2. formato
3. lint
4. typecheck
5. pruebas unitarias
6. pruebas de integración con Testcontainers
7. pruebas de contratos
8. build
9. escaneo de secretos
10. SAST
11. auditoría de dependencias
12. SBOM
13. migración en base efímera
14. Playwright contra entorno temporal
15. escaneo de imagen Docker
16. aprobación para producción
17. migración backward-compatible
18. despliegue canary o rolling
19. smoke tests
20. monitoreo posterior y rollback automático/manual
```

## Migraciones

- expandir antes de contraer;
- no eliminar columnas usadas en el mismo despliegue que introduce el reemplazo;
- migraciones reversibles cuando sea posible;
- backup y plan de rollback;
- jobs de backfill observables y reiniciables.

---

# PARTE XV — PRUEBAS OBLIGATORIAS

## 1. Unitarias

- reglas de estados;
- reemplazo de variables en respuestas;
- permisos;
- selección de medio aprobado;
- clasificación de errores;
- orden monotónico de estados;
- cálculo/verificación HMAC.

## 2. Integración

- PostgreSQL real efímero;
- Redis real efímero;
- transacción mensaje + outbox;
- deduplicación de webhook;
- RLS y aislamiento;
- carga y escaneo de archivos;
- adaptador Zernio con servidor simulado.

## 3. Contrato Zernio

Verificar en staging:

- listar conversaciones;
- listar mensajes;
- recibir `message.received`;
- enviar texto;
- enviar imagen;
- enviar video;
- marcar leído;
- archivar/reabrir;
- recibir `sent`, `delivered`, `read` y `failed` cuando el canal lo soporte;
- comprobar comportamiento de plantillas de WhatsApp;
- comprobar errores 409, 422 y 429.

## 4. Pruebas antiatajo y resiliencia

1. El mismo webhook llega dos veces: un solo mensaje local y un solo efecto.
2. Dos workers toman el mismo trabajo: un solo efecto.
3. Hay timeout después del envío: reintento con misma clave, un solo mensaje externo.
4. Eventos llegan `read` antes que `delivered`: el estado final sigue siendo `read`.
5. Redis cae después de persistir el webhook: el reconciliador lo recupera.
6. Zernio responde 429: se respeta `Retry-After`.
7. Zernio responde 401: se detiene el ruido y se alerta.
8. Una URL de medio apunta a localhost/metadata cloud: se bloquea.
9. Un archivo declara JPEG pero contiene otro formato: se rechaza.
10. Un usuario modifica un UUID para acceder a otro tenant: 404/403 sin fuga.
11. El agente pide una herramienta no autorizada: se rechaza.
12. Un mensaje intenta prompt injection: no obtiene secretos ni herramientas adicionales.
13. La conexión SSE se corta: la UI reconecta y recupera cambios.
14. Dos agentes responden simultáneamente: ambos comandos son trazables y la UI evita confusión; opcionalmente se aplica bloqueo o advertencia.
15. Un medio temporal expira: la UI usa la copia privada propia.

## 5. E2E de UI

- login y logout;
- filtros;
- abrir conversación;
- marcar leído;
- enviar texto;
- enviar imagen;
- enviar video;
- usar respuesta guardada;
- aplicar etiqueta;
- asignar;
- pausar/reanudar agente;
- error y reintento;
- responsive;
- accesibilidad automática y revisión manual.

## 6. Carga

Definir volumen esperado antes de producción. Como base, probar:

- ráfagas de webhooks;
- cientos de conexiones SSE concurrentes;
- paginación de conversaciones grandes;
- conversaciones con miles de mensajes;
- videos en carga simultánea;
- cola durante una caída temporal de Zernio.

Los números finales deben derivarse del tráfico real y quedar documentados.

---

# PARTE XVI — CRITERIOS DE ACEPTACIÓN OPERATIVA

El sistema puede declararse listo para producción únicamente cuando:

## Funcionalidad

- [ ] Las conversaciones nuevas aparecen sin refrescar manualmente.
- [ ] El historial se pagina sin duplicados ni saltos.
- [ ] Se envía y recibe texto.
- [ ] Se envían y reciben imágenes.
- [ ] Se envían y reciben videos dentro de límites configurados.
- [ ] Los estados se actualizan cuando el canal los entrega.
- [ ] Marcar leído funciona y no se ejecuta prematuramente.
- [ ] Etiquetas y respuestas guardadas funcionan.
- [ ] El agente opera en `auto`, `suggest` y `paused`.
- [ ] El escalamiento humano detiene la automatización cuando está configurado.
- [ ] Resolver, archivar y reabrir funcionan.

## Confiabilidad

- [ ] Un webhook duplicado no crea efectos duplicados.
- [ ] Un timeout de envío no duplica el mensaje.
- [ ] Los eventos fuera de orden no degradan estados.
- [ ] Los trabajos fallidos llegan a dead-letter y pueden reproducirse.
- [ ] Una caída corta de Redis o Zernio se recupera.
- [ ] La reconciliación detecta y repara diferencias.

## Seguridad

- [ ] No hay credenciales en bundle, repositorio ni logs.
- [ ] Todas las rutas por objeto prueban autorización y tenant.
- [ ] RLS está activa y probada.
- [ ] El webhook rechaza firmas inválidas.
- [ ] Los archivos se validan y analizan.
- [ ] SSRF, XSS y CSRF tienen controles probados.
- [ ] El agente no puede ampliar sus propios permisos.
- [ ] Los pentests o pruebas de seguridad críticas no tienen hallazgos abiertos.

## Rendimiento objetivo inicial

- [ ] Acuse del webhook p95 menor a 500 ms y siempre menor a 5 s bajo carga esperada.
- [ ] Mensaje entrante visible en UI p95 menor a 2 s después de persistirse, excluyendo indisponibilidad del proveedor.
- [ ] API de listado p95 menor a 500 ms con el volumen objetivo.
- [ ] La interfaz conserva 60 FPS razonables en listas gracias a virtualización.
- [ ] No existe crecimiento ilimitado de memoria, cola o logs.

## Operación

- [ ] Dashboards y alertas activos.
- [ ] Backups y restauración probados.
- [ ] Runbook de incidentes disponible.
- [ ] Rotación de claves documentada.
- [ ] Despliegue y rollback probados.
- [ ] Prueba final con cuentas reales de cada canal habilitado.

---

# PARTE XVII — PLAN DE IMPLEMENTACIÓN

## Fase 0 — Validación contractual

- credenciales y perfil;
- listar conversaciones y mensajes;
- recibir un webhook firmado;
- enviar texto;
- enviar imagen y video de prueba;
- confirmar límites y comportamiento del canal;
- documentar payloads reales anonimizados.

**Salida:** prueba técnica y contratos congelados.

## Fase 1 — Fundaciones

- monorepo;
- configuración tipada;
- autenticación;
- tenants;
- PostgreSQL, Redis y storage;
- CI/CD;
- observabilidad base.

## Fase 2 — Inbox entrante

- endpoint webhook;
- HMAC;
- inbox durable;
- worker;
- conversaciones y mensajes;
- SSE;
- sincronización inicial.

## Fase 3 — Envío saliente

- composer;
- mensaje local;
- outbox;
- idempotencia;
- adaptador Zernio;
- estados y errores;
- leído y archivado.

## Fase 4 — UI operativa

- tres paneles;
- filtros;
- paginación;
- virtualización;
- responsive;
- accesibilidad;
- drafts y atajos.

## Fase 5 — Etiquetas y respuestas guardadas

- CRUD;
- relación con conversación;
- variables;
- administración;
- auditoría.

## Fase 6 — Imágenes y video

- uploads privados;
- análisis;
- miniaturas;
- envío Zernio;
- recepción y copia;
- reproductor y preview;
- límites por canal.

## Fase 7 — Agente existente

- gateway;
- esquemas;
- modos;
- herramientas;
- sugerencias;
- escalamiento;
- seguridad contra prompt injection.

## Fase 8 — Endurecimiento

- RLS;
- threat model;
- rate limits;
- pruebas de caos;
- carga;
- seguridad;
- alertas;
- backup/restore.

## Fase 9 — Piloto y producción

- staging con cuenta real;
- usuarios piloto;
- corrección de incidencias;
- producción gradual;
- monitoreo reforzado;
- aceptación formal.

---

# PARTE XVIII — EJEMPLO DE CONFIGURACIÓN PARA EL SPA

## Tenant

```yaml
tenant:
  name: "Spa Demo"
  timezone: "America/Bogota"
  locale: "es-CO"
  defaultAutomationMode: "suggest"
  maxUploadBytes: 20971520
  allowedImageTypes:
    - image/jpeg
    - image/png
    - image/webp
  allowedVideoTypes:
    - video/mp4
```

## Etiquetas

```text
Nuevo cliente
Cliente recurrente
Interesado
Reserva pendiente
Requiere confirmación
Reagendar
Cancelación
VIP
Queja
Escalado a recepción
```

## Respuestas guardadas

### `/saludo`

```text
Hola {{nombre}}, gracias por comunicarte con {{spa}}. ¿En qué tratamiento estás interesado?
```

### `/horario`

```text
Nuestro horario de atención es {{horario}}. ¿Qué fecha prefieres?
```

### `/media-cabinas`

Esta respuesta no contiene una URL fija. Solicita al sistema el medio aprobado con categoría `cabinas` y el canal actual.

### `/humano`

```text
Voy a transferir tu conversación a recepción para que podamos ayudarte personalmente.
```

## Ejemplo: el cliente solicita un video

Cliente:

```text
¿Me puedes mostrar un video de las cabinas?
```

Flujo correcto:

```text
1. Zernio envía `message.received`.
2. El webhook valida y persiste.
3. El worker guarda el mensaje.
4. El Agent Gateway envía contexto mínimo al agente.
5. El agente solicita `get_approved_media(category="cabinas", kind="video")`.
6. El servidor autoriza la herramienta y devuelve un `mediaAssetId` aprobado.
7. El agente redacta el texto y devuelve el ID, nunca una URL arbitraria.
8. La aplicación crea mensaje + outbox.
9. El worker carga el MP4 limpio a Zernio.
10. Envía `attachmentType="video"` con idempotencia.
11. La UI muestra `enviando` y después estados reales.
12. Los webhooks de estado actualizan el historial.
```

Respuesta:

```text
Claro. Aquí puedes conocer nuestras cabinas y el ambiente del spa.
[video aprobado]
```

## Ejemplo: respuesta humana con imagen

```text
1. La recepcionista abre la conversación.
2. Arrastra una imagen al composer.
3. La imagen se carga al bucket privado.
4. El análisis confirma que es JPEG limpio y permitido.
5. La recepcionista escribe un texto y pulsa Enviar.
6. La API crea un mensaje `queued` con ID idempotente.
7. El worker sube el archivo a Zernio y envía el mensaje.
8. Un timeout no crea un segundo envío porque se reutiliza la clave.
```

## Extensión futura: reservas

La reserva debe ser un módulo de negocio separado. El agente consulta disponibilidad mediante herramientas autorizadas y nunca inventa horarios. Una etiqueta `Reserva pendiente` no reemplaza el estado real de una cita.

---

# PARTE XIX — VARIABLES DE ENTORNO

```dotenv
APP_ENV=local
WEB_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000

DATABASE_URL=postgresql://...
REDIS_URL=redis://...

SESSION_SECRET=...
OIDC_ISSUER=...
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...

ZERNIO_BASE_URL=https://zernio.com/api/v1
ZERNIO_API_KEY=...
ZERNIO_WEBHOOK_SECRET=...

AGENT_BASE_URL=...
AGENT_AUTH_TOKEN=...
AGENT_TIMEOUT_MS=15000

S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...

ANTIVIRUS_ENDPOINT=...

OTEL_EXPORTER_OTLP_ENDPOINT=...
LOG_LEVEL=info
```

`.env.example` contiene nombres, nunca valores reales.

---

# PARTE XX — DECISIONES QUE NO DEBEN CAMBIARSE SIN ADR

1. Base local alimentada por webhooks.
2. API key solo en servidor.
3. TypeScript como lenguaje principal.
4. Monolito modular antes de microservicios.
5. PostgreSQL como fuente de verdad local.
6. Outbox/inbox para efectos externos.
7. Idempotencia en API propia y Zernio.
8. Archivos privados y analizados.
9. Agente detrás de gateway y herramientas con mínimo privilegio.
10. UI sin lógica de negocio ni acceso directo al proveedor.
11. Tenant en todas las entidades y controles de objeto.
12. Pruebas reales de canales antes de producción.

Cualquier cambio requiere un Architecture Decision Record con contexto, opciones, riesgos, migración y rollback.

---

# PARTE XXI — REFERENCIAS OFICIALES VERIFICADAS

Zernio:

- Inbox multi-tenant y patrón webhook-first: https://docs.zernio.com/multi-tenant/inbox
- Webhooks y firma HMAC: https://docs.zernio.com/webhooks
- Enviar mensajes y adjuntos: https://docs.zernio.com/messages/send-inbox-message
- Carga directa de medios: https://docs.zernio.com/messages/upload-media-direct
- Listar conversaciones: https://docs.zernio.com/messages/list-inbox-conversations
- Listar mensajes: https://docs.zernio.com/messages/get-inbox-conversation-messages
- Marcar leído: https://docs.zernio.com/messages/mark-conversation-read
- Actualizar conversación: https://docs.zernio.com/messages/update-inbox-conversation
- Límites de API: https://docs.zernio.com/guides/rate-limits
- SDK oficial Node.js/TypeScript: https://docs.zernio.com/sdks/node
- Claves de API y scopes: https://docs.zernio.com/api-keys/create-api-key

OWASP:

- API1 Broken Object Level Authorization: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
- File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- AI Agent Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- SSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

---

# PARTE XXII — PRIMER ENCARGO QUE DEBE RECIBIR CODEX

```md
Lee AGENTS.md y docs/ZERNIO_CHAT_MASTER_SPEC.md completos.

No modifiques código todavía.

Entrega:

1. Arquitectura propuesta y límites de módulos.
2. Diagrama de componentes y secuencias de entrada/salida.
3. Árbol definitivo del monorepo.
4. Modelo de datos y migración inicial.
5. Contratos HTTP, SSE, Zernio y Agent Gateway.
6. Estrategia de autenticación, autorización y tenant isolation.
7. Estrategia de webhooks, deduplicación, outbox e idempotencia.
8. Pipeline de imágenes y video.
9. Threat model inicial.
10. Plan de implementación por PRs pequeños.
11. Matriz de pruebas.
12. Riesgos, supuestos y preguntas que puedan resolverse mediante un spike técnico.

Respeta estas reglas:

- La UI solo se conecta a nuestra API.
- Zernio solo se usa desde el backend/worker.
- El webhook se confirma antes de cinco segundos después de persistencia durable.
- El mismo evento o comando no puede producir dos efectos.
- El agente existente se integra por un gateway restringido.
- Toda entidad se aísla por tenant.
- Todo medio se almacena de forma privada, se valida y se analiza.
- No inventes endpoints de Zernio; usa la documentación oficial indicada.
- No declares compatibilidad de una función hasta probarla en el canal real.
```
