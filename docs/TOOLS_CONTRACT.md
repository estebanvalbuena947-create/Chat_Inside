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
  "templateName": "confirmacion_ig_is",
  "whatsappTemplate": { "name": "notificacion_48h", "language": "es_MX" }
}
```

| Campo              | Obligatorio    | Nota                                                                      |
| ------------------ | -------------- | ------------------------------------------------------------------------- |
| `conversationId`   | sí             | la conversación de nuestra base                                           |
| `idempotencyKey`   | sí             | **legible**: la API la convierte en UUID. Si n8n reintenta, no se duplica |
| `text`             | uno de los dos | el texto a enviar                                                         |
| `media`            | uno de los dos | por `branchMediaId` o `branchMediaTitle`; **una** por mensaje             |
| `templateName`     | no             | plantilla guardada en nuestra base (se envía como **texto**)              |
| `whatsappTemplate` | no             | plantilla **aprobada por Meta**: nombre e idioma exactos                  |

### Escribir fuera de las 24 horas: `whatsappTemplate`

WhatsApp solo admite texto o multimedia durante las **24 horas** siguientes al último mensaje del
cliente. Fuera de ese plazo la única forma de escribir es una plantilla **aprobada por Meta**, y para
eso está `whatsappTemplate`:

```json
{
  "conversationId": "uuid",
  "idempotencyKey": "recordatorio-{{ $execution.id }}",
  "whatsappTemplate": { "name": "notificacion_48h", "language": "es_MX" }
}
```

Es un envío **completo y de otra clase**: no lleva `text`, ni `media`, ni `templateName`, y no se
parte en dos mensajes. La API comprueba que esa plantilla pertenece a la cuenta de WhatsApp de la
conversación y que Meta la tiene aprobada; una plantilla con variables (`{{1}}`) se rechaza.

Fuera de plazo, un envío con `text` o `media` se rechaza con `422` y este motivo: _la ventana de 24
horas de WhatsApp está cerrada: envía una plantilla aprobada con `whatsappTemplate`_. Antes ese envío
lo rechazaba Meta minutos después y quedaba como un mensaje fallido que nadie miraba.

Para saber cuál de los dos caminos usar, lee `whatsappWindow` de la conversación (sección 6).

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
esa conversación · `422` falta la conversación o la clave, no hay ni texto ni multimedia, el envío
del bot está apagado en el espacio, la ventana de 24 horas de WhatsApp está cerrada, o `whatsappTemplate`
viene mezclado con texto, multimedia o `templateName`.

### Un solo camino de respuesta

**Una respuesta, un nodo.** El canal lo resuelve la API a partir de la conversación: no lo elige el
flujo. Por eso ningún flujo se ramifica por cuenta, por canal ni por los campos del contacto para
decidir cómo responde: un envío es **una** llamada a esta ruta. La única rama legítima es el error.

Vale también para los verificadores. El verificador lee `item.status` de la respuesta del POST, así
que **el nodo que envía no puede ser un `IF` ni un `Code`**: si en la cadena hay un IF donde debía
estar el envío, el verificador lee algo sin `statusCode`, publica `operacion_ok: false` con
`operacion_http_status: 0` y el mensaje nunca sale — un fallo silencioso, porque la ejecución termina
sin que el envío aparezca como error.

Los **campos del contacto no son transporte**. Escribirlos antes de enviar
(`POST /v1/tools/contact-fields`) es andamiaje del proveedor anterior: si un flujo necesita ese dato
como perfil del contacto, lo escribe sin condicionar el envío ni elegir cuenta con él.

### La identidad es el id de la conversación, no la del proveedor

Todas las rutas de conversación resuelven por `conversations.id`, que es un **UUID**. Un identificador
del proveedor anterior (numérico) no lo es y responde `404`/`422`, así que el flujo resuelve la
identidad **antes** de llamar: prefiere el id de la conversación y, si solo tiene el del proveedor, no
llama —lo reporta con su motivo—. Ningún flujo debe mandar `subscriber_id` a estas rutas.

Mientras un borrador siga trayendo el id del proveedor anterior, el envío se puede **puentear**: una
sola bifurcación, decidida por la forma del identificador —solo dígitos es del proveedor anterior; un
UUID es nuestro— que manda cada caso por su transporte. Lo que no se puentea es nada que dependa de
nuestro extremo: la **conversión** (`/v1/tools/conversions`) solo la hace la API y solo con un id de
conversación; un id del proveedor anterior la deja omitida y registrada.

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

### Compartir toda la multimedia configurada de una sede

El agente no debe listar archivos y luego limitarse a decir que los compartió. Para esa intención usa
`POST /v1/tools/branches/{slug}/media/send`:

```json
{ "conversationId": "uuid", "idempotencyKey": "multimedia-valle-{{ $execution.id }}" }
```

La API toma los archivos de esa sede en su `sort_order` y encola uno por mensaje (límite del canal).
La clave se deriva por archivo, por lo que repetir la ejecución no duplica los ya aceptados. Si la
sede no tiene material, responde `404` y no se afirma que se compartió nada.

La tarjeta titulada exactamente `Accesorios` queda fuera de este envío: es el material operativo que
usan las plantillas. Se conserva una sola copia para todo el espacio; `branchMediaTitle: "Accesorios"`
la resuelve aunque la conversación aún no tenga sede.

### Enviar una imagen por su título

Los flujos no conocen los identificadores de la base, y copiar uno a mano solo funciona en el espacio
donde se copió. Por eso un adjunto también se puede pedir por el título que ve quien carga el material:

```json
{
  "conversationId": "uuid",
  "idempotencyKey": "foto-accesorios-{{ $execution.id }}",
  "media": [{ "branchMediaTitle": "Accesorios" }]
}
```

La API busca ese título **dentro de la sede de la conversación** (la que el bot fijó en el punto 6) y
del espacio del token. La comparación no distingue mayúsculas y, si no hay coincidencia exacta, vale
que el título **contenga** la palabra: el exacto tiene preferencia, y entre iguales gana el de menor
`sort_order`. Así `accesorios`, `Accesorios` y `Accesorios spa` encuentran la misma foto, que es lo que
evita que una palabra de más deje un flujo roto. Si no hay ninguna, responde `422` y **no encola nada**.
Sin sede en la conversación tampoco se puede buscar por título.

**Antes de activar un flujo que la use**: sube la imagen y titúlala. El procedimiento, con la lista de
títulos acordada y cómo corregir uno ya cargado, está en `docs/procedimiento-multimedia-sedes.md`.

## 4. Transferir a un asesor — `POST /v1/tools/assignments`

Sustituye a **`Transferir_al_asesor`**.

```json
{ "conversationId": "uuid", "turnBotOff": true }
```

Sin `userId`, la API asigna de forma rotativa a la siguiente persona con la bandeja activa. Si se
incluye `userId`, conserva la asignación explícita y comprueba su membresía.

**Qué cuenta como «bandeja activa».** La bandeja de esa persona manda un pulso autenticado a
`POST /v1/tenants/{tenantId}/presence` cada minuto, y solo mientras la pestaña está visible. La
presencia vence a los dos minutos: un navegador cerrado deja de contar sin cerrar sesión, y un pulso
perdido no saca a nadie del reparto. El orden es rotativo por espacio y lo decide PostgreSQL, así que
dos transferencias simultáneas no reciben a la misma persona.

**Quién entra en el reparto.** Solo las membresías con rol `agent`: un administrador o un supervisor
puede tener la bandeja abierta, pero no recibe transferencias automáticas. La lista de roles vive en un
solo sitio (`v_roles`, en `claim_next_active_advisor`); sumar otro rol es cambiar esa lista, sin tocar
los flujos ni la API. Si se quiere derivar a una persona concreta, se manda su `userId`.

**La presencia ordena, no descarta.** Primero se entrega a quien tiene la bandeja abierta en ese
momento; si no hay nadie, la conversación se entrega igual al siguiente agente del turno, que la
encontrará al abrir la bandeja. Es preferible que tenga dueño y espere a que la transferencia falle y
el cliente se quede sin respuesta. El `422` queda para el único caso en que no hay a quién entregarla:
un espacio sin ninguna membresía con el rol que atiende.

**Si se incluye**, `userId` tiene que ser una **membresía del espacio** (tabla `memberships`): la API
comprueba que esa persona pertenece al espacio antes de asignarle la conversación, y responde `422` si
no.

Errores propios de la rotación:

- `422` **no hay nadie que atienda**: el espacio no tiene ninguna membresía con el rol de agente. Que
  nadie tenga la bandeja abierta **no** produce este error: la conversación se entrega al siguiente
  agente del turno y le espera. Cuando sí ocurre, la conversación **no cambia**: es un fallo visible a
  propósito, para que n8n avise en lugar de dejar la conversación marcada como derivada a nadie.
- Repetir la misma petición no cambia de persona: si la conversación ya está asignada y el bot apagado,
  la respuesta `200` devuelve esa misma asignación sin gastar el turno de la rotación. Así un reintento
  de n8n por un timeout no mueve la conversación a otra asesora.

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
  "lastMessageAt": "2026-09-30T12:28:00.000Z",
  "whatsappWindow": {
    "open": false,
    "lastInboundAt": "2026-10-07T18:00:00.000Z",
    "expiresAt": "2026-10-08T18:00:00.000Z"
  }
}
```

### `whatsappWindow`: si puedes escribir o tienes que usar plantilla

- `open: true` → el cliente escribió hace menos de 24 horas: puedes mandar `text` o `media`.
- `open: false` → la ventana está cerrada: manda `whatsappTemplate` (sección 1). Un `text` o un
  `media` en ese momento se rechaza con `422`.
- `null` → **no aplica o no se puede afirmar**: la conversación no es de WhatsApp, o no hay ningún
  mensaje entrante registrado (por ejemplo un hilo que empezó desde un anuncio). Ahí decide el
  proveedor, así que inténtalo por el camino normal.

El dato lo calcula el servidor; los flujos no tienen que restar horas ni conocer el plazo.

## 6. Sede de la conversación — `POST /v1/tools/conversations/{id}/branch`

El bot decide la sede mientras conversa; aquí la deja fijada.

```json
{ "branchSlug": "lomas" }
```

## 6 bis. Cerrar la conversación y apagar el bot — `POST /v1/tools/conversations/{id}/close`

Es lo que el bot necesita cuando decide **no seguir hablando**: cerrar el hilo y dejar de responder. Va
en una sola llamada a propósito: cerrar sin apagar dejaría al bot contestando en una conversación
cerrada, y apagar sin cerrar la dejaría pendiente de atención cuando ya no lo está.

```json
{ "pauseBot": true }
```

`pauseBot` es `true` por defecto; con `false` cierra el hilo **sin** tocar el interruptor del bot, para
cuando el negocio quiera cerrar la conversación y dejar al bot disponible si el cliente vuelve a
escribir. Respuesta:

```json
{ "conversationId": "uuid", "status": "resolved", "automationMode": "paused", "tenantId": "uuid" }
```

La fecha de cierre se sella al cerrar y **se limpia al reabrir**, que es lo que permite contar cuántas
se cerraron en un periodo. Un mensaje entrante del cliente reabre la conversación por sí solo.

Repetirlo es inofensivo: si ya está cerrada, la respuesta devuelve el estado vigente sin escribir nada.
Si alguien movió la conversación entre la lectura y la escritura, la respuesta es `409` en lugar de
pisar el cambio en silencio. Errores: `404` conversación inexistente · `422` falta el identificador.

## 6 ter. Encender o apagar el bot — `POST /v1/tools/conversations/{id}/automation`

Sirve para lo contrario: pausar un hilo que sigue abierto —por ejemplo mientras una persona lo
atiende— y volver a encenderlo después.

```json
{ "mode": "paused" }
```

`mode` es `auto`, `suggest` o `paused`. Responde lo mismo que el cierre, sin `pauseBot`. Igual que
aquel, es idempotente y responde `409` si la conversación cambió.

## 7. Etiquetas — `POST /v1/tools/conversations/{id}/labels`

```json
{ "labels": ["pago_confirmado"] }
```

Crea la etiqueta si no existe en el espacio (con su color pastel) y la aplica.

## 7 bis. Reseñas de Google — `POST /v1/tools/reviews/{id}/reply` y `…/route`

`{id}` acepta nuestro identificador o el **nombre de recurso de Google** que llega en el aviso
(`accounts/…/locations/…/reviews/AbC`), para que el flujo no tenga que traducir nada.

### Responder

```json
{ "templateCode": "resena_google_positiva", "variables": { "nombre": "Marta" } }
```

o, con el texto escrito en la petición:

```json
{ "comment": "Gracias por tu visita, Marta." }
```

La plantilla sale de la tabla de plantillas del espacio y sus huecos `{nombre}` se rellenan aquí: un
hueco sin valor responde `422` con la lista de los que faltan, porque publicar en Google un texto con
`{nombre}` a la vista es peor que fallar.

Respuesta `200`:

```json
{
  "reviewId": "accounts/…/reviews/AbC",
  "repliedAt": "2026-10-12T18:20:00.000Z",
  "source": "bot",
  "tenantId": "uuid"
}
```

**Google conserva una sola respuesta del propietario**: publicar otra reemplaza la anterior, incluida
una escrita a mano, y no hay historial. Por eso una reseña que ya tiene respuesta responde `409` y no
se toca nada. Errores: `404` reseña inexistente en el espacio · `422` texto o plantilla inválidos.

### Derivar a una persona

`POST /v1/tools/reviews/{id}/route`, sin cuerpo. Marca la reseña como pendiente de una persona y la
deja en el apartado **Reseñas** de la interfaz. Es idempotente: repetirlo conserva el momento en que
se derivó. Es lo que usa el bot con las de una a tres estrellas.

### Verlas

`GET /v1/tools/reviews?pending=false` devuelve las del espacio; por defecto, las que siguen sin
respuesta. Sirve para comprobar desde n8n que una reseña quedó registrada.

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
