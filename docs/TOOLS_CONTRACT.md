# Contrato de las tools (n8n → WEPLASH → Zernio)

Esta es la puerta que usan los flujos nuevos de `Flujos_v2/`. Todos los envíos salen **por Zernio** a
través de nuestra API, nunca directo: así el mensaje queda en el hilo, con su acuse y su auditoría.

## Autenticación

```
Authorization: Bearer <token de máquina>
```

El token **identifica el espacio**: por eso ninguna ruta lleva `tenantId`. Se crea desde la UI
(administradores) y su valor en claro se muestra **una sola vez**: en la base solo queda el hash.
Un token revocado responde `401`.

**Variables en n8n:** `WEPLASH_API_URL` (base) y `WEPLASH_TOOL_TOKEN` (el token).

Códigos comunes: `401` token inválido o revocado · `403` al token le falta el alcance · `404` no
existe · `422` datos inválidos.

## 1. Enviar un mensaje — `POST /v1/tools/messages`

Sustituye a los **38 nodos** que hoy llaman a `api.manychat.com` para enviar.

```json
{
  "conversationId": "uuid",
  "idempotencyKey": "flujo-4.2-paso-7-<mensaje>",
  "text": "Hola, tu cita quedó confirmada",
  "media": [{ "branchMediaId": "uuid" }],
  "templateName": "confirmacion_ig_is"
}
```

| Campo            | Obligatorio          | Nota                                                 |
| ---------------- | -------------------- | ---------------------------------------------------- |
| `conversationId` | sí                   | la conversación de nuestra base                      |
| `idempotencyKey` | **muy recomendable** | si n8n reintenta, no se duplica el mensaje           |
| `text`           | uno de los dos       | el texto a enviar                                    |
| `media`          | uno de los dos       | por `branchMediaId` (nuestra multimedia) o por `url` |
| `templateName`   | no                   | plantilla guardada en nuestra base                   |

Respuesta `201`:

```json
{ "messageId": "uuid", "providerMessageId": "zernio:...", "status": "sent" }
```

Errores: `404` conversación o multimedia inexistente · `422` ni texto ni multimedia · `502` Zernio
no disponible (n8n puede reintentar con la misma `idempotencyKey`).

## 2. Sedes — `GET /v1/tools/branches`

```json
{ "items": [{ "id": "uuid", "slug": "juarez", "name": "Juárez", "isActive": true }] }
```

## 3. Multimedia de una sede — `GET /v1/tools/branches/{slug}/media`

Sustituye a **`Multimedia_Valle`, `Multimedia_Juarez`, `Multimedia_Lomas`**.

```json
{
  "items": [
    { "id": "uuid", "kind": "image", "title": "Fachada", "url": "https://…firmada", "sortOrder": 0 }
  ]
}
```

La `url` es **firmada y caduca** (10 minutos): se pide justo antes de enviarla. Para enviarla, usa su
`id` en `media[].branchMediaId` y deja que la API resuelva la URL.

## 4. Transferir a un asesor — `POST /v1/tools/assignments`

Sustituye a **`Transferir_al_asesor`**.

```json
{ "conversationId": "uuid", "advisorEmail": "asesor@ejemplo.com", "turnBotOff": true }
```

Respuesta `200`:

```json
{ "conversationId": "uuid", "assignedUserId": "uuid", "automationMode": "off" }
```

`turnBotOff` por defecto es `true`: asignar **y** apagar el bot en el mismo acto, que es lo que evita
que el bot siga contestando a alguien que ya está con una persona.

## 5. Estado de la conversación — `GET /v1/tools/conversations/{id}`

Sustituye a las **16 lecturas** que hoy van a ManyChat (`Buscar contacto`, `Leer contacto`,
`Cargar campos`…).

```json
{
  "id": "uuid",
  "status": "open",
  "automationMode": "auto",
  "branch": { "slug": "polanco", "name": "Polanco" },
  "assignedUserId": null,
  "contact": {
    "id": "uuid",
    "name": "Ale Favela",
    "username": "ale.favela",
    "platform": "instagram"
  },
  "labels": ["pago_pendiente"],
  "lastMessageAt": "2026-09-30T12:28:00.000Z"
}
```

## 6. Sede de la conversación — `POST /v1/tools/conversations/{id}/branch`

El bot decide la sede mientras conversa; aquí la deja fijada.

```json
{ "branchSlug": "lomas" }
```

## 7. Etiquetas — `POST /v1/tools/conversations/{id}/labels`

```json
{ "labels": ["pago_confirmado"] }
```

Crea la etiqueta si no existe en el espacio (con su color pastel) y la aplica.

## 8. Conversión ganada — `POST /v1/tools/conversions`

Sustituye al nodo **CAPI de ManyChat**: cuando el pago se confirma —solo, o aprobado a mano— el flujo
marca la conversión y el trabajador la entrega a Meta.

```json
{
  "conversationId": "uuid",
  "amount": 1998,
  "currency": "MXN",
  "occurredAt": "2026-10-07T15:00:00.000Z"
}
```

`conversationId` y `amount` son obligatorios; `currency` es `MXN` por defecto y `occurredAt` es ahora.

Respuesta `200`:

```json
{ "queued": true, "conversationId": "uuid", "tenantId": "uuid" }
```

Y si la integración de conversiones está apagada:

```json
{ "queued": false, "reason": "La integracion de conversiones no esta activa." }
```

También con `200`: no es un fallo del flujo, es que ese espacio no manda conversiones a Meta.

**Una conversión por conversación.** La clave del evento es estable, así que un reintento de n8n no
cuenta la compra dos veces: Meta la deduplica. El alcance es **`conversations`**, no uno propio, para
no obligar a reemitir el token de quien ya está en producción.

Errores: `404` conversación inexistente · `422` falta el importe o la conversación.

## Qué NO pasa por aquí

Disponibilidad, reservas, pagos, catálogo y la memoria del agente: eso es **lógica** y se queda donde
está (su base y las llamadas HTTP a Pabau, Stripe y Sheets). Estas tools son solo el lado del canal:
**enviar, compartir material, asignar y consultar el estado**.

## Orden de trabajo sugerido en n8n

1. Ajustar los **38 nodos de envío** al cuerpo del punto 1 (es el 63% del trabajo).
2. Ajustar las **16 lecturas** al punto 5: casi todas son "dame el contacto".
3. `Transferir_al_asesor` (punto 4) y las **3 multimedia** (punto 3).
4. Probar **en seco** contra el endpoint antes de activar cualquier flujo.
