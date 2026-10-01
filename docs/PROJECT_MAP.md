# Mapa del proyecto

## Propósito

Chat Zernio es una bandeja de atención multiusuario y multi-tenant. Permite a agentes humanos recibir, organizar y responder conversaciones transportadas por Zernio, con un agente n8n controlado por la aplicación.

No pertenece al producto ninguna regla de reservas, citas, agenda, disponibilidad, pagos, catálogo comercial ni operación de spa.

## Actores

- **Administrador:** administra usuarios, etiquetas, respuestas rápidas, integraciones y auditoría.
- **Supervisor:** supervisa el equipo, asigna conversaciones, revisa fallos y controla el modo del agente.
- **Agente:** opera conversaciones autorizadas, responde, etiqueta, cambia estados y solicita transferencia.
- **Contacto externo:** intercambia mensajes por un canal conectado a Zernio.
- **Zernio:** transporta mensajes y publica eventos del proveedor.
- **n8n:** produce respuestas o solicitudes de transferencia bajo un contrato restringido.

## Dominios centrales

### Identidad y acceso

- Es propietario de la sesión, membresías, roles, capacidades y alcance por tenant.
- No es propietario del estado de conversaciones ni de credenciales de integraciones.
- Punto de entrada previsto: `packages/auth` y `apps/api`.

### Conversaciones

- Es propietario de `open`, `pending`, `resolved`, no leídos, asignación y modo de automatización.
- Reabre una conversación resuelta al persistir un nuevo mensaje entrante.
- No es propietario de los estados de transporte del mensaje ni de etiquetas de proveedor.
- Punto de entrada previsto: `packages/domain/conversations`.

### Mensajes

- Es propietario de la dirección, emisor, contenido local, idempotencia y progresión monotónica de estados.
- No es propietario de los contratos ni capacidades de Zernio.
- Punto de entrada previsto: `packages/domain/messages`.

### Multimedia

- Es propietario de autorización de carga, metadatos, escaneo, almacenamiento privado y aprobación de activos.
- No es propietario del almacenamiento temporal de un proveedor externo.
- Punto de entrada previsto: `packages/storage`.

### Organización de atención

- Es propietaria de etiquetas internas, respuestas rápidas y asignaciones.
- No representa estados de negocio de otro sistema ni etiquetas propias de plataformas conectadas.
- Punto de entrada previsto: `packages/domain/organization`.

### Integración y automatización

- **Zernio:** traduce exclusivamente el protocolo del proveedor y controla sus efectos externos.
- **Agent Gateway:** valida y autoriza la comunicación con el workflow n8n.
- **Webhooks/outbox:** garantizan recepción durable, deduplicación, reintentos y trazabilidad.

## Flujos de alto nivel

1. Zernio entrega un webhook firmado.
2. El adaptador valida autenticidad y persiste un evento inbox idempotente.
3. Un worker normaliza el evento, aplica reglas de conversación/mensaje y persiste los cambios.
4. La aplicación publica el cambio a la UI y, cuando aplique, solicita una decisión al Agent Gateway.
5. Un comando humano o una respuesta autorizada crea un mensaje local y un evento outbox atómico.
6. El worker envía el efecto mediante el adaptador Zernio y procesa los estados posteriores.

## Dónde implementar cada cambio

| Tipo de cambio                  | Propietario     | Ubicación prevista                          |
| ------------------------------- | --------------- | ------------------------------------------- |
| Regla de conversación o mensaje | Dominio         | `packages/domain`                           |
| Caso de uso y transacción       | Aplicación      | `apps/api` / `apps/worker`                  |
| HTTP, webhook o proveedor       | Adaptadores     | `packages/zernio`, `packages/agent-gateway` |
| Persistencia, colas y storage   | Infraestructura | `packages/database`, `packages/storage`     |
| UI y accesibilidad              | Presentación    | `apps/web`                                  |

## Verificación prevista

Los comandos se definirán al inicializar el monorepo. Todo corte debe incluir pruebas unitarias, de integración de PostgreSQL/Redis, contratos de proveedor, autorización por tenant, idempotencia y E2E de UI cuando corresponda.
