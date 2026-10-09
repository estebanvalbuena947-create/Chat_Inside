# Conexión de los flujos a WEPLASH — procedimiento

Todo lo que hay que hacer, en orden, para que los flujos dejen de depender de ManyChat. Cada paso
lleva **su comprobación**: si algo falla, se sabe en ese paso y no tres más adelante.

**Mientras el interruptor de envío esté apagado, nada de esto le escribe a un cliente.** Se puede
conectar y probar entero sin riesgo. Es la garantía central de esta migración.

---

## Paso 0 · Antes de tocar n8n

**a) Aplicar las cinco migraciones** en Supabase (SQL Editor):

```
supabase/migrations/20261006093000_add_bot_sending_switch.sql
supabase/migrations/20261006180000_add_branch_services.sql
supabase/migrations/20261006210000_add_contact_fields.sql
supabase/migrations/20261007093000_add_message_templates.sql
supabase/migrations/20261007180000_add_branch_media_channel.sql
```

**b) Sembrar los precios** — el `insert ... cross join` que está en el informe de la ronda 8.

**c) Desplegar el código**: `git add -A` → `commit` → `push` → en el servidor `git pull && bash deploy.sh`.

> **El despliegue va ANTES de reimportar los flujos.** Los nodos de envío mandan claves de
> idempotencia legibles (`catalogo-123`), y la clave se traduce a UUID **en la API**. Con el código
> anterior desplegado, esas claves siguen siendo inválidas y el envío responde 422.

**Comprobación**: los tres servicios en `1/1` y:

```powershell
curl.exe -s -i -H "Authorization: Bearer TU_TOKEN" "https://apichat.insidespa.com.mx/v1/tools/branches/polanco/services" | Select-Object -First 4
```

Debe dar **200**. Si da 404, falta desplegar. Si da 401, el token.

**d) Direcciones permitidas en Supabase** (_Authentication → URL Configuration_):

```
https://chat.insidespa.com.mx
https://chat.insidespa.com.mx/auth/password
```

---

## Paso 1 · La puerta (el traductor)

Es **el** paso. Los demás dependen de él.

El flujo `Flujos_v2/Sara ZNO - (v2).json` **ya
trae el nodo** `Traducir aviso de WEPLASH1` entre el webhook y el resto. El archivo
`Flujos_v2/nodo-traductor-entrada.json` es la **fuente de verdad** del código: si hay que pegarlo a
mano, se copia de ahí, y su nota explica qué hace.

**Comprobación — y es la más importante de todo el documento:**

Manda un mensaje real desde tu teléfono y **sigue el turno hasta el extractor**. La comprobación no es
que `body` traiga el texto, sino que el texto **sobreviva la puerta**:

| Nodo                        | Qué debe traer                                                         |
| --------------------------- | ---------------------------------------------------------------------- |
| `Traducir aviso de WEPLASH` | `body` como **objeto**, con `body.last_input_text` = texto del cliente |
| `Edit Fields6`              | `Respuesta_definitiva` con ese mismo texto, **no vacío**               |
| `Extractor de reserva1`     | `intencion` acorde al mensaje, no `informacion` con todo en nulo       |

Mirar solo `body` **no basta, y ya dio un falso visto bueno una vez**: el traductor ponía el texto en
`body` **como cadena**, la ejecución se veía correcta y `Edit Fields6` —que lee
`body.last_input_text` y `body.custom_fields.Respuesta_definitiva`, la forma de ManyChat— lo recibía
vacío. El bot saludaba en lugar de responder, y el aviso parecía bien traducido.

Si `Respuesta_definitiva` está **vacío**, es un desajuste de envoltura entre nuestro aviso y el
webhook. Y es un fallo **silencioso**: no da error, solo deja al bot mudo. Se reconoce porque
**todos** los campos salen vacíos a la vez y el agente contesta un saludo genérico en lugar de
responder lo que se preguntó.

> **Quita el nodo `Filter`.** Se puso para probar con un solo contacto y sólo deja pasar a ese
> `subscriber_id`. En el archivo del repositorio ya no está; si tu instancia lo tiene, bórralo entre
> el traductor y `Comprobar pausa del contacto`. Con él puesto, el bot atiende a **una** persona.

---

## Paso 2 · Los ocho nodos de envío

Son los que escriben al cliente. Están migrados al contrato de `POST /v1/tools/messages` y cada uno
tiene que cumplir tres cosas:

| Qué          | Cómo                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| Conversación | `$('Detectar imagen ManyChat2').first().json.subscriber_id`                      |
| Clave        | `"<propósito>-{{ $execution.id }}"` (la API la convierte en UUID)                |
| Texto        | los dos campos `output.data[0]` y `output.data[1]` del nodo que prepara el texto |

**Por qué la conversación sale de ahí y no de `$json`:** `Enviar mensaje` y `Set AI Answers` vienen de un
nodo Code que sólo devuelve `{ output: { data: [...] } }`; en ese punto `$json.subscriber_id` **no
existe** y el envío respondería `422 Hace falta conversationId`. `Detectar imagen ManyChat2` corre
siempre, tanto en la ruta de texto como en la de archivos, así que es el único origen fiable.

**Por qué la clave lleva el turno:** la columna `messages.idempotency_key` es de tipo `uuid` y la
clave identifica **un** envío. Con una clave fija por contacto (`send-flow-<subscriber_id>`), el
segundo mensaje distinto de la misma conversación chocaba con la idempotencia y respondía **409**
(_"la clave ya fue usada para otro mensaje"_): el bot decía una frase y nunca más.

| Nodo                                         | Clave                     | Contenido       |
| -------------------------------------------- | ------------------------- | --------------- |
| `Enviar mensaje`                             | `send-flow`               | texto           |
| `Enviar mensaje comprobante pendiente`       | `comprobante-pendiente`   | texto           |
| `Enviar aclaración imagen no relacionada`    | `imagen-no-relacionada`   | texto           |
| `Enviar mensaje revisión Banxico`            | `revision-banxico`        | texto           |
| `Enviar plantilla Banxico alternativa`       | `banxico-alternativa`     | texto           |
| `catalogo_pdf`                               | `catalogo`                | texto (enlace)  |
| `foto_accesorios`                            | `foto-accesorios`         | sólo multimedia |
| `Enviar foto_accesorios Banxico alternativa` | `foto-accesorios-banxico` | sólo multimedia |

Los dos de multimedia **no llevan texto**: mandan `media: [{ branchMediaId }]` y la clave sigue siendo
obligatoria, porque es la que impide mandar la misma foto dos veces.

**El texto tiene que entrar escapado, y esto rompió el bot una vez.** El cuerpo es un JSON escrito a
mano, y n8n sustituye cada `{{ … }}` por el valor **tal cual**: si la respuesta del agente trae un
salto de línea, una comilla o una barra invertida, el JSON deja de ser válido y el nodo falla con
_«Bad control character in string literal»_ **antes** de mandar nada. Con ManyChat no pasaba porque el
texto no viajaba en el cuerpo: se leía de campos personalizados. Así que el miembro `text` se arma
siempre con el escape:

```
={
  "conversationId": "{{ $('Detectar imagen ManyChat2').first().json.subscriber_id }}",
  "idempotencyKey": "send-flow-{{ $execution.id }}",
  "text": "{{ JSON.stringify(String($('Code in JavaScript').first().json.output.data[0].field_value ?? '')).slice(1, -1) }}\n\n{{ JSON.stringify(String($('Code in JavaScript').first().json.output.data[1].field_value ?? '')).slice(1, -1) }}"
}
```

El `\n\n` de en medio va **fuera** de las interpolaciones: es el salto que separa las dos partes y la
API lo usa para partirlas en dos mensajes. Los identificadores (`conversationId`, `idempotencyKey`) no
se escapan: los genera nuestra plataforma y no pueden romper el JSON, así que se leen mejor tal cual.
`apps/api/src/tools/flow-payloads.test.ts` exige este escape en los seis flujos y lo comprueba en cada
`pnpm test`.

### Los verificadores: leen NUESTRA respuesta

Los dos nodos de verificación venían del mundo ManyChat y esperaban `status: "success"` en la raíz. La
respuesta de nuestra API es otra:

```json
{ "item": { "id": "uuid", "status": "queued", "body": "…" }, "tenantId": "uuid" }
```

| Nodo                                     | Qué comprueba ahora                                    |
| ---------------------------------------- | ------------------------------------------------------ |
| `Verificar envío de respuesta ManyChat`  | `item.id` y `item.status` en `queued`/`sending`/`sent` |
| `Verificar campos de respuesta ManyChat` | `contactId` y una lista `fields`                       |
| `Informar resultado de transferencia`    | `assignedUserId` (no `status: "success"`)              |

Esto importa más de lo que parece: el mensaje se encola **antes** de que el verificador hable, así que
un verificador que exige la forma vieja **deja al cliente con el mensaje recibido y la ejecución
marcada como fallida**, saltándose el registro de la última interacción y el seguimiento.

**Comprobación**: con el interruptor apagado, `Enviar mensaje` debe responder **422** _"el envío del bot
está apagado"_. Esa respuesta es la buena noticia: significa que llegó hasta el envío y que el
`conversationId` y la clave ya son válidos. Cualquier otro 422 (conversación o clave) es de este paso.

---

## Paso 3 · Los campos del contacto

Estos nodos **no envían mensajes**: guardan datos del contacto en nuestra base.

| Nodo                                    | Cuerpo                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `Set AI Answers`                        | `{ "conversationId": …, "fields": $json.output.data }` |
| `Guardar mensaje comprobante`           | igual                                                  |
| `Guardar mensaje imagen no relacionada` | igual                                                  |
| `Guardar mensaje revisión Banxico`      | igual                                                  |

`Set AI Answers` **no mandaba cuerpo**: con el cuerpo vacío el extremo responde
`422 Hace falta contactId o conversationId`, y como el nodo no tiene manejo de error, la ejecución
**moría ahí mismo, antes de enviar nada** — por eso el bot no contestaba aunque el agente ya hubiera
redactado.

El `conversationId` tampoco puede salir de `$json` en ese nodo, por el mismo motivo que en el paso 2.
La herramienta resuelve el contacto a partir de la conversación: el flujo no tiene que buscarlo antes.

**Comprobación**: al ejecutarse debe aparecer una fila en `contact_fields` con el `field_name`
esperado. Si se ejecuta dos veces, **sigue habiendo una sola fila**.

---

## Paso 4 · Las transferencias a una asesora

Derivan la conversación y apagan el bot en el mismo acto.

| Nodo                                                                                                       | Destino                      |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `Transferir_al_asesor` · `Transferir por consulta inconsistente` · `Avisar al asesor del cambio pendiente` | `POST /v1/tools/assignments` |

Cuerpo: `{ "conversationId": …, "turnBotOff": true }`, **sin `userId`**.

Sin `userId` la API reparte por rotación entre quien tiene la bandeja abierta en ese momento: la
bandeja manda un pulso cada minuto mientras la pestaña está visible y la presencia vence a los dos
minutos. Es lo que evita que una transferencia dependa de una sola persona: antes los tres nodos
llevaban el UUID del supervisor escrito a mano, y si no estaba, la conversación esperaba a alguien que
no iba a contestar.

Si no hay nadie con la bandeja abierta, la transferencia responde **422** y la conversación no cambia;
n8n lo ve y puede avisar. Si se quiere derivar a una persona concreta a propósito, se manda `userId` con
una membresía del espacio (la API responde 422 si no lo es).

**Comprobación**: con la bandeja abierta en el navegador, la conversación aparece **asignada** en la
bandeja a esa persona y el modo de automatización queda apagado. Con dos personas y dos transferencias
seguidas, cada una recibe una distinta.

---

## Paso 5 · El catálogo de imágenes — ya arreglado

Los tres nodos `Multimedia_Valle`, `Multimedia_Juarez` y `Multimedia_Lomas` estaban incoherentes
(un GET al catálogo con cuerpo de mensaje) y **ya están corregidos** en el archivo. Al reimportar,
quedan bien.

Los envíos de foto (`foto_accesorios`, `Enviar foto_accesorios Banxico alternativa` y los seis de
4.2/4.5) ya **no llevan un identificador escrito a mano**: piden la imagen por su título,
`media: [{ "branchMediaTitle": "Accesorios" }]`, y la API la busca dentro de la sede de la
conversación. Un UUID copiado a mano solo podía existir en el espacio donde se copió, y su fallo se
llevaba por delante también el texto del mensaje.

Falta **subir las imágenes** a `branch-media` y sus filas en `branch_media`, titulando «Accesorios» la
que acompaña a la confirmación de pago — el procedimiento está en
`docs/procedimiento-multimedia-sedes.md`. Mientras esa imagen no exista, el envío responde **422** con
el motivo y no encola nada.

**Comprobación**: `GET /v1/tools/branches/valle/media` devuelve las direcciones firmadas y una de ellas
se titula «Accesorios».

---

## Paso 6 · El contenido que creíamos que había que traer

Durante un tiempo este paso decía que era **el único bloqueo real**: nueve flujos de mensaje cuyo
contenido vivía dentro de ManyChat, con su lista nodo por nodo en un documento aparte.

**No era un bloqueo, y el documento con la lista se retiró.** Los nodos de ManyChat eran
**transporte, no contenido**: se usaban porque no se puede enviar un mensaje directo al cliente sin
activar un flujo, y las imágenes que enviaban son las que ahora sirve nuestra base de datos. El
contenido no se recupera: se sustituye.

Lo que queda de aquel paso es la multimedia por sede, que ya funciona:
`GET /v1/tools/branches/{sede}/media` devuelve sus direcciones firmadas.

---

## Paso 7 · Encender el envío

**Solo cuando todo lo anterior esté probado.** Es el momento en que el bot empieza a escribirle a
clientes reales:

```sql
update public.bot_integrations
set sending_enabled = true, updated_at = now()
where tenant_id = 'b8b53c64-00c4-4739-a7ac-b8fc84ea0b72';
```

Y para apagarlo, lo mismo con `false`. **Se revierte en un segundo**, sin desplegar nada.

**Comprobación**: `POST /v1/tools/messages` pasa de responder **422** (_"el envío del bot está
apagado"_) a aceptar el mensaje. Y el cliente recibe la respuesta.

---

## El orden importa

```
0. Migraciones + despliegue + direcciones   ← el despliegue, antes de reimportar
1. Traductor en la puerta        ← verificar que 'Respuesta_definitiva' llegue con texto
   (y quitar el 'Filter' de prueba)
2. Los ocho nodos de envío       ← conversación, clave por turno y verificadores
3. Campos del contacto           ← 'Set AI Answers' incluido: no mandaba cuerpo
4. Transferencias                ← con el 'userId' de una membresía real
5. Catálogo + imágenes
6. Contenido de ManyChat
7. Encender el envío             ← último, y reversible
```

**Nada de esto le escribe a un cliente hasta el paso 7.** Y en el paso 7 se enciende con una fila y
se apaga con la misma fila.

---

## Si el bot sigue mudo

En este orden, que es el orden en que se rompe:

1. **La ejecución muere antes de enviar.** Busca el nodo que falló. Si es `Set AI Answers`, le falta el
   cuerpo (paso 3). Si es `Enviar mensaje`, es la conversación o la clave (paso 2).
2. **El mensaje se encoló y la ejecución falla después.** Es un verificador que sigue esperando
   `status: "success"` (paso 2). El cliente recibió el mensaje igual.
3. **Responde una vez y luego nunca.** La clave de idempotencia es fija por contacto: tiene que llevar
   el turno (paso 2).
4. **El agente saluda en lugar de responder.** `Respuesta_definitiva` llega vacía: es la puerta
   (paso 1).
5. **El bot atiende sólo a una persona.** Sigue puesto el `Filter` (paso 1).
6. **Todo lo anterior está bien y no llega nada.** El interruptor (paso 7): con él apagado la API
   rechaza el envío a propósito, y el 422 lo dice con esas palabras.

---

## Lo que falta en los demás flujos

**Ya está hecho en esta ronda.** Los nodos de envío de **4.1**, **4.2**, **4.5** y **7.1** (IG_IS e
IG_ISV) usan una clave de idempotencia por turno, leen la conversación de nuestra API y sus
verificadores leen nuestra forma (`contactId` + `fields`, o `item.id` + `item.status`), no
`status: 'success'`. Lo comprueba `apps/api/src/tools/flow-payloads.test.ts`, que lee los flujos y se
ejecuta con `corepack pnpm test`.

Lo que se corrigió, por flujo:

**4.1 Retención y liberación.** `Resolver cuenta y URL ManyChat` y `Resolver cuenta para liberación`
validaban la respuesta de ManyChat (`status: 'success'`, identificador numérico y `live_chat_url` con
`app.manychat.com`), así que la cuenta **no se resolvía nunca** y ni el recordatorio ni el aviso de
liberación salían. Ahora leen la conversación de nuestra API y publican los campos que esperan los IF
(los nombres `manychat_*` se conservan para no tocar el resto del flujo). Además: los cuatro «guardar
campos» son `POST /v1/tools/contact-fields` con `{conversationId, fields}` — antes eran un GET a una
ruta de solo lectura, con el identificador vacío y `Number(subscriber_id)`, que sobre un UUID da `NaN`
—; los cuatro verificadores leen nuestra respuesta; las cuatro claves llevan `{{ $execution.id }}`; y
`Buscar contacto fb1346079` y `Liberación - buscar contacto IS` quedaron **deshabilitados** (eran la
segunda lectura de la misma conversación, herencia de las dos cuentas de ManyChat).

**4.2 Stripe.** `Stripe resolver cuenta y canal` cortaba la rama con un `throw` en cuanto el
identificador no era numérico, de modo que **no se enviaba nada**; ahora resuelve el canal desde la
conversación. El IF `Conversión tiene cuenta configurada` tenía **las dos salidas sin cablear**: toda la
rama de conversión era inalcanzable; ahora lleva a `Cargar monto_pagado en ManyChat` y, si no hay
conversación leída, a `Conversión omitida en cuenta ISV`. El nodo de conversión apunta a
`POST /v1/tools/conversions`.

**4.5 Confirmar pago manual.** Los mismos arreglos de canal, verificación y multimedia.

**7.1 Emisor Followup.** El flujo padre `7 Followup v2 - cola global 6 por minuto 09 a 20` llamaba a
los subflujos con `workflowInputs.value: {}`, es decir, **sin ningún campo**: el subflujo recibía items
vacíos, no encontraba `conversationId` y moría en `Validar tarea de seguimiento`. Ahora manda
`conversationId`, `id`, `payload`, `scope`, `simulacion`, `subscriber_id` y `worker`. Los tres
verificadores de cada subflujo leen nuestra forma.

**Sara.** `Detectar imagen ManyChat2` solo miraba URLs de ManyChat escritas en el texto del mensaje, así
que un comprobante enviado como archivo no llegaba a la validación de pagos. Ahora lee además los
adjuntos de nuestro aviso (`weplash_evento.message.attachments`), con su tipo y su enlace firmado.

**Pendiente y fuera de esta carpeta.** Sara llama por `workflowId` a flujos que **no están** en
`Flujos_v2/`: `Inside_Spa_Conocimiento` (`vskrm14Pht5S1l3K`), `Call 'Mensqje de Errores'`
(`coFiQ7L6lHV0PXji`), `Sucursal_Mas_Cercana` (`3RSEsUTsMydoFpc0`), `Cerrar_Conversacion_Y_Pausar` y
`Ejecutar cierre sexual sin respuesta` (`rTomIKEa8xNx1ZH1`) y `Gestionar_Giftcard`
(`dCwzXZrXtipWl7KP`). Si no existen ya en n8n con esos mismos identificadores, esas rutas fallan al
ejecutarse.
