# Nodos que lanzan flujos de ManyChat (28)

La indicacion es que **ya no se usan**: el contenido se resolvera con nuestra base de datos. Esta
lista es la base para sustituirlos: cada fila dice que nodo es, en que flujo vive, y que nodos tiene
alrededor -- que es de donde saldra el texto que hoy pone ManyChat.

## Estado tras la ronda de correcciones (2026-10-09)

**Esta lista ya no está pendiente.** La ronda dejó hecho lo que la lista describía como trabajo por
hacer: el contenido de estos 28 lanzamientos de flujo está dentro del envío directo nuestro, así que
el envío que los reemplaza ya existe y no queda ningún nodo de esta tabla por sustituir.

La tabla de abajo se conserva como registro histórico: dice qué nodo era cada uno y qué nodos tenía
alrededor, que es el dato del que salió el texto. No es una lista de tareas.

Dos avisos sobre el registro:

- El flujo de Sara cambió de archivo; donde la columna «Flujo» dice
  `Sara IG ISV - comprobantes optimizados y cierre automático.json`, hoy es `Sara ZNO - (v2).json`
  (mismo flujo, nombre interno «Sara IG ISV - comprobantes optimizados y cierre automático (v2 WEPLASH)»).
- Los nombres de nodo de la tabla venían con la codificación rota, porque se transcribieron de la copia
  dañada. Aquí se muestran ya limpios, y la ronda arregló esa misma codificación en los flujos; no se
  cambió ningún nombre ni ninguna relación.

Lo único que sigue pendiente y no está en esta lista: subir a `branch_media` la imagen titulada
«Accesorios» de cada sede (el envío con `media` responde 422 mientras no exista) y los flujos auxiliares
que Sara referencia por `workflowId` y que no están en la carpeta, que el usuario conecta él.

| #   | Nodo                                       | Flujo                                                           | Antes                                                                                       | Despues                                                                            |
| --- | ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Recordatorio - enviar flujo ISV o TikTok   | 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - campos aceptados · Recordatorio - elegir cuenta de envío                     | Recordatorio - enviar flujo IG IS · Recordatorio - validar envío                   |
| 2   | Recordatorio - enviar flujo IG IS          | 4.1_V3_Retención y liberación - seguimiento corregido.json      | Recordatorio - elegir cuenta de envío · Recordatorio - enviar flujo ISV o TikTok            | Recordatorio - validar envío · Recordatorio - envío aceptado                       |
| 3   | Liberación - enviar flujo ISV o TikTok     | 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - campos aceptados · Liberación - elegir cuenta de envío                         | Liberación - enviar flujo IG IS · Liberación - validar envío                       |
| 4   | Liberación - enviar flujo IG IS            | 4.1_V3_Retención y liberación - seguimiento corregido.json      | Liberación - elegir cuenta de envío · Liberación - enviar flujo ISV o TikTok                | Liberación - validar envío · Liberación - envío aceptado                           |
| 5   | Enviar Flow conversión ManyChat            | 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Cargar monto_pagado en ManyChat · IF pago real para conversión                              | Pago Stripe test - no convertir · IF borrador confirmado pendiente de finalizar1   |
| 6   | Enviar foto_accesoro IG IS                 | 4.2*V3* Stripe - lectura details, abono y plantilla.json        | IF IDs Pabau sin conflicto1 · Cargar campos plantilla ISV                                   | Releer nota de abono guardada en Pabau · IF abono guardado en todas las notas      |
| 7   | Enviar plantilla confirmación IG           | 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Continuar registro después de plantilla · Mostrar error de actualización de nota            | Enviar foto_accesoro iG ISV · Enviar plantilla confirmación IG IS                  |
| 8   | Enviar foto_accesoro iG ISV                | 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Mostrar error de actualización de nota · Enviar plantilla confirmación IG                   | Enviar plantilla confirmación IG IS · Enviar plantilla confirmación Tiktok ISV     |
| 9   | Enviar plantilla confirmación IG IS        | 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación IG · Enviar foto_accesoro iG ISV                              | Enviar plantilla confirmación Tiktok ISV · Enviar foto_accesoro Tiktok ISV         |
| 10  | Enviar plantilla confirmación Tiktok ISV   | 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar foto_accesoro iG ISV · Enviar plantilla confirmación IG IS                           | Enviar foto_accesoro Tiktok ISV · Stripe buscar contacto ISV                       |
| 11  | Enviar foto_accesoro Tiktok ISV            | 4.2*V3* Stripe - lectura details, abono y plantilla.json        | Enviar plantilla confirmación IG IS · Enviar plantilla confirmación Tiktok ISV              | Stripe buscar contacto ISV · Stripe buscar contacto IS                             |
| 12  | Enviar plantilla confirmación IG IS        | 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Validar Cargar campos plantilla principal · Stripe elegir cuenta de envío                   | Validar Enviar plantilla confirmación IG IS · Enviar foto_accesoro IG IS           |
| 13  | Enviar foto_accesoro IG IS                 | 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación IG IS · Validar Enviar plantilla confirmación IG IS           | Validar Enviar foto_accesoro IG IS · Stripe elegir canal ISV                       |
| 14  | Enviar plantilla confirmación IG           | 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Validar Enviar foto_accesoro IG IS · Stripe elegir canal ISV                                | Validar Enviar plantilla confirmación IG · Enviar foto_accesoro iG ISV             |
| 15  | Enviar foto_accesoro iG ISV                | 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación IG · Validar Enviar plantilla confirmación IG                 | Validar Enviar foto_accesoro iG ISV · Enviar plantilla confirmación Tiktok ISV     |
| 16  | Enviar plantilla confirmación Tiktok ISV   | 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar foto_accesoro iG ISV · Validar Enviar foto_accesoro iG ISV                           | Validar Enviar plantilla confirmación Tiktok ISV · Enviar foto_accesoro Tiktok ISV |
| 17  | Enviar foto_accesoro Tiktok ISV            | 4.5 Confirmar pago manual — Pabau y plantilla automática.json   | Enviar plantilla confirmación Tiktok ISV · Validar Enviar plantilla confirmación Tiktok ISV | Validar Enviar foto_accesoro Tiktok ISV · Cargar campos plantilla ISV              |
| 18  | Enviar seguimiento por el canal del bot    | 7.1 Emisor Followup v2 IG_IS.json                               | Revalidar justo antes de enviar · Enviar solo si continúa pendiente                         | Comprobar envío de seguimiento · Cancelar seguimiento superado                     |
| 19  | Enviar seguimiento por el canal del bot    | 7.1 Emisor Followup v2 IG_ISV.json                              | Enviar solo si continúa pendiente                                                           | Comprobar envío de seguimiento · Cancelar seguimiento superado                     |
| 20  | Foto_Deposito                              | Sara IG ISV - comprobantes optimizados y cierre automático.json | Multimedia_Lomas · Transferir_al_asesor                                                     | Send Flow · Set AI Answers                                                         |
| 21  | Send Flow                                  | Sara IG ISV - comprobantes optimizados y cierre automático.json | Transferir_al_asesor · Foto_Deposito                                                        | Set AI Answers · Guardar mensaje comprobante                                       |
| 22  | Enviar mensaje comprobante pendiente       | Sara IG ISV - comprobantes optimizados y cierre automático.json | Set AI Answers · Guardar mensaje comprobante                                                | Guardar mensaje imagen no relacionada · Enviar aclaración imagen no relacionada    |
| 23  | Enviar aclaración imagen no relacionada    | Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar mensaje comprobante pendiente · Guardar mensaje imagen no relacionada                | Execute a SQL query13 · Guardar mensaje revisión Banxico                           |
| 24  | Enviar mensaje revisión Banxico            | Sara IG ISV - comprobantes optimizados y cierre automático.json | Execute a SQL query13 · Guardar mensaje revisión Banxico                                    | catalogo_pdf · foto_accesorios                                                     |
| 25  | catalogo_pdf                               | Sara IG ISV - comprobantes optimizados y cierre automático.json | Guardar mensaje revisión Banxico · Enviar mensaje revisión Banxico                          | foto_accesorios · Cargar campos Banxico alternativo                                |
| 26  | foto_accesorios                            | Sara IG ISV - comprobantes optimizados y cierre automático.json | Enviar mensaje revisión Banxico · catalogo_pdf                                              | Cargar campos Banxico alternativo · Enviar plantilla Banxico alternativa           |
| 27  | Enviar plantilla Banxico alternativa       | Sara IG ISV - comprobantes optimizados y cierre automático.json | foto_accesorios · Cargar campos Banxico alternativo                                         | Enviar foto_accesorios Banxico alternativa · Inside_Spa_Conocimiento               |
| 28  | Enviar foto_accesorios Banxico alternativa | Sara IG ISV - comprobantes optimizados y cierre automático.json | Cargar campos Banxico alternativo · Enviar plantilla Banxico alternativa                    | Inside_Spa_Conocimiento · Code in JavaScript                                       |
