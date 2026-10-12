# Especificación: el bot cierra la conversación y apaga la automatización

Cuando el bot decide dejar de atender una conversación —hoy, ante una solicitud inequívoca de
servicios sexuales— necesita dos efectos en el mismo acto: la conversación queda **cerrada** y la
automatización queda **apagada**. Cerrar sin apagar dejaría al bot respondiendo en un hilo cerrado;
apagar sin cerrar dejaría la conversación pendiente de atención cuando ya no lo está.

La acción se pide sin conocer ninguna versión: `POST /v1/tools/conversations/{id}/close` con
`{ "pauseBot": true }`, donde `pauseBot` se puede poner en `false` para cerrar el hilo dejando el bot
disponible. La respuesta devuelve el estado resultante (`status`, `automationMode`).

Es **idempotente**: si la conversación ya está cerrada y el bot apagado, la respuesta devuelve el
estado vigente sin escribir. Si otra persona la movió entre la lectura y la escritura, el servidor
responde `409` en lugar de pisar ese cambio; el bot no reintenta solo, y el flujo puede decidir qué
hacer.

La fecha de cierre se sella al cerrar y se limpia al reabrir, porque lo que se cuenta por periodo son
las conversaciones que se cerraron, no las que están cerradas hoy. Un mensaje entrante del cliente
reabre la conversación por sí solo: cerrar no es bloquear a nadie.

En el mismo corte se expone `POST /v1/tools/conversations/{id}/automation` con `{ "mode" }` para el caso
contrario —pausar un hilo abierto y volver a encenderlo—, porque es la misma escritura y no tenía
sentido dejar el interruptor inalcanzable para el bot.

El alcance del token es `conversations` y el espacio sale del token: una credencial no puede cerrar
conversaciones de otro espacio. Estas dos escrituras son las únicas que el bot hace sobre una
conversación; asignar sigue siendo de `/v1/tools/assignments` y la sede de `…/branch`.
