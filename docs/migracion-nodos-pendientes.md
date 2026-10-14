# Migracion de nodos: que cambiar en cada uno

Generado desde los propios flujos de `Flujos_v2`. Cada fila es un nodo que apunta a nuestra API.

## 4.5 con el mismo trato que 4.2 (2026-10-14)

La copia unificada tenía otro criterio: intentaba nuestra API y, si la respuesta no confirmaba la
conversación, caía a ManyChat. Además la lectura estaba duplicada en dos nodos idénticos
(`Stripe buscar contacto ISV` y `Stripe buscar contacto IS`, los dos contra nuestra API), el envío
mandaba `subscriber_id` como `conversationId` y **ningún envío tenía verificador**: la salida de error
iba directo a «continuar», así que un rechazo de la API se perdía sin rastro.

Ahora son 76 nodos con el mismo puente de 4.2:

- `Stripe clasificar identificador` decide por la forma del id (solo dígitos → ManyChat; UUID →
  nuestra API; otra cosa → se reporta).
- Rama ManyChat: `MC Stripe buscar contacto ISV` → `MC Stripe buscar contacto IS` →
  `MC Stripe resolver cuenta y canal` → `Stripe ruta de mensaje válida` → cuenta, canal, campos de la
  plantilla y los flujos que ya funcionan.
- Rama nuestra: `Stripe leer conversación` (una sola lectura) → `Stripe resolver cuenta y canal` →
  `IF conversación en Weplash` → `Enviar confirmación al contacto` → **`Validar envío de confirmación
manual`** → `IF enviar foto de accesorios` → `Enviar foto de accesorios` → **`Validar envío de foto`**.
- La conversión es solo nuestra: `Preparar conversión manual` comprueba `identificador_es_conversacion`
  y `Enviar conversión manual` manda `conversation_id`.

Lo que queda: reimportar 4.5 apagando la versión anterior, y probar un pago manual de un contacto con
id de ManyChat y otro con el id de la conversación. Cuando ningún borrador traiga ya un id del
proveedor anterior, se retiran juntos el clasificador y la rama de ManyChat.

## 4.2 con puente: el identificador decide el transporte (2026-10-14)

La copia del repositorio era la del proveedor anterior (112 nodos, seis envíos por cuenta). La versión
migrada a nuestra API solo existía en n8n y su lectura estaba rota —el nodo se referenciaba a sí
mismo, así que `weplash_ruta_valida` era siempre falso—. Ahora el archivo es la versión de nuestra API
con un puente explícito: 121 nodos.

`Stripe clasificar identificador` decide por la forma del id, y de ahí sale una de dos ramas:

- **solo dígitos** → rama de ManyChat, con los nodos que hoy envían (buscar el contacto en las dos
  cuentas, resolver cuenta y canal, cargar los campos de la plantilla, lanzar el flujo por cuenta y
  canal, y sus verificadores). Las credenciales viajan con los nodos.
- **UUID** → rama nuestra: `Stripe leer conversación` (nuevo `GET /v1/tools/conversations/{id}`) →
  `Stripe leer conversación y canal` → `Stripe ruta de mensaje válida` → `Stripe enviar confirmación` →
  `Stripe enviar foto de accesorios` → `Validar envío de confirmación`.
- **cualquier otra cosa** → no se envía: `Stripe error de mensajería` deja el identificador recibido.

Las dos ramas vuelven a juntarse en `Continuar registro después de plantilla`.

La **conversión** es solo nuestra: `Conversión tiene cuenta configurada` comprueba que el identificador
sea de una conversación (`identificador_es_conversacion`) y, si no lo es, la omite con su motivo. No
queda ningún camino de conversión por ManyChat: se retiraron `Preparar monto_pagado para ManyChat`,
`Cargar monto_pagado en ManyChat`, `Enviar Flow conversión ManyChat` y sus verificadores.

Lo que queda de este corte:

- **Reimportar 4.2 en n8n** apagando la versión anterior, y probar los dos caminos: un borrador con id
  de ManyChat y uno con el id de la conversación.
- Cuando ningún borrador traiga ya un id del proveedor anterior, la rama de ManyChat y el nodo
  clasificador se retiran juntos: el clasificador deja de tener dos destinos.
- Sigue pendiente decidir cómo llega el id de la conversación en las filas que hoy traen el del
  proveedor anterior (que lo escriba quien crea el borrador, o que la API resuelva por el
  identificador de plataforma).

## 4.1 cerrado: una sola ruta de respuesta por cadena (2026-10-14)

El recordatorio de pago no salía. La ejecución en producción lo dejó claro: la conversación se leía
bien y el borrador terminaba en `RECORDATORIO_PAGO_1H_ERROR` con `operacion_http_status: 0`. En el
flujo desplegado, el nodo llamado `Recordatorio - enviar mensaje` era un **IF** y en ese tramo no había
ninguna llamada a `POST /v1/tools/messages`. El detalle está en `docs/DECISIONS.md`; aquí queda lo que
cambió en el archivo.

Las dos cadenas quedan así, con **un** envío cada una y el canal resuelto por la API:

- Recordatorio: `Preparar recordatorio de pago` → `Recordatorio - id es de conversación` → `Leer
conversación para recordatorio (lectura)` → `Leer conversación para recordatorio` → `Recordatorio -
ruta válida` → **`Recordatorio - enviar mensaje`** → `Recordatorio - validar envío` → `Recordatorio -
envío aceptado` → `Confirmar recordatorio enviado` → `Wait 1 hora después del recordatorio`.
- Liberación: `Preparar aviso de liberación` → `Liberación - id es de conversación` → `Leer conversación
para liberación (lectura)` → `Leer conversación para liberación` → `Liberación - ruta válida` →
  **`Aviso de liberación - enviar mensaje`** → `Aviso de liberación - validar envío` → `Liberación -
envío aceptado` → `Aviso de liberación aceptado` → `Cerrar seguimiento y reportar errores`.

La identidad se resuelve **antes** de llamar a la API: el disparador acepta `conversation_id` y, si no
llega, se usa `subscriber_id` **solo** cuando tiene forma de UUID. Con un id del proveedor anterior
(numérico) no se gasta ninguna llamada: la cadena cae en la rama que maneja ese caso y deja el motivo
`RECORDATORIO_PAGO_1H_SIN_CONVERSACION` o `LIBERADA_SIN_CONVERSACION` con el identificador recibido.
Sin ese corte, el mismo caso se reportaba como «respuesta inválida del envío», que señala al lugar
equivocado.

Qué se retiró (16 nodos de 137; el archivo queda en 123 con las dos ramas de identidad): las dos
lecturas duplicadas del contacto (`Buscar contacto fb1346079`, `Liberación - buscar contacto IS`), la
elección de cuenta (`… cuenta ISV`, `… elegir cuenta de envío`), las escrituras de campos del contacto
(`… guardar campos ISV`, `… guardar campos IS`) con su validador y su IF, y el envío duplicado por
cuenta (`… enviar flujo IG IS`). En su lugar quedan nombres neutros: `manychat_ruta_valida` →
`weplash_ruta_valida`, `manychat_ok` → `operacion_ok`, `manychat_error` → `weplash_error`,
`url_manychat_resuelta` → `url_chat_resuelta`, `LIBERADA_AVISO_MANYCHAT_FALLIDO` →
`LIBERADA_AVISO_DE_ENVIO_FALLIDO` y `ERRORES_MANYCHAT_EN_SEGUIMIENTO` →
`ERRORES_DE_ENVIO_EN_SEGUIMIENTO`.

Claves de idempotencia: `recordatorio-{{ $execution.id }}` y `liberacion-{{ $execution.id }}` — una por
ejecución, porque un reenvío con la misma clave se deduplica y un mensaje distinto con la misma clave
responde `409`.

Lo que queda de este corte:

- **Reimportar 4.1 en n8n** y apagar la versión anterior: una respuesta, un emisor.
- **Subir a `branch_media` la imagen «Accesorios»** de cada sede: sin ella el envío de accesorios de
  4.2 responde 422.
- **Decidir cómo llega el id de la conversación** en las filas que hoy traen el del proveedor anterior.
  Dos caminos, ninguno hecho: que lo escriba quien crea el borrador, o que la API resuelva la
  conversación por el identificador de plataforma (`contacts.platform_user_id` existe en la base, pero
  ninguna ruta lo expone). Hasta entonces, esas filas **no se responden**: se reportan con su motivo.
- Las copias de **4.2, 4.5 y 7.1 siguen con el andamiaje por cuenta** y las escrituras de campos del
  contacto: este corte solo tocó 4.1.

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
  ocupa `1 Sara ZNO - (v2).json`, con el mismo flujo y el nombre interno
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
| 1 Sara ZNO - (v2).json                                        | Multimedia_Valle                           | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| 1 Sara ZNO - (v2).json                                        | Multimedia_Juarez                          | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| 1 Sara ZNO - (v2).json                                        | Multimedia_Lomas                           | GET    | `{{…}}`  | LISTO             | El catalogo ya responde: solo comprobar                                                          |
| 1 Sara ZNO - (v2).json                                        | Transferir_al_asesor                       | POST   | `{{…}}`  | ADAPTAR CUERPO    | Nada: ya manda conversationId (el puente) contra /v1/tools/assignments                           |
| 1 Sara ZNO - (v2).json                                        | Foto_Deposito                              | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | Send Flow                                  | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | Set AI Answers                             | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 1 Sara ZNO - (v2).json                                        | Guardar mensaje comprobante                | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 1 Sara ZNO - (v2).json                                        | Enviar mensaje comprobante pendiente       | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | Guardar mensaje imagen no relacionada      | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 1 Sara ZNO - (v2).json                                        | Enviar aclaración imagen no relacionada    | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | Guardar mensaje revisión Banxico           | POST   | `{{…}}`  | CAMBIAR ENDPOINT  | No es un envio: es un campo del contacto -> /v1/tools/contact-fields (mismo cuerpo)              |
| 1 Sara ZNO - (v2).json                                        | Enviar mensaje revisión Banxico            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | catalogo_pdf                               | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | foto_accesorios                            | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | Cargar campos Banxico alternativo          | GET    | `{{…}}`  | ADAPTAR RESPUESTA | Nuestro JSON no es el de ManyChat: ajustar como se leen los campos                               |
| 1 Sara ZNO - (v2).json                                        | Enviar plantilla Banxico alternativa       | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | Enviar foto_accesorios Banxico alternativa | POST   | `{{…}}`  | BLOQUEADO         | Lanza un flujo de ManyChat: era transporte, no contenido. Sustituir por un envio directo nuestro |
| 1 Sara ZNO - (v2).json                                        | Transferir por consulta inconsistente      | POST   | `{{…}}`  | ADAPTAR CUERPO    | Nada: ya manda conversationId (el puente) contra /v1/tools/assignments                           |
| 1 Sara ZNO - (v2).json                                        | Avisar al asesor del cambio pendiente      | POST   | `{{…}}`  | ADAPTAR CUERPO    | Nada: ya manda conversationId (el puente) contra /v1/tools/assignments                           |
