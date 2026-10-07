# Migracion de nodos: que cambiar en cada uno

Generado desde los propios flujos de `Flujos_v2`. Cada fila es un nodo que apunta a nuestra API.

**Actualizado tras la migración.** Tres de las cinco clases cambiaron de significado al confirmarse
cómo funciona hoy la operación:

- **A SUSTITUIR** (eran «BLOQUEADO»): los lanzamientos de flujo de ManyChat no esperaban contenido.
  Eran **transporte** —su API no permite enviar un mensaje directo— y se sustituyen por un envío
  nuestro. No hay nada que recuperar de ManyChat.
- **ALINEADO** (eran «ADAPTAR RESPUESTA»): las dieciséis lecturas ya coinciden con lo que devuelve
  nuestra API. Hecho.
- **DESMENTIDO** (eran «ADAPTAR CUERPO»): no existían tales envíos de texto. Al mirarlos uno a uno,
  todos eran lanzamientos de flujo.

## Resumen

| Clase                                    | Nodos | Qué queda por hacer                            |
| ---------------------------------------- | ----- | ---------------------------------------------- |
| A SUSTITUIR (eran lanzamientos de flujo) | 28    | Reescribir el envío, cuando estén los textos   |
| ALINEADO (las lecturas ya coinciden)     | 16    | Nada                                           |
| MIGRADO (campos del contacto)            | 10    | Nada — ya apuntan a `/v1/tools/contact-fields` |
| DESMENTIDO (no eran envíos de texto)     | 3     | Nada — reclasificados                          |
| ARREGLADO (el catálogo)                  | 3     | Nada                                           |

## Nodo por nodo

| Flujo                                                           | Nodo                                       | Metodo | Endpoint | Clase             | Que hacer                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------ | ------ | -------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Buscar contacto fb1309803                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Buscar contacto fb1346079                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - guardar campos ISV          | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - guardar campos IS           | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - enviar flujo ISV o TikTok   | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - enviar flujo IG IS          | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - buscar contacto ISV           | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - buscar contacto IS            | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - guardar campos ISV            | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - guardar campos IS             | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - enviar flujo ISV o TikTok     | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - enviar flujo IG IS            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Cargar campos plantilla principal          | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Cargar monto_pagado en ManyChat            | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar Flow conversión ManyChat            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Cargar campos plantilla ISV                | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar foto_accesoro IG IS                 | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación IG           | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar foto_accesoro iG ISV                | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación IG IS        | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación Tiktok ISV   | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar foto_accesoro Tiktok ISV            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Stripe buscar contacto ISV                 | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Stripe buscar contacto IS                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Stripe buscar contacto ISV                 | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Stripe buscar contacto IS                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Cargar campos plantilla principal          | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación IG IS        | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar foto_accesoro IG IS                 | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación IG           | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar foto_accesoro iG ISV                | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación Tiktok ISV   | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar foto_accesoro Tiktok ISV            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Cargar campos plantilla ISV                | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 7.1 Emisor Followup v2 IG_IS.json                               | Leer contacto en ManyChat                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 7.1 Emisor Followup v2 IG_IS.json                               | Cargar mensaje de seguimiento              | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 7.1 Emisor Followup v2 IG_IS.json                               | Enviar seguimiento por el canal del bot    | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 7.1 Emisor Followup v2 IG_ISV.json                              | Enviar seguimiento por el canal del bot    | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 7.1 Emisor Followup v2 IG_ISV.json                              | Cargar mensaje de seguimiento              | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 7.1 Emisor Followup v2 IG_ISV.json                              | Leer contacto en ManyChat                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Multimedia_Valle                           | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Multimedia_Juarez                          | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Multimedia_Lomas                           | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Transferir_al_asesor                       | POST   | `{{…}}`  | ADAPTAR CUERPO    | Cambiar subscriber_id por userId de nuestra base                                                 |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Foto_Deposito                              | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Send Flow                                  | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Set AI Answers                             | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Guardar mensaje comprobante                | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar mensaje comprobante pendiente       | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Guardar mensaje imagen no relacionada      | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar aclaración imagen no relacionada    | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Guardar mensaje revisión Banxico           | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar mensaje revisión Banxico            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | catalogo_pdf                               | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | foto_accesorios                            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Cargar campos Banxico alternativo          | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar plantilla Banxico alternativa       | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar foto_accesorios Banxico alternativa | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Transferir por consulta inconsistente      | POST   | `{{…}}`  | ADAPTAR CUERPO    | Cambiar subscriber_id por userId de nuestra base                                                 |
| Sara IG ISV - comprobantes optimizados y cierre automático.json | Avisar al asesor del cambio pendiente      | POST   | `{{…}}`  | ADAPTAR CUERPO    | Cambiar subscriber_id por userId de nuestra base                                                 |
