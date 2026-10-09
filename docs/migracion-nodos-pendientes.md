# Migracion de nodos: que cambiar en cada uno

Generado desde los propios flujos de `Flujos_v2`. Cada fila es un nodo que apunta a nuestra API.

## Estado tras la ronda de correcciones (2026-10-09)

Ronda aplicada sobre `Flujos_v2/`. Lo que cambió:

- **Los 28 nodos «A SUSTITUIR» ya no están pendientes como lista.** Su contenido quedó dentro del envío
  directo nuestro, así que el envío que los reemplaza ya está hecho: la acción «Sustituir por un envío
  directo nuestro» que repiten las filas de abajo ya no es trabajo pendiente. El archivo
  `docs/nodos-a-sustituir-por-base-de-datos.md` sigue siendo el registro de qué nodo era cada uno y qué
  nodos tenía alrededor, pero ya no es trabajo por hacer.
- **Las lecturas y los campos de 4.1, 4.2, 4.5 y 7.1 ya están alineados.** `Resolver cuenta y URL
ManyChat` y `Resolver cuenta para liberación` leen la conversación de nuestra API y publican los campos
  que esperan los IF; los cuatro nodos «guardar campos» son `POST /v1/tools/contact-fields` con
  `{conversationId, fields}`; los verificadores leen `contactId` + `fields` o `item.id` + `item.status`.
  La columna «Clase» de la tabla sigue siendo la auditoría original, así que «ADAPTAR RESPUESTA»,
  «CAMBIAR ENDPOINT» y «ADAPTAR CUERPO» ya no describen nada por hacer.
- **El nodo de conversión de 4.2 ya está resuelto.** `Enviar Flow conversión ManyChat` apunta a
  `POST /v1/tools/conversions`, su cuerpo ya no lleva `|| $now.toISO()` y el IF
  `Conversión tiene cuenta configurada` dejó de ser una rama inalcanzable: sus dos salidas van a
  `Cargar monto_pagado en ManyChat` y a `Conversión omitida en cuenta ISV`. Ya no hay que elegir entre
  migrarlo o retirarlo.
- **El flujo Sara cambió de archivo.** El antiguo
  `Sara IG ISV - comprobantes optimizados y cierre automático (v2 WEPLASH).json` se retiró y su lugar lo
  ocupa `Sara ZNO - (v2).json`, con el mismo flujo y el nombre interno
  «Sara IG ISV - comprobantes optimizados y cierre automático (v2 WEPLASH)».

Lo que queda:

- Subir a `branch_media` la imagen titulada «Accesorios» de cada sede. Los dos nodos de envío con `media`
  ya piden la imagen por `branchMediaTitle: "Accesorios"` y no por un UUID inventado, pero el envío
  responde 422 mientras esa imagen no exista.
- Los flujos auxiliares que Sara referencia por `workflowId` y que no están en la carpeta:
  `Inside_Spa_Conocimiento` (vskrm14Pht5S1l3K), `Call 'Mensqje de Errores'` (coFiQ7L6lHV0PXji),
  `Sucursal_Mas_Cercana` (3RSEsUTsMydoFpc0), `Cerrar_Conversacion_Y_Pausar` (rTomIKEa8xNx1ZH1),
  `Ejecutar cierre sexual sin respuesta` (mismo id) y `Gestionar_Giftcard` (dCwzXZrXtipWl7KP). El usuario
  indicó que los conecta él.

**Actualizado tras la migración.** Tres de las cinco clases cambiaron de significado al confirmarse
cómo funciona hoy la operación:

- **A SUSTITUIR** (eran «BLOQUEADO»): los lanzamientos de flujo de ManyChat no esperaban contenido.
  Eran **transporte** —su API no permite enviar un mensaje directo— y quedaron sustituidos por un envío
  nuestro. No hay nada que recuperar de ManyChat.
- **ALINEADO** (eran «ADAPTAR RESPUESTA»): las dieciséis lecturas leen hoy el JSON de nuestra API, no el
  de ManyChat. Hecho.
- **DESMENTIDO** (eran «ADAPTAR CUERPO»): no existían tales envíos de texto. Al mirarlos uno a uno,
  todos eran lanzamientos de flujo.

## Resumen

| Clase                                    | Nodos | Qué queda por hacer                                                  |
| ---------------------------------------- | ----- | -------------------------------------------------------------------- |
| A SUSTITUIR (eran lanzamientos de flujo) | 28    | Nada como lista: el contenido quedó dentro del envío directo nuestro |
| ALINEADO (las lecturas ya coinciden)     | 16    | Nada: las lecturas ya piden el JSON de nuestra API                   |
| MIGRADO (campos del contacto)            | 10    | Nada — ya apuntan a `/v1/tools/contact-fields`                       |
| DESMENTIDO (no eran envíos de texto)     | 3     | Nada — reclasificados                                                |
| ARREGLADO (el catálogo)                  | 3     | Nada                                                                 |

## Nodo por nodo

| Flujo                                                         | Nodo                                       | Metodo | Endpoint | Clase             | Que hacer                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------ | ------ | -------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Buscar contacto fb1309803                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Buscar contacto fb1346079                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Recordatorio - guardar campos ISV          | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Recordatorio - guardar campos IS           | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Recordatorio - enviar flujo ISV o TikTok   | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Recordatorio - enviar flujo IG IS          | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Liberación - buscar contacto ISV           | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Liberación - buscar contacto IS            | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Liberación - guardar campos ISV            | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Liberación - guardar campos IS             | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Liberación - enviar flujo ISV o TikTok     | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.1_V3_Retención y liberación - seguimiento corregido.json    | Liberación - enviar flujo IG IS            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Cargar campos plantilla principal          | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Cargar monto_pagado en ManyChat            | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Enviar Flow conversión ManyChat            | POST   | `{{…}}`  | MIGRADO           | Apunta a `/v1/tools/conversions`; el IF de conversión ya tiene sus dos salidas cableadas         |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Cargar campos plantilla ISV                | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Enviar foto_accesoro IG IS                 | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Enviar plantilla confirmación IG           | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Enviar foto_accesoro iG ISV                | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Enviar plantilla confirmación IG IS        | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Enviar plantilla confirmación Tiktok ISV   | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Enviar foto_accesoro Tiktok ISV            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Stripe buscar contacto ISV                 | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.2*V3* Stripe - lectura details, abono y plantilla.json      | Stripe buscar contacto IS                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Stripe buscar contacto ISV                 | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Stripe buscar contacto IS                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Cargar campos plantilla principal          | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Enviar plantilla confirmación IG IS        | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Enviar foto_accesoro IG IS                 | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Enviar plantilla confirmación IG           | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Enviar foto_accesoro iG ISV                | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Enviar plantilla confirmación Tiktok ISV   | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Enviar foto_accesoro Tiktok ISV            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 4.5 Confirmar pago manual — Pabau y plantilla automática.json | Cargar campos plantilla ISV                | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 7.1 Emisor Followup v2 IG_IS.json                             | Leer contacto en ManyChat                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 7.1 Emisor Followup v2 IG_IS.json                             | Cargar mensaje de seguimiento              | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 7.1 Emisor Followup v2 IG_IS.json                             | Enviar seguimiento por el canal del bot    | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 7.1 Emisor Followup v2 IG_ISV.json                            | Enviar seguimiento por el canal del bot    | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 7.1 Emisor Followup v2 IG_ISV.json                            | Cargar mensaje de seguimiento              | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 7.1 Emisor Followup v2 IG_ISV.json                            | Leer contacto en ManyChat                  | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| Sara ZNO - (v2).json                                          | Multimedia_Valle                           | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| Sara ZNO - (v2).json                                          | Multimedia_Juarez                          | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| Sara ZNO - (v2).json                                          | Multimedia_Lomas                           | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| Sara ZNO - (v2).json                                          | Transferir_al_asesor                       | POST   | `{{…}}`  | ADAPTAR CUERPO    | Nada: ya manda conversationId (el puente) contra /v1/tools/assignments                           |
| Sara ZNO - (v2).json                                          | Foto_Deposito                              | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | Send Flow                                  | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | Set AI Answers                             | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| Sara ZNO - (v2).json                                          | Guardar mensaje comprobante                | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| Sara ZNO - (v2).json                                          | Enviar mensaje comprobante pendiente       | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | Guardar mensaje imagen no relacionada      | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| Sara ZNO - (v2).json                                          | Enviar aclaración imagen no relacionada    | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | Guardar mensaje revisión Banxico           | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| Sara ZNO - (v2).json                                          | Enviar mensaje revisión Banxico            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | catalogo_pdf                               | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | foto_accesorios                            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | Cargar campos Banxico alternativo          | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| Sara ZNO - (v2).json                                          | Enviar plantilla Banxico alternativa       | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | Enviar foto_accesorios Banxico alternativa | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| Sara ZNO - (v2).json                                          | Transferir por consulta inconsistente      | POST   | `{{…}}`  | ADAPTAR CUERPO    | Nada: ya manda conversationId (el puente) contra /v1/tools/assignments                           |
| Sara ZNO - (v2).json                                          | Avisar al asesor del cambio pendiente      | POST   | `{{…}}`  | ADAPTAR CUERPO    | Nada: ya manda conversationId (el puente) contra /v1/tools/assignments                           |
