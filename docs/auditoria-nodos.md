# Auditoria de los nodos migrados

Comprobacion automatica de coherencia entre metodo, ruta y cuerpo en los nodos que apuntan a nuestra API.

## Resumen

Los tres hallazgos de la auditoría original, con lo que resultó ser cada uno. **Los tres están
resueltos**; el detalle de abajo se conserva como registro de lo que se encontró.

| HALLAZGO                                                                 | Nodos | Estado                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usa `subscriber_id` de ManyChat: debe ser `contactId` o `conversationId` | 40    | **Resuelto.** El nodo traductor rellena `subscriber_id` con el identificador de la conversación como puente, y los diez nodos que escriben campos ya mandan `conversationId` |
| Envío sin contenido reconocible                                          | 7     | **Resuelto.** No eran envíos: eran escrituras de campos del contacto. Migradas a `/v1/tools/contact-fields`                                                                  |
| GET con cuerpo de mensaje: incoherente                                   | 3     | **Resuelto.** Pedían catálogo mandando a la vez un cuerpo de flujo. Ahora piden sin cuerpo                                                                                   |

## Detalle

| Flujo                                                           | Nodo                                       | Metodo | Endpoint | Hallazgo                                                           |
| --------------------------------------------------------------- | ------------------------------------------ | ------ | -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - guardar campos ISV          | GET    | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - guardar campos IS           | GET    | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - enviar flujo ISV o TikTok   | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - enviar flujo IG IS          | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - guardar campos ISV            | GET    | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - guardar campos IS             | GET    | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - enviar flujo ISV o TikTok     | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - enviar flujo IG IS            | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Cargar campos plantilla principal          | POST   | `{{…}}`  | Envio sin contenido reconocible                                    | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Cargar monto_pagado en ManyChat            | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar Flow conversión ManyChat            | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Cargar campos plantilla ISV                | POST   | `{{…}}`  | Envio sin contenido reconocible                                    | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar foto_accesoro IG IS                 | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación IG           | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar foto_accesoro iG ISV                | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación IG IS        | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación Tiktok ISV   | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar foto_accesoro Tiktok ISV            | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Cargar campos plantilla principal          | POST   | `{{…}}`  | Envio sin contenido reconocible                                    | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación IG IS        | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar foto_accesoro IG IS                 | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación IG           | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar foto_accesoro iG ISV                | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación Tiktok ISV   | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar foto_accesoro Tiktok ISV            | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Cargar campos plantilla ISV                | POST   | `{{…}}`  | Envio sin contenido reconocible                                    | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 7.1 Emisor Followup v2 IG_IS.json                               | Cargar mensaje de seguimiento              | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 7.1 Emisor Followup v2 IG_IS.json                               | Enviar seguimiento por el canal del bot    | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 7.1 Emisor Followup v2 IG_ISV.json                              | Enviar seguimiento por el canal del bot    | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| 7.1 Emisor Followup v2 IG_ISV.json                              | Cargar mensaje de seguimiento              | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Multimedia_Valle                           | GET    | `{{…}}`  | GET con cuerpo de mensaje: incoherente                             | Pide catalogo pero manda un flujo: hay que separarlo en dos pasos  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Multimedia_Juarez                          | GET    | `{{…}}`  | GET con cuerpo de mensaje: incoherente                             | Pide catalogo pero manda un flujo: hay que separarlo en dos pasos  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Multimedia_Lomas                           | GET    | `{{…}}`  | GET con cuerpo de mensaje: incoherente                             | Pide catalogo pero manda un flujo: hay que separarlo en dos pasos  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Transferir_al_asesor                       | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Foto_Deposito                              | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Send Flow                                  | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Set AI Answers                             | GET    | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Guardar mensaje comprobante                | POST   | `{{…}}`  | Envio sin contenido reconocible                                    | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar mensaje comprobante pendiente       | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Guardar mensaje imagen no relacionada      | POST   | `{{…}}`  | Envio sin contenido reconocible                                    | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar aclaración imagen no relacionada    | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Guardar mensaje revisión Banxico           | POST   | `{{…}}`  | Envio sin contenido reconocible                                    | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar mensaje revisión Banxico            | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | catalogo_pdf                               | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | foto_accesorios                            | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Cargar campos Banxico alternativo          | GET    | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar plantilla Banxico alternativa       | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar foto_accesorios Banxico alternativa | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Transferir por consulta inconsistente      | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Avisar al asesor del cambio pendiente      | POST   | `{{…}}`  | Usa subscriber_id de ManyChat: debe ser contactId o conversationId |
