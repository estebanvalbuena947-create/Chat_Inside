# Especificación: envío con plantilla aprobada de WhatsApp

- **Estado:** aprobada
- **Responsable:** `apps/api` (propietario del catálogo: `apps/api/src/zernio`; propietario de la regla de envío: dominio de mensajes)
- **Fecha:** `2026-10-09`

## 1. Problema

La bandeja lista las plantillas aprobadas de Meta de la cuenta de WhatsApp, pero **no permite
enviarlas**: el panel no es clicable y el camino de salida solo sabe mandar texto libre. Fuera de la
ventana de 24 horas Meta no acepta texto libre, así que hoy la operación no puede confirmar citas a
48 horas —el motivo por el que existe `notificacion_48h`— ni avisar de nada a un cliente que lleva
más de un día sin escribir.

## 2. Resultado esperado

Desde una conversación de WhatsApp, quien atiende puede enviar una plantilla aprobada **de la cuenta
de ese canal**, con confirmación previa explícita. El mensaje queda en el historial con su estado
(`queued` → `sending` → `sent`, o `failed` con motivo), igual que un texto. No se ofrece ninguna
plantilla que no se pueda enviar desde esa cuenta.

## 3. No objetivos

- **Variables y parámetros** (`{{1}}`, `{{nombre}}`): se rechazan en este corte. Rellenarlas es un corte propio.
- Mapear las **respuestas de botón** ("Asistiré" / "No Asistiré") a una decisión de reserva.
- Crear, importar o editar plantillas desde nuestra interfaz.
- Escribir a un número con el que todavía no hay conversación (`POST /v1/inbox/conversations`).
- Reconectar o remover canales (corte B, sin empezar).
- Convertir el panel en una biblioteca: sigue mostrando solo lo enviable desde la conversación abierta.

## 4. Actores y permisos

| Actor                                 | Puede                                                              | No puede                                                           |
| ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Agente con membresía en el espacio    | Ver el catálogo de la conversación y enviar una plantilla aprobada | Enviar plantillas de otro espacio, de otro canal, ni con variables |
| Automatización (herramientas del bot) | Enviar texto como hasta ahora                                      | Enviar plantillas de Meta en este corte                            |
| Proveedor (Zernio/Meta)               | Resolver el par nombre+idioma exactos y entregar                   | Entregar una plantilla sin variante aprobada en ese idioma         |

## 5. Reglas e invariantes

1. **Un mensaje saliente es texto libre o plantilla, nunca los dos.** Es un estado imposible y el contrato lo impide.
2. Una plantilla se envía **solo desde la cuenta de canal de la conversación** y solo si pertenece al catálogo de esa cuenta con estado `APPROVED`.
3. Una plantilla que **declara variables** no se envía en este corte: se rechaza antes de encolar, con motivo. Vale para cualquier hueco en cualquier componente (encabezado, cuerpo, pie, botones), no para un nombre concreto.
4. La referencia es el **par nombre + idioma exactos** que devuelve el proveedor. No se normaliza, no se adivina el idioma y no se elige variante por nosotros.
5. El **texto de la plantilla se guarda como copia visible** para el historial; lo que se despacha es la **referencia**, nunca ese texto. Editar la copia no cambia lo que se envía.
6. **Idempotencia:** la misma clave devuelve el mismo mensaje. La misma clave con otra referencia o en otra conversación es conflicto.
7. El estado del mensaje **no retrocede**; un fallo del proveedor deja `failed` con su código, y un fallo reintentable vuelve a `queued`.
8. La cuenta de canal sigue siendo **Zernio**: una conversación sin canal Zernio no puede enviar plantilla (ni texto).

## 6. Flujo principal

1. Quien atiende abre una conversación de WhatsApp y despliega "Plantillas de WhatsApp".
2. La interfaz pide el catálogo y muestra **solo** las plantillas de la cuenta de esa conversación, marcando las que no se pueden enviar por declarar variables.
3. Al elegir una, la interfaz pide confirmación (es un mensaje de plantilla de Meta; tiene coste y no se deshace).
4. La interfaz envía `{ kind: 'whatsapp_template', whatsappTemplate: { name, language }, idempotencyKey }` al mismo extremo de mensajes.
5. La API comprueba membresía, canal y catálogo; inserta el mensaje `queued` con la copia visible y un evento de outbox.
6. El trabajador despacha el campo `template` al proveedor y actualiza el mensaje a `sent` con su identificador.

## 7. Flujos alternos y errores

- **Plantilla fuera del catálogo de la cuenta** → rechazo local `422` antes de encolar, con motivo legible.
- **Plantilla con variables** → rechazo local `422` antes de encolar, nombrando los huecos.
- **El proveedor no tiene variante aprobada en ese idioma (`400`) o la petición no es válida (`422`)** → no se envía nada; el mensaje queda `failed` y **no** se reintenta (reintentar no puede funcionar).
- **`502`** → se reintenta, dentro del límite de 3 intentos: el proveedor lo usa tanto para «esta cuenta no tiene cuenta de WhatsApp Business» —definitivo— como para un fallo pasajero de su plataforma, y en una respuesta no-2xx no se envió nada. Si el motivo era el definitivo, el ciclo termina en `failed` con su código.
- **La plantilla no tiene idioma** → rechazo local `422`: sin idioma el proveedor no puede resolver la referencia.
- **`429` o `5xx`** → reintento acotado (máximo 3 intentos, espaciado creciente) reutilizando la misma clave de idempotencia.
- **Clave de idempotencia repetida con otra referencia** → `409`.
- **La conversación pierde el canal Zernio** → `422` explícito, nunca un envío silencioso.

## 8. Casos límite

- La misma plantilla existe en dos cuentas del espacio: el catálogo la devuelve una vez con **las dos cuentas** y es enviable desde cualquiera de ellas.
- La plantilla existe en otra cuenta del espacio pero **no** en la de la conversación: no se ofrece; si se fuerza, `422`.
- Plantilla con encabezado de texto, cuerpo de texto y botones de respuesta rápida (el caso real `notificacion_48h`): enviable.
- Plantilla con un hueco solo en el encabezado, o solo en un botón: también se rechaza (no es un caso especial del cuerpo).
- Idioma nulo o distinto: se compara exacto; sin coincidencia, el proveedor falla y no se envía nada.
- Plantilla aprobada al listar y rechazada en Meta antes de enviar: falla en el envío, con el motivo del proveedor; el catálogo no se cachea.
- Dos pulsaciones seguidas (doble clic) con la misma clave: un solo mensaje.
- Reintento del trabajador tras caída: la misma clave y la misma referencia, un solo mensaje entregado.

## 9. Datos y contratos

- **Entradas:** `POST /v1/tenants/:tenantId/conversations/:conversationId/messages` con unión discriminada:
  - texto: `{ kind: 'text', body, idempotencyKey }` (sin `kind` se asume texto, para no romper a quien ya envía);
  - plantilla: `{ kind: 'whatsapp_template', whatsappTemplate: { name, language }, idempotencyKey }`.
- **Salidas:** `conversationMessage` gana `whatsappTemplate: { name, language } | null` para que el historial muestre que fue una plantilla.
- **Catálogo:** cada elemento gana `channelAccountIds` (nuestros identificadores internos de canal, nunca los del proveedor) y `variables` (huecos detectados).
- **Resumen de conversación:** gana `channelAccountId` (identificador interno) para que la interfaz sepa desde qué cuenta se envía.
- **Estados:** `queued` → `sending` → `sent` | `failed` (y `queued` otra vez si el fallo es reintentable).
- **Persistencia:** `messages.whatsapp_template_name`, `messages.whatsapp_template_language` (nulos, aditivos). `body` pasa a ser la copia visible.
- **Integraciones:** `POST /v1/inbox/conversations/{conversationId}/messages` de Zernio con `template: { elements: [{ name, language }] }`. Verificado contra su documentación oficial.

## 10. Seguridad y privacidad

- Autorización: membresía en el espacio de la conversación, igual que el envío de texto; el espacio sale del token, nunca de la petición.
- No se exponen identificadores del proveedor al navegador: solo identificadores internos de canal.
- La validación del catálogo ocurre en el límite (servicio de aplicación), no en la interfaz.
- Los registros llevan códigos seguros (`zernio_http_400`, `whatsapp_template_variables_unsupported`), sin textos de plantilla, teléfonos ni cuerpos de conversación.
- Amenaza considerada: forzar el envío de una plantilla de otra cuenta del espacio para gastar su cuota; se corta con la comprobación de pertenencia al catálogo de esa cuenta.

## 11. Observabilidad

- Logs seguros: `worker.outbox_dispatch_failed` con `failureCode` (ya existe) y el nuevo código de rechazo local.
- Métricas: envíos de plantilla fallidos por código del proveedor.
- Alertas: aumento de `failed` con `zernio_http_400`/`platform_api_error` (plantilla retirada en Meta).
- Correlación: `Idempotency-Key` del mensaje y `messageId` del proveedor.

## 12. Migración y rollback

- Migración aditiva: dos columnas nulas y una restricción de coherencia (nombre y idioma van juntos o no van).
- Compatibilidad: el contrato acepta el cuerpo de texto de siempre sin `kind`; ninguna interfaz existente se rompe.
- Rollback: dejar de enviar plantillas deja las columnas sin uso; no hay datos que revertir.

## 13. Plan de pruebas

- **Unitarias:** detección de huecos en cualquier componente; unión del contrato (texto sin `kind`, plantilla, mezcla rechazada); coherencia de la idempotencia con referencia de plantilla.
- **Integración:** listado del catálogo con cuentas y huecos; rechazo de plantilla de otra cuenta; rechazo por variables; cuerpo del despacho con `template`.
- **End-to-end:** clic en el panel → confirmación → burbuja en el historial con estado.
- **Antiatajo:** variantes de la misma clase (hueco en encabezado / cuerpo / botón / pie), límites (`name` vacío, `language` vacío, textos largos), estados inválidos (texto y plantilla juntos, canal ajeno) y repetición (doble clic, reintento).

## 14. Criterios de aceptación

- [ ] Desde una conversación de WhatsApp se puede enviar `notificacion_48h` y aparece en el historial con su estado.
- [ ] El panel solo ofrece plantillas de la cuenta de esa conversación y marca las que declaran variables.
- [ ] Una plantilla con variables, o ajena a la cuenta, se rechaza con motivo claro y sin encolar nada.
- [ ] Un texto libre se sigue enviando igual que antes, sin `kind`.
- [ ] Un fallo del proveedor por plantilla inexistente no se reintenta; `429`/`5xx` sí, con la misma clave.
- [ ] Todos los controles de calidad aplicables pasan.
- [ ] Documentación y decisiones actualizadas.
