# 033 — CAPI de Meta Ads: parte 1, recolección de los datos que exige Meta

- **Estado:** propuesta
- **Responsable:** integración
- **Complementa:** `specs/019-zernio-meta-conversions-api.md`
- **Fecha:** 2026-10-01

## 1. Lo que Meta exige, y de dónde sale cada dato

| #   | Requisito de Meta                                           | De dónde sale                   | ¿Lo tenemos?                                                                                                              |
| --- | ----------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`ctwa_clid`** o el identificador del usuario en la página | `referral` del evento entrante  | **Parcial**: `referral` y `ad_id` **sí** llegan (medido: 6 apariciones en 60 eventos). `ctwa_clid` **no aparece** todavía |
| 2   | **Valor total de la cita** (no solo el depósito)            | Lógica de negocio (n8n / Pabau) | **No**: lo tendrá que enviar la fuente en la petición                                                                     |
| 3   | **Identificador de la conversación**                        | Nuestra base                    | **Sí**, y es el que correlaciona todo                                                                                     |

Medición del 2026-10-01 sobre los últimos 60 eventos: `referral` 6, `ad_id` 6, **`ctwa_clid` 0**,
`adgroup` 0, `click_id` 0.

**Interpretación honesta:** `ctwa_clid` es propio de los anuncios de **clic a WhatsApp**. Las
conversaciones actuales son de Instagram, donde Meta envía `referral` con `ad_id` pero no ese
identificador. Llegará cuando se conecte WhatsApp y el cliente venga de un anuncio CTWA.

**Conclusión operativa:** el `ctwa_clid` no puede ser el único camino. La especificación ya lo
contempla: se envía el identificador del usuario en la página (su identificador de plataforma) y,
**cuando exista**, también el `ctwa_clid`.

## 2. El hueco que hay que cerrar primero

Hoy el evento entrante **trae el `referral` y no lo guardamos**. Sin él no hay atribución posible:
ni CAPI ni saber de qué anuncio vino una conversación.

### Cambio de esquema propuesto (aditivo e idempotente)

En `conversations` (el referral llega con el inicio de la conversación, no con cada mensaje):

| Columna                            | Para qué                                           |
| ---------------------------------- | -------------------------------------------------- |
| `referral jsonb`                   | el bloque completo tal como llegó, para auditoría  |
| `ctwa_clid text`                   | el identificador de clic a WhatsApp, cuando exista |
| `ad_id text`                       | el anuncio de origen                               |
| `source_type text`                 | de dónde vino (`ad`, `post`…)                      |
| `source_id text`                   | el identificador de la publicación o anuncio       |
| `referral_captured_at timestamptz` | cuándo lo recibimos                                |

En `contacts`: `platform_user_id text` — el identificador del usuario **en la plataforma**, sin
tener que extraerlo del `external_reference` (que es un identificador interno compuesto).

## 3. Forma del evento que enviaremos a Zernio

`POST /v1/ads/conversions` con la cuenta `metaads` y el píxel ya definidos:

| Campo del evento                 | Valor                                                                    |
| -------------------------------- | ------------------------------------------------------------------------ |
| `eventName`                      | lo decide la fuente autorizada (`Purchase`, `Lead`…)                     |
| `eventTime`                      | el instante del hecho de negocio                                         |
| `eventId`                        | estable y único: `conversion:<tenant>:<fuente>:<hecho>`                  |
| `user_data`                      | identificador de plataforma del contacto **y** `ctwa_clid` cuando exista |
| `custom_data.value` / `currency` | **el valor total de la cita**, enviado por la fuente                     |
| correlación segura               | el identificador de la conversación                                      |

## 4. Configuración ya conocida

| Dato                      | Valor                      | Origen                  |
| ------------------------- | -------------------------- | ----------------------- |
| Cuenta Meta Ads en Zernio | `6abee126fc9912089da0bbd0` | aportado por el negocio |
| Píxel / Dataset           | `1892514330825530`         | aportado por el negocio |

Ambos se **validan contra Zernio** antes de activar (destinos permitidos de esa cuenta), y se
guardan en `conversion_integrations`. No se aceptan a ciegas desde la interfaz.

## 5. Fases

| #   | Fase              | Entregable                                                                                   | Bloquea a     |
| --- | ----------------- | -------------------------------------------------------------------------------------------- | ------------- |
| 1   | **Recolección**   | migración del referral y `platform_user_id`; el worker los guarda al crear la conversación   | todo lo demás |
| 2   | **Configuración** | `conversion_integrations` + validación de cuenta y píxel contra Zernio + UI de administrador | fase 3        |
| 3   | **Envío**         | outbox + worker que llama a Zernio con `event_id` estable, reintentos y DLQ                  | fase 4        |
| 4   | **Fuente**        | endpoint de tools para que n8n avise de la conversión con su valor total                     | fase 5        |
| 5   | **Prueba**        | un evento controlado con el código de prueba de Meta                                         | producción    |

## 6. Decisiones abiertas (no las puedo tomar yo)

1. **Qué hecho cuenta como conversión**: ¿la reserva confirmada? ¿con pago completo? Define el
   `eventName` y el momento del envío.
2. **Quién envía el valor total** y de dónde lo toma: es lógica de negocio, vive en n8n/Pabau.
3. **Consentimiento**: enviar datos de contacto (aunque Zernio los hashee) con fines publicitarios
   tiene implicaciones legales; conviene confirmarlo con quien lleve privacidad.
4. **WhatsApp**: sin ese canal, `ctwa_clid` no existirá y la atribución de CTWA quedará incompleta.

## 7. Por qué la fase 1 va primero

Sin el `referral` guardado, cualquier evento que enviemos irá **sin atribución**: Meta lo aceptará o
no, pero no podrá relacionarlo con el anuncio que trajo al cliente, que es justamente para lo que
sirve el CAPI. Es un trabajo pequeño (una migración y unas líneas en el worker) y desbloquea todo
lo demás.

Además tiene valor por sí solo: **saber de qué anuncio viene cada conversación** es información que
hoy se pierde y que se puede mostrar en la interfaz.

## 8. Decisiones tomadas (2026-10-01)

| Decision              | Valor                                                                     | Motivo                                                           |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Resultado del negocio | **Solo `ganado`**                                                         | Perdido queda para mas adelante; el corte es el mismo            |
| Moneda                | **MXN** por defecto                                                       | Mercado actual                                                   |
| Evento para Meta      | **`Purchase`**                                                            | Una cita ganada con valor es una compra                          |
| Origen del hecho      | **Boton "Ganado" en la conversacion** y **endpoint de tools** para el bot | Una sola regla, dos puertas                                      |
| Etiqueta configurable | **Descartada**                                                            | Era un rodeo: "ganado" es un estado del negocio, no una etiqueta |

El hecho lo puede registrar una persona o el bot; queda guardado quien fue y cuando. La migracion
obliga a que un negocio ganado traiga **siempre** valor, origen y fecha.
