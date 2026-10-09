# Contratos de entrada de los flujos

Que dispara cada flujo, que campos espera y que campos lee. Generado desde los flujos de `Flujos_v2`.

Este documento es la especificacion previa a tocar nada: dice **donde** hay que traducir la
identidad y **que** campos necesita cada flujo para funcionar.

## Estado tras la ronda de correcciones (2026-10-09)

Ronda aplicada sobre `Flujos_v2/`. La especificacion ya está implementada donde la ronda alcanzó:

- **La traduccion de la identidad ya está puesta** en la puerta de Sara y en los sub-flujos que llaman a
  nuestra API, así que este documento pasa a describir lo que hay, no solo lo que hay que hacer.
- **El flujo de Sara cambió de archivo.** El antiguo
  `Sara IG ISV - comprobantes optimizados y cierre automático (v2 WEPLASH).json` se retiró y su lugar lo
  ocupa `Sara ZNO - (v2).json`, con el mismo flujo, el mismo disparador, el mismo `path=Manychat-n8n-IG-ISV`
  y el nombre interno «Sara IG ISV - comprobantes optimizados y cierre automático (v2 WEPLASH)». La fila
  de la tabla se actualizó a ese nombre.
- **Las lecturas cambiaron de forma.** Los nodos que antes leían la respuesta de ManyChat hoy leen la
  conversacion de nuestra API: `Resolver cuenta y URL ManyChat`, `Resolver cuenta para liberación` y
  `Stripe resolver cuenta y canal` publican los campos que esperan los IF, y los verificadores leen
  `contactId` y `fields`, o `item.id` y `item.status`. Por eso la columna «Campos que lee» conserva los
  recuentos de la auditoría original: hoy manda la conversacion (`conversationId`, `conversation.id`,
  `contact.platform`, `messages[]`) y no los nombres sueltos de ManyChat.
- **Los nodos que escriben campos** son `POST /v1/tools/contact-fields` con `{conversationId, fields}`, y
  el flujo padre de 7.1 manda `workflowInputs.value` a los tres emisores.
- **Codificacion.** Los flujos ya no tienen texto doblemente codificado, ni emojis o comillas rotos.

Lo que sigue pendiente: subir a `branch_media` la imagen titulada «Accesorios» de cada sede (el envío con
`media` responde 422 mientras no exista) y conectar los flujos auxiliares que Sara referencia por
`workflowId` y que no están en la carpeta.

## Resumen

| Disparador             | Flujos | Quien lo arranca          |
| ---------------------- | ------ | ------------------------- |
| executeWorkflowTrigger | 9      | Lo llama otro flujo       |
| scheduleTrigger        | 3      | Se dispara solo por reloj |
| webhook                | 2      | Lo llama alguien de fuera |
| stripeTrigger          | 1      | Lo dispara Stripe         |

## Flujo por flujo

| Flujo                                                                            | Disparador             | Puerta o campos declarados                                                                                                                                                                                                                         | Quien lo arranca          | Campos que lee                                                                                    |
| -------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| 2 V3_Disponibilidad Global — entrada estructurada y compatibilidad de texto.json | executeWorkflowTrigger | `subscriber_id, servicio, sucursal, fecha, horario, numero_personas, es_feriado, servicio_confirmado, modo_busqueda, live_chat_url, hora_minima, solicitud_id, input, sucursal_solicitada, canal_origen`                                           | Lo llama otro flujo       | subscriber_id x9 · live_chat_url x5 · sucursal x5 · fecha x5                                      |
| 3_V3_SUB_Disponibilidad_5_sucursales_PERSONAL_VIGENTE.json                       | executeWorkflowTrigger | `subscriber_id, servicio, sucursal_solicitada, sucursal, fecha, horario, numero_personas, es_feriado, servicio_confirmado, modo_busqueda, live_chat_url, hora_minima, servicio_busqueda, canal_origen`                                             | Lo llama otro flujo       | subscriber_id x3 · sucursal x9 · fecha x6                                                         |
| 4.1_V3_Retención y liberación - seguimiento corregido.json                       | executeWorkflowTrigger | `reserva_draft_id, subscriber_id, servicio_confirmado, live_chat_url, canal_origen, accion_retencion`                                                                                                                                              | Lo llama otro flujo       | subscriber_id x19 · conversation_id x0 · sucursal x6                                              |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json                         | stripeTrigger          | —                                                                                                                                                                                                                                                  | Lo dispara Stripe         | subscriber_id x6 · conversation_id x0                                                             |
| 4.3 Decisión de pre-reserva — aprobar o rechazar comprobante.json                | webhook                | `path=pre-reserva-decision`                                                                                                                                                                                                                        | Lo llama alguien de fuera | —                                                                                                 |
| 4.4 Aviso de comprobante protegido — botones de revisión.json                    | scheduleTrigger        | —                                                                                                                                                                                                                                                  | Se dispara solo por reloj | —                                                                                                 |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json                    | scheduleTrigger        | —                                                                                                                                                                                                                                                  | Se dispara solo por reloj | subscriber_id x1 · conversation_id x0 · sucursal x1                                               |
| 4.6 Cambiar servicio de una pre-reserva.json                                     | executeWorkflowTrigger | `subscriber_id, reserva_draft_id_anterior, servicio, servicio_confirmado, servicio_busqueda, sucursal, fecha, horario, numero_personas, es_feriado, solicitud_id, first_name, last_name, email, phone, canal_origen, live_chat_url, motivo_cambio` | Lo llama otro flujo       | subscriber_id x4 · live_chat_url x1 · first_name x1 · sucursal x2 · fecha x1                      |
| 4_V3_SUB_Guardar_borrador_5_sucursales_FUNCIONAL.json                            | executeWorkflowTrigger | `subscriber_id, servicio, sucursal_solicitada, sucursal, fecha, horario, numero_personas, es_feriado, first_name, last_name, email, phone, servicio_confirmado, live_chat_url, servicio_busqueda, canal_origen, solicitud_id, reserva_draft_id`    | Lo llama otro flujo       | subscriber_id x5 · sucursal x10 · fecha x6                                                        |
| 5 Consultar reserva y confirmar asistencia.json                                  | executeWorkflowTrigger | `subscriber_id, fecha, horario, sucursal, reserva_id, accion, mensaje_cliente`                                                                                                                                                                     | Lo llama otro flujo       | —                                                                                                 |
| 7 Followup v2 - cola global 6 por minuto 09 a 20.json                            | scheduleTrigger        | —                                                                                                                                                                                                                                                  | Se dispara solo por reloj | —                                                                                                 |
| 7.1 Emisor Followup v2 IG_IS.json                                                | executeWorkflowTrigger | `conversationId, id, payload, scope, simulacion, subscriber_id, worker`                                                                                                                                                                            | Lo llama otro flujo       | conversationId x6 · payload x5 · subscriber_id x1                                                 |
| 7.1 Emisor Followup v2 IG_ISV.json                                               | executeWorkflowTrigger | `conversationId, id, payload, scope, simulacion, subscriber_id, worker`                                                                                                                                                                            | Lo llama otro flujo       | conversationId x6 · payload x5 · subscriber_id x1                                                 |
| Sara ZNO - (v2).json                                                             | webhook                | `path=Manychat-n8n-IG-ISV`                                                                                                                                                                                                                         | Lo llama alguien de fuera | subscriber_id x27 · conversation_id x2 · body x10 · live_chat_url x2 · first_name x1 · payload x1 |
| SUB Verificar pago Banxico - solicitar faltantes sin asesora (1).json            | executeWorkflowTrigger | `fecha_pago, clave_rastreo, numero_referencia, banco_emisor, banco_receptor, monto_pago, monto_esperado, numero_personas, subscriber_id, reserva_draft_id, live_chat_url, cuenta_beneficiaria`                                                     | Lo llama otro flujo       | subscriber_id x1                                                                                  |

Los recuentos de «Campos que lee» son los de la auditoría original, y se conservan como registro. Tras la
ronda del 2026-10-09, los `conversation_id` que cuentan esas celdas ya no se leen de ManyChat: los leen
`Resolver cuenta y URL ManyChat`, `Resolver cuenta para liberación` y `Stripe resolver cuenta y canal`,
que publican el resultado como campo de salida. Por eso esas filas quedaron en `conversation_id x0` y la
columna «Puerta o campos declarados» de 7.1 recoge el `workflowInputs.value` que manda el flujo padre.

## La puerta principal

El flujo `Sara` es el unico que recibe mensajes de personas, a traves de su nodo Webhook.
Los demas son sub-flujos que Sara llama, o relojes internos. Por eso **la traduccion de la identidad
va en la puerta de Sara**, una sola vez, en el nodo `Traducir aviso de WEPLASH1`.

## El aviso de entrada y sus adjuntos

Nuestra API entrega al webhook de n8n un evento `message.inbound` con esta forma:

- Arriba, la identidad y el contexto: `conversationId`, `messageId` y `tenantId`, mas el objeto
  `conversation` con `platform`, `status`, `channelName`, `contactName`, `contactUsername`, `hasDm` y
  `hasComment`.
- Dentro de `message`: `body`, `direction`, `senderType`, `sentAt`, `source`, `commentState` y
  `attachments`.
- `message.attachments` es una lista de `{ contentType, id, kind, title, url }`. `kind` dice de que tipo
  de archivo se trata y `url` es un enlace firmado de diez minutos a la copia propia del archivo; vale
  `null` mientras esa copia todavia no se haya hecho, de modo que un adjunto puede llegar anunciado antes
  de estar disponible. Por eso los flujos que necesitan la imagen leen tambien esa lista, y no solo las
  URLs que publica ManyChat.
- `subscriber_id` no viene en el aviso: lo rellena el traductor de entrada con el identificador de la
  conversacion, como puente, porque los flujos se escribieron para ManyChat y lo usan como clave en
  muchos sitios. No es el identificador real de ManyChat y no puede serlo: ese dato no lo tenemos.
