# Especificación: el bot sabe si puede escribir o si tiene que usar plantilla

- **Estado:** aprobada
- **Responsable:** `apps/api/src/tools` (puerta del bot); la política de la ventana vive en el dominio
- **Fecha:** `2026-10-08`

## 1. Problema

El bot responde con **texto libre** siempre. WhatsApp solo admite texto libre durante las **24 horas**
siguientes al último mensaje del cliente; fuera de ese plazo exige una plantilla aprobada. Cuando el
bot escribe tarde, Meta rechaza el envío con `400`, el mensaje queda `failed` en la cola y **el
cliente no recibe nada**. Ocurrió el 2026-10-07 a las 19:28 con una respuesta automática, y nadie se
enteró: no hay pantalla que lo avise y el flujo cree que respondió.

## 2. Resultado esperado

Al leer una conversación, el bot recibe **si la ventana está abierta**. Y al enviar, la puerta del bot
**rechaza el texto libre cuando la ventana está cerrada en WhatsApp**, con un motivo que dice qué
hacer: usar una plantilla aprobada. Así el fallo deja de aparecer minutos después como un mensaje
perdido y pasa a ser un error inmediato y accionable. El bot además puede enviar la plantilla.

## 3. No objetivos

- Decidir por el bot **qué** plantilla mandar: eso es del flujo, no de la plataforma.
- Aplicar la regla a Instagram, Messenger o TikTok: no se ha verificado su ventana, así que no se
  supone.
- Cambiar el compositor de la bandeja (una persona que escribe fuera de plazo sigue viendo el fallo
  del mensaje, como hoy).
- Soportar plantillas con variables: sigue rechazado en este corte.
- Retirar las plantillas internas (`message_templates`), que sirven para responder dentro de plazo.

## 4. Actores y permisos

| Actor                                | Puede                                                                    | No puede                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Flujo de n8n (credencial de máquina) | Leer la ventana, enviar texto dentro de plazo, enviar plantilla aprobada | Enviar texto libre fuera de plazo, usar una plantilla de otra cuenta, mandar variables |
| Persona en la bandeja                | Escribir como hoy                                                        | —                                                                                      |
| Proveedor (Meta)                     | Aceptar plantilla fuera de plazo                                         | Aceptar texto libre fuera de plazo                                                     |

## 5. Reglas e invariantes

1. La **ventana** de WhatsApp son 24 horas desde el último mensaje **entrante** de esa conversación.
2. La ventana se calcula **en el servidor**, una sola vez y con una sola fórmula; los flujos no la recalculan.
3. El servidor informa la ventana como `{ open, lastInboundAt, expiresAt }`, y devuelve `null` cuando **no hay ningún mensaje entrante registrado**: sin ese dato no se puede afirmar que esté cerrada.
4. Un envío de **texto libre** por WhatsApp con la ventana **conocida y cerrada** se rechaza con `422` y un motivo que nombra la alternativa (la plantilla). No se encola nada.
5. Si la ventana no se conoce (sin entrante registrado), el envío **no** se bloquea: decide el proveedor. Se prefiere un rechazo del proveedor a inventar una ventana cerrada.
6. Una **plantilla aprobada** se puede enviar en cualquier momento, con la ventana abierta o cerrada.
7. La regla aplica **solo a WhatsApp**. En otros canales la lectura devuelve `null` y el envío no cambia.
8. El envío con plantilla conserva las garantías del camino existente: interruptor del bot, espacio del token, comprobación de catálogo por cuenta de la conversación, idempotencia y cola.

## 6. Flujo principal

1. n8n lee la conversación: recibe `whatsappWindow.open`.
2. Si está abierta, envía su texto como siempre.
3. Si está cerrada, envía una plantilla aprobada con `whatsappTemplate`.
4. La puerta del bot comprueba canal, ventana y catálogo, y encola.
5. El trabajador despacha; el mensaje pasa a `sent`.

## 7. Flujos alternos y errores

- **Texto con ventana cerrada** → `422` «la ventana de 24 horas está cerrada: usa una plantilla aprobada». No se encola nada.
- **Texto y plantilla en el mismo envío** → `422`: es un estado imposible, la plantilla no lleva cuerpo libre.
- **Plantilla junto a multimedia o plantilla interna** → `422`.
- **Plantilla que no está en el catálogo de esa cuenta** → `422` (camino ya existente).
- **Plantilla con variables** → `422` (camino ya existente).
- **Plantilla sin idioma, o referencia incompleta** → `422`.
- **Sin ventana conocida (nunca hubo entrante)** → no se bloquea.
- **Canal que no es WhatsApp** → no interviene la ventana.

## 8. Casos límite

- Entrante de hace exactamente 24 horas: límite, se considera cerrada (`expiresAt` se alcanzó).
- Entrante hace 23 h 59 min: abierta.
- Reloj del proceso: se usa el del servidor; la comparación es por instantes ISO.
- Varios entrantes: manda el **más reciente**.
- Conversación cuya historia entra en la página de 50 mensajes o no: la ventana se consulta aparte, no se deduce del historial paginado.
- Plantilla enviada con la ventana abierta: válido (algunas plantillas se usan también dentro de plazo).

## 9. Datos y contratos

- **Lectura de conversación** (`GET /v1/tools/conversations/:id`) gana:
  ```json
  "whatsappWindow": { "open": false, "lastInboundAt": "2026-10-07T18:00:00.000Z", "expiresAt": "2026-10-08T18:00:00.000Z" }
  ```
  y `null` cuando no aplica (otro canal o sin entrante registrado).
- **Envío** (`POST /v1/tools/messages`) acepta, además de `text`/`body`:
  ```json
  {
    "conversationId": "…",
    "whatsappTemplate": { "name": "notificacion_48h", "language": "es_MX" },
    "idempotencyKey": "…"
  }
  ```
  Es excluyente con `text`, `body`, `media` y `templateName`.
- **Dominio:** `WHATSAPP_SERVICE_WINDOW_MS` y `whatsappServiceWindow(lastInboundAt, now)`.
- **Persistencia:** sin cambios de esquema.
- **Integraciones:** sin cambios; se reutiliza el despacho de plantillas ya probado.

## 10. Seguridad y privacidad

- Autorización: igual que el resto de las herramientas (credencial de máquina con alcance de mensajes; el espacio sale del token).
- La ventana se calcula sobre datos del propio espacio; no expone nada nuevo de terceros.
- Los registros no incluyen teléfonos ni cuerpos; los rechazos usan códigos y motivos operables.

## 11. Observabilidad

- El rechazo por ventana cerrada devuelve `422` con motivo; no genera evento de cola.
- El envío de plantilla conserva sus códigos (`zernio_http_400`, `zernio_http_502`) y su rastro en la cola.

## 12. Migración y rollback

- Sin migración. Contrato **aditivo**: `whatsappWindow` y `whatsappTemplate` son campos nuevos.
- Compatibilidad: un flujo que hoy manda texto dentro de plazo no cambia; uno que lo mandaba fuera de plazo empezará a recibir `422` en lugar de un fallo silencioso, que es el objetivo.
- Rollback: retirar la comprobación deja el comportamiento anterior; no hay datos que revertir.

## 13. Plan de pruebas

- **Unitarias:** ventana abierta, cerrada, en el límite exacto, sin entrante, canal distinto; instantes inválidos.
- **Integración:** la lectura devuelve la ventana calculada con el entrante más reciente (no con la página de historial); el envío acepta la plantilla y la encola; rechaza texto fuera de plazo sin encolar; rechaza texto + plantilla juntos; rechaza plantilla con multimedia.
- **Antiatajo:** variantes (texto, plantilla, mixto), límites (23:59 h / 24:00 h), estados inválidos (sin entrante, otro canal) y repetición (misma clave dos veces).

## 14. Criterios de aceptación

- [ ] La lectura de conversación informa `whatsappWindow` y `null` cuando no aplica.
- [ ] Un texto libre fuera de plazo por WhatsApp se rechaza con motivo, sin encolar nada.
- [ ] La misma llamada dentro de plazo sigue funcionando igual.
- [ ] El bot puede enviar una plantilla aprobada y llega al cliente.
- [ ] Todos los controles de calidad aplicables pasan.
- [ ] Documentación y decisiones actualizadas.
