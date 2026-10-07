# Especificación: acciones sobre comentarios

- **Estado:** implementada

**Cierre:** implementada: el servicio y el controlador de moderacion existen y sus cinco rutas aparecen mapeadas al arrancar la API. Revisado el 2026-10-06.

- **Responsable:** integración de comentarios
- **Fecha:** 2026-10-01
- **Complementa:** `specs/019-zernio-meta-conversions-api.md` (independiente)

## 1. Problema

Los comentarios de las publicaciones llegan a la bandeja y se ven, pero no se pueden atender. El
equipo tiene que salir a la aplicación de Instagram para ocultar un comentario ofensivo, para
responder en privado y continuar la conversación, o para corregir un comentario mal escrito por
nosotros. Cada salida cuesta tiempo y deja la conversación partida entre dos herramientas.

## 2. Resultado esperado

Desde la conversación de un comentario, con los permisos que ya gobiernan verla, se puede:

- **Ocultar y volver a mostrar** el comentario.
- **Responder en privado**: se abre o continúa el mensaje directo con esa persona.
- **Editar** el comentario **propio**.
- **Eliminar**, con confirmación explícita y sabiendo que no se deshace.

Y el estado real queda reflejado en la bandeja: lo que se ocultó se ve oculto, sin mentir.

## 3. No objetivos

- Responder en público desde aquí. Se evaluará más adelante; hoy la respuesta va en privado.
- Editar comentarios de terceros: la plataforma no lo permite.
- Automatizar respuestas a comentarios (`CreateCommentAutomationRequest` de Zernio): otro alcance.
- Moderar comentarios de publicaciones que no son de las cuentas conectadas.

## 4. Capacidades verificadas en Zernio

| Acción                                | Referencia                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Ocultar y volver a mostrar            | `unhideInboxComment` (y su opuesto)                                                                 |
| Eliminar                              | [delete-inbox-comment](https://docs.zernio.com/comments/delete-inbox-comment.mdx)                   |
| Editar                                | `editInboxComment`                                                                                  |
| Respuesta privada                     | [send-private-reply-to-comment](https://docs.zernio.com/comments/send-private-reply-to-comment.mdx) |
| Listar comentarios de una publicación | `getInboxPostComments`                                                                              |

Antes de implementar hay que **leer el contrato exacto** de cada uno: identificadores que exige,
respuesta, errores y límites. No se construye sobre una suposición.

## 5. Reglas e invariantes

1. **Primero la plataforma, después lo nuestro.** Ninguna acción se marca como hecha en la interfaz
   antes de que el proveedor confirme. Si falla, la interfaz lo dice; nunca miente.
2. **Idempotencia.** Ocultar lo ya oculto, o eliminar lo ya eliminado, no es un error: la acción se
   completa sin duplicar llamadas ni dejar estados imposibles.
3. **Nada se pierde.** Al ocultar, eliminar o editar, el texto original **se conserva** en nuestra
   base con su estado y la fecha. Sabemos qué decía, quién lo cambió y cuándo. Borrar de la
   plataforma no es borrar nuestra evidencia.
4. **Solo se edita lo propio.** La interfaz no ofrece editar un comentario del cliente. Si la
   plataforma llegara a rechazarlo, el motivo se muestra tal cual.
5. **La respuesta privada es un mensaje de la conversación.** Abre o continúa el directo y queda
   registrada como mensaje saliente, con su estado de envío. La conversación no se parte.
6. **Eliminar es irreversible**: exige confirmación explícita y queda registrado quién lo hizo.
7. **Permisos**: los mismos que ya gobiernan ver la conversación. No se inventa un permiso nuevo
   mientras el existente alcance.
8. **Sin secretos ni datos personales** en registros ni en la interfaz.

## 6. Datos

Sobre el mensaje que representa el comentario (aditivo e idempotente):

| Columna                        | Para qué                                         |
| ------------------------------ | ------------------------------------------------ |
| `comment_state`                | `visible`, `hidden` o `deleted` en la plataforma |
| `comment_edited_at`            | cuándo se editó por última vez                   |
| `comment_original_body`        | el texto tal como llegó, para no perderlo nunca  |
| `comment_moderated_by_user_id` | quién hizo la última acción                      |
| `comment_moderated_at`         | cuándo la hizo                                   |

## 7. Interfaz

En la conversación de un comentario, junto al mensaje:

| Control                   | Visible cuando                                                  |
| ------------------------- | --------------------------------------------------------------- |
| **Ocultar** / **Mostrar** | el comentario es del cliente y no está eliminado                |
| **Responder en privado**  | siempre                                                         |
| **Editar**                | el comentario **es nuestro**                                    |
| **Eliminar**              | con confirmación; nunca junto a _Ocultar_ sin separación visual |

El estado se muestra en el propio mensaje: un comentario oculto no se ve igual que uno visible.

## 8. Errores y casos límite

- El comentario ya no existe en la plataforma: se marca `deleted` y se informa con claridad.
- Sin permiso en la cuenta conectada: se muestra el motivo del proveedor.
- Límites de la plataforma (por ejemplo, editar solo dentro de cierto tiempo): se muestran tal cual.
- Acción repetida o dos personas actuando a la vez: idempotente; gana la última confirmada por la
  plataforma y queda registrado quién.
- Comentario de una publicación que ya no existe.

## 9. Pruebas

- El cliente traduce y valida las respuestas del proveedor, incluidos los errores.
- La regla marca primero la plataforma: si el proveedor falla, el estado local **no** cambia.
- Ocultar dos veces no duplica llamadas ni rompe el estado.
- Eliminar conserva el texto original y la autoría.
- Editar solo se permite sobre el comentario propio.
- La respuesta privada queda como mensaje saliente con su estado.

## 10. Respuestas automáticas (el bot)

Se añade la misma capacidad, pero accionada por el bot en lugar de por una persona. Las reglas
manuales siguen valiendo; estas son las que evitan que un bot haga estragos.

### Por dónde pasa

**Nuestro bot, a través de nuestra API.** La lógica vive en n8n, que ya conoce el negocio; nuestra
API expone la operación como herramienta con credencial de máquina y traduce a Zernio. Así la
conversación guarda **todas** las respuestas en un solo sitio.

Zernio ofrece además automatizaciones propias de comentario (`CreateCommentAutomationRequest`).
**No se usarán**: responderían por fuera de nuestra API, y esas respuestas no quedarían registradas
en la conversación. Dos fuentes de verdad es exactamente lo que este proyecto evita.

### Reglas adicionales

1. **Nunca responder a un comentario propio.** El listado del proveedor trae `from.isOwner`: si es
   nuestro, el bot no responde. Sin esta regla, el bot se contesta a sí mismo.
2. **Un tope por hilo.** Un número máximo de respuestas automáticas por conversación de comentario,
   configurable. Un cliente que responde y un bot que responde pueden entrar en bucle; el tope lo
   corta y deja el hilo para una persona.
3. **Interruptor por espacio.** El bot de comentarios se activa y se desactiva sin desplegar. Si algo
   se descontrola, se apaga desde la configuración, no con una prisa en el servidor.
4. **Idempotencia real.** La publicación de la respuesta admite la cabecera `Idempotency-Key` de
   Zernio: el mismo comentario con el mismo texto reutiliza la clave y **no se publica dos veces**,
   aunque el bot reintente. El proveedor conserva la clave 24 horas.
5. **No responder a un comentario que la plataforma no permite responder.** `canReply` del listado
   manda; si está en falso, no se llama.
6. **Nada de botones ni adjuntos en la respuesta privada** mientras el destinatario no sea seguidor:
   un intento rechazado **consume igualmente** el único envío disponible.
7. **Queda registrado que fue el bot**, con su fecha y el texto. Igual que el hecho ganado: siempre
   se sabe si lo hizo una persona o el bot.

### Decisión pendiente del negocio

Qué forma tiene la respuesta del bot: **pública**, **privada** o **combinada** (pública breve más
privado). Cambia el alcance y la experiencia, y no la debe decidir la implementación.

### Pruebas

- El bot no responde a un comentario propio.
- Alcanzado el tope del hilo, deja de responder y queda visible el motivo.
- Con el interruptor apagado, no se llama al proveedor.
- Un reintento del bot con el mismo texto no publica dos veces.
- Un fallo del proveedor no deja la conversación marcada como respondida.

## 11. Criterios de aceptación

- [ ] Desde la conversación se oculta, se muestra, se responde en privado y se elimina con confirmación.
- [ ] El estado del comentario en la bandeja refleja siempre lo que confirmó la plataforma.
- [ ] El texto original y la autoría de cada acción quedan conservados.
- [ ] Editar solo aparece sobre comentarios propios.
- [ ] Los errores del proveedor se muestran con su motivo, sin ocultarlos.
- [ ] Todos los controles de calidad aplicables pasan.
- [ ] Documentación y decisiones actualizadas.
