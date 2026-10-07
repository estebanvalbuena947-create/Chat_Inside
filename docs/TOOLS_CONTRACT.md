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
  "idempotencyKey": "catalogo-1729",
  "text": "Hola, tu cita quedó confirmada",
  "media": [{ "branchMediaId": "uuid" }],
  "templateName": "confirmacion_ig_is"
}
```

| Campo            | Obligatorio    | Nota                                                                      |
| ---------------- | -------------- | ------------------------------------------------------------------------- |
| `conversationId` | sí             | la conversación de nuestra base                                           |
| `idempotencyKey` | sí             | **legible**: la API la convierte en UUID. Si n8n reintenta, no se duplica |
| `text`           | uno de los dos | el texto a enviar                                                         |
| `media`          | uno de los dos | por `branchMediaId` (nuestra multimedia); **una** por mensaje             |
| `templateName`   | no             | plantilla guardada en nuestra base                                        |

La `idempotencyKey` identifica **un envío**, no un contacto: una clave fija por conversación hace que
el segundo mensaje distinto responda `409`. Lo natural en n8n es `<propósito>-{{ $execution.id }}`.
La clave se traduce a UUID en la puerta (`apps/api/src/tools/idempotency-key.ts`), así que los flujos
no tienen que saber generar uno; un UUID ya válido se respeta tal cual. Un texto de más de 900
caracteres sale en **dos** mensajes, con claves derivadas distintas para que la segunda no choque con
la primera.

Respuesta `201`:

```json
{
  "item": { "id": "uuid", "status": "queued", "body": "Hola, tu cita quedó confirmada" },
  "tenantId": "uuid"
}
```

`queued` significa **encolado**, no entregado: el trabajador lo entrega después, con la misma clave.
Los verificadores de n8n tienen que leer `item.status`, no un `status` en la raíz: la forma antigua
(`status: "success"`) era de ManyChat y hace fallar la ejecución **después** de haber encolado el
mensaje.

Errores: `404` conversación o multimedia inexistente · `409` la clave ya se usó para otro mensaje de
esa conversación · `422` falta la conversación o la clave, no hay ni texto ni multimedia, o el envío
del bot está apagado en el espacio.

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
{ "conversationId": "uuid", "userId": "uuid", "turnBotOff": true }
```

`userId` tiene que ser una **membresía del espacio** (tabla `memberships`): la API comprueba que esa
persona pertenece al espacio antes de asignarle la conversación, y responde `422` si no.

Respuesta `200`:

```json
{
  "conversationId": "uuid",
  "assignedUserId": "uuid",
  "assignmentVersion": 2,
  "automationMode": "paused"
}
```

`turnBotOff` por defecto es `true`: asignar **y** apagar el bot en el mismo acto, que es lo que evita
que el bot siga contestando a alguien que ya está con una persona. El verificador de n8n debe
comprobar `assignedUserId`, no un `status: "success"` que esta respuesta no tiene.

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
