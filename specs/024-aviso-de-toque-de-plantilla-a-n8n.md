# Especificación: notificar a n8n el toque de un botón de plantilla

- **Estado:** aprobada
- **Responsable:** integración y automatización (`apps/worker`)
- **Fecha:** `2026-10-08`

## 1. Problema

La plantilla `notificacion_48h` pregunta al cliente si asistirá, con dos botones de respuesta rápida.
Hoy su toque entra como un mensaje de texto más: queda en el hilo y nadie se entera. El equipo no
puede confirmar la cita sin que una persona lea el chat, que es justo lo que la plantilla venía a
evitar. n8n es quien aplica la decisión sobre la reserva, y no recibe nada.

## 2. Resultado esperado

Cada toque de botón que responde a una plantilla nuestra llega **una sola vez** a un webhook de n8n,
con contexto mínimo suficiente para actuar (qué conversación, qué mensaje, qué se pulsó y qué
plantilla lo preguntó). Si n8n no responde, el aviso se reintenta de forma acotada y su fallo queda
visible en la cola, sin perder el mensaje del cliente ni bloquear la bandeja.

## 3. No objetivos

- Interpretar el toque: no se decide nada sobre la reserva aquí. n8n decide.
- Notificar toques de botones que **no** responden a una plantilla nuestra.
- Responder al cliente con texto propio (el flujo existente del bot no cambia).
- Reintentar avisos ocurridos antes de configurar el webhook.
- Construir el flujo de n8n: se entrega el contrato, no el workflow.

## 4. Actores y permisos

| Actor           | Puede                                                             | No puede                                                             |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cliente externo | Pulsar un botón de una plantilla recibida                         | Elegir qué se notifica ni a dónde                                    |
| Trabajador      | Detectar el toque, encolarlo y despacharlo con reintentos         | Enviar PII ni secretos a n8n                                         |
| n8n             | Recibir el aviso autenticado y consultar el detalle por su cuenta | Recibir notas privadas, teléfonos, correos o cuerpos de conversación |
| Administrador   | Configurar la URL y el secreto del webhook                        | Leer el secreto desde la interfaz                                    |

## 5. Reglas e invariantes

1. **Qué es un toque:** un `message.received` cuyo `metadata.buttonPayload` viene con valor **y** cuyo mensaje citado es uno de nuestros mensajes salientes enviados con plantilla de WhatsApp.
2. Un toque produce **como mucho un aviso**, aunque el proveedor reenvíe el webhook o el trabajador reintente: la clave de idempotencia se deriva del mensaje entrante, no del intento.
3. El aviso **no** viaja en el hilo del webhook: se persiste en la cola de salida y se despacha después, para que una caída de n8n no impida guardar el mensaje del cliente.
4. **Qué no sale:** nada de teléfonos, correos, nombres ni cuerpos. Solo identificadores internos, el contenido del botón y la referencia de la plantilla.
5. Un fallo de n8n **no** cambia el estado del mensaje del cliente: el toque ya está guardado y visible en la bandeja.
6. **Fallos visibles:** cada aviso termina en `completed` o en `failed` con un código. Un `4xx` no se reintenta (secreto o contrato mal); un `429` o un `5xx` sí, con espera creciente y como máximo 3 intentos.
7. Sin webhook configurado **no se encola**: se registra el motivo y se deja constancia de que ese toque no se notificará.

## 6. Flujo principal

1. El cliente pulsa «Asistiré».
2. Zernio entrega un `message.received` con `metadata.buttonPayload` y el mensaje citado.
3. El trabajador guarda el mensaje entrante como siempre.
4. Resuelve el mensaje citado por su referencia de proveedor y comprueba que salió con plantilla.
5. Encola un evento de salida con clave derivada del mensaje entrante.
6. Otro ciclo del trabajador toma el evento y hace `POST` al webhook de n8n con el secreto.
7. n8n responde `2xx` y el evento queda `completed`.

## 7. Flujos alternos y errores

- **n8n responde `4xx`** → `failed` sin reintento, con el código del estado. No se insiste: repetir no arregla un secreto mal puesto.
- **n8n responde `429` o `5xx`, o no responde** → reintento acotado con espera creciente; al agotar, `failed`.
- **El webhook se reenvía** (mismo toque dos veces) → un solo evento: la clave determinista choca con la existente y se descarta.
- **El toque cita un mensaje que no es nuestro o no salió con plantilla** → el mensaje se guarda y no se notifica nada.
- **La conversación o la cuenta no están registradas** → el evento del proveedor falla como hoy; no se inventa nada.
- **El webhook no está configurado** → no se encola y se registra `worker.n8n_notification_skipped`.

## 8. Casos límite

- Toque con `buttonPayload` vacío o solo espacios: no es un toque.
- `metadata` presente sin `quotedMessage`: no hay plantilla que resolver, no se notifica.
- `quotedMessage.platformMessageId` que no coincide con ningún mensaje nuestro: no se notifica.
- El mensaje citado existe pero es de **texto** (no plantilla): no se notifica.
- Toque del mismo cliente a dos botones distintos: dos avisos distintos (mensajes entrantes distintos).
- Reintento del trabajador tras caída entre el guardado y el encolado: el reintento del proveedor vuelve a entrar por la rama de mensaje duplicado y **sí** encola.
- n8n lento (cerca del timeout): se cuenta como fallo reintentable.

## 9. Datos y contratos

- **Entradas:** `message.received` de Zernio con `metadata.buttonPayload` y `metadata.quotedMessage.platformMessageId`.
- **Cola:** `outbox_events` con `event_type = 'n8n.whatsapp.button_tap'`, `aggregate_type = 'conversation'`, `aggregate_id` = conversación, `payload` = aviso, `idempotency_key` = uuid derivado del mensaje entrante.
- **Salida hacia n8n** (`POST` al webhook configurado, `Authorization: Bearer <secreto>`, `Idempotency-Key`):
  ```json
  {
    "event": "whatsapp.button_tap",
    "occurredAt": "2026-10-08T18:57:29.122Z",
    "conversationId": "…",
    "contactId": "…",
    "messageId": "…",
    "buttonPayload": "Asistiré",
    "template": { "name": "notificacion_48h", "language": "es_MX" }
  }
  ```
- **Variables nuevas del trabajador:** `N8N_AGENT_WEBHOOK_URL`, `N8N_AGENT_AUTH_SECRET`.
- **Persistencia:** sin migración. La tabla de cola ya tiene estado, intentos, código de fallo y clave única por espacio.

## 10. Seguridad y privacidad

- Autorización: el webhook se autentica con un secreto compartido; n8n consulta el resto con su credencial de máquina (`/v1/tools/...`).
- Minimización: solo identificadores internos y el texto del botón. Sin teléfonos, nombres, correos ni cuerpos.
- El secreto vive solo en el trabajador; no se registra ni viaja al navegador.
- HTTPS obligatorio para el webhook: una URL sin `https` se rechaza al arrancar.
- Amenaza considerada: un tercero que descubra la URL no puede inyectar avisos sin el secreto, y no recibe datos personales si lo descubre.

## 11. Observabilidad

- Logs seguros: `worker.n8n_notification_skipped` (motivo), `worker.n8n_notification_failed` (código), `worker.n8n_notification_dispatched` (identificador del evento).
- Estados visibles en `outbox_events`: `pending`, `processing`, `completed`, `failed` con `failure_code`.
- Alertas: eventos `failed` con `n8n_http_401` (secreto equivocado) o `n8n_unreachable`.

## 12. Migración y rollback

- Sin migración de esquema: se reutiliza la cola existente con un `event_type` propio.
- Compatibilidad: el despacho de mensajes filtra por su propio `event_type`, así que no toca los avisos ni al revés.
- Rollback: vaciar la URL del webhook detiene las notificaciones nuevas; los eventos ya encolados terminan como `failed` visibles.

## 13. Plan de pruebas

- **Unitarias:** lectura del toque (con y sin `buttonPayload`, con y sin `quotedMessage`); derivación estable del uuid; validación del aviso.
- **Integración:** el toque encola una vez y solo si el citado es una plantilla nuestra; un reenvío no duplica; el aviso sale con la forma y las cabeceras pactadas.
- **Antiatajo:** variantes (payload vacío, citado ajeno, citado de texto), límites (texto largo del botón), estado inválido (sin URL configurada) y repetición (reintento y reenvío).

## 14. Criterios de aceptación

- [ ] Un toque de botón de `notificacion_48h` llega a n8n con el contrato pactado.
- [ ] El mismo toque reenviado por el proveedor no produce un segundo aviso.
- [ ] Un `4xx` de n8n no se reintenta; un `5xx` o un timeout sí, hasta 3 intentos.
- [ ] El despacho de mensajes de la bandeja no se ve afectado.
- [ ] Los avisos no llevan teléfonos, nombres, correos ni cuerpos.
- [ ] Todos los controles de calidad aplicables pasan.
- [ ] Documentación y decisiones actualizadas.
