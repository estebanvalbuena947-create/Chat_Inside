# Especificación: reconectar y remover un canal

- **Estado:** aprobada
- **Responsable:** `apps/api/src/zernio` (la cuenta de canal vive ahí)
- **Fecha:** `2026-10-08`

## 1. Problema

Hoy un canal solo se puede **conectar** y **renombrar**. Si la cuenta se desvincula en el proveedor,
si el token caduca o si se conectó la cuenta equivocada —como pasó con las dos cuentas de WhatsApp
homónimas—, no hay forma de retirarla ni de volver a conectarla desde la bandeja. La lista de canales
sigue mostrándola como si estuviera operativa, y el catálogo de plantillas sigue consultándola.

## 2. Resultado esperado

Un administrador puede **retirar** un canal y **reconectarlo**, desde la misma pantalla donde lo
conectó. Retirar un canal lo desconecta en el proveedor, lo saca de la lista de canales operativos y
del catálogo de plantillas, y hace que cualquier envío hacia él falle **con un motivo claro** en lugar
de intentarse contra una cuenta que ya no está. La historia de conversaciones y mensajes **se
conserva**: no se borra nada.

## 3. No objetivos

- Borrar conversaciones, mensajes o adjuntos del canal retirado.
- Ocultar del listado de la bandeja las conversaciones que ya existen de ese canal (decisión explícita: no se esconden datos sin pedirlo; ver regla 7).
- Retirar canales automáticamente por token caducado: eso exige un diagnóstico de salud que no existe todavía.
- Liberar el número provisionado (sigue facturándose en el proveedor; es otra decisión, con su propia confirmación).

## 4. Actores y permisos

| Actor               | Puede                                                   | No puede                      |
| ------------------- | ------------------------------------------------------- | ----------------------------- |
| Administrador       | Retirar y reconectar un canal de su espacio             | Tocar canales de otro espacio |
| Supervisor y agente | Ver la lista de canales operativos                      | Retirar ni reconectar         |
| Proveedor (Zernio)  | Desconectar la cuenta y dejarla en su ventana de gracia | —                             |

## 5. Reglas e invariantes

1. **Retirar es desconectar, no borrar.** La fila de `channel_accounts` se conserva porque `conversations` y `messages` la referencian con `on delete restrict`: borrarla rompería la historia.
2. Se marca con un instante (`disconnected_at`), y ese instante es lo que saca al canal de los listados operativos y del catálogo de plantillas.
3. **Idempotencia:** retirar dos veces no falla; el proveedor responde `404` la segunda y eso se trata como éxito (ya estaba fuera).
4. Un canal retirado no puede enviar: el encolado **falla explícitamente**, con un motivo que nombra el canal. Nunca un envío silencioso hacia una cuenta desconectada.
5. **Reconectar** abre el flujo de conexión de esa plataforma; si la cuenta sigue viva en el proveedor, basta con volver a adjuntarla. Al quedar registrada, el canal deja de estar retirado.
6. Solo un administrador del espacio puede retirar o reconectar.
7. Las conversaciones y mensajes del canal retirado **se conservan y se siguen viendo** en la bandeja. Se elige no esconder datos por un cambio de configuración.
8. Reclamar el número o la cuenta en el proveedor es una decisión aparte: retirar aquí no cancela la facturación.

## 6. Flujo principal (retirar)

1. El administrador abre Canales y pulsa **Remover** en un canal conectado.
2. La interfaz pide confirmación y dice qué se conserva y qué deja de funcionar.
3. La API comprueba membresía y rol, y que el canal es de ese espacio.
4. La API pide al proveedor desconectar la cuenta; un `404` se acepta como «ya estaba fuera».
5. La API marca `disconnected_at` y devuelve el canal.
6. El canal desaparece de la lista operativa y del catálogo de plantillas.

## 7. Flujo principal (reconectar)

1. El administrador pulsa **Reconectar**.
2. La API devuelve la autorización del proveedor para esa plataforma, igual que la conexión inicial.
3. Al volver, la cuenta se registra (por el callback o por el webhook) y su `disconnected_at` queda limpio.

## 8. Flujos alternos y errores

- **El proveedor no está disponible al retirar** → `503`; el canal **no** se marca como retirado (no se miente sobre el estado). Se puede reintentar.
- **El canal ya estaba retirado** → se acepta y se devuelve igual: es idempotente.
- **El canal no existe o es de otro espacio** → `404`.
- **Sin rol de administrador** → `403`.
- **Envío hacia un canal retirado** → `422` con el motivo; no se encola nada.
- **Reconectar un canal que no está retirado** → se permite; es simplemente volver a conectar.

## 9. Casos límite

- Dos canales de la misma plataforma: retirar uno no toca al otro.
- Canal retirado con conversaciones abiertas: siguen visibles y **no** se pueden responder (el envío falla y lo dice).
- Reconectar la **misma** cuenta del proveedor: vuelve la misma fila, sin duplicar (la clave única es proveedor + cuenta).
- Reconectar y que el proveedor entregue una cuenta **nueva**: se registra otra fila y la anterior queda retirada.
- Dos peticiones simultáneas de retirada: la segunda ve el `404` del proveedor y termina igual.
- El catálogo de plantillas de un espacio sin canales operativos devuelve vacío, no un error.

## 10. Datos y contratos

- **Persistencia:** `channel_accounts.disconnected_at timestamptz` (anulable, aditivo).
- **Rutas nuevas:** `DELETE /v1/tenants/:tenantId/channels/:channelId` y `POST /v1/tenants/:tenantId/channels/:channelId/reconnect`.
- **Respuesta:** el canal (`item`) con un campo nuevo `disconnectedAt` en el listado.
- **Listado de canales:** solo los operativos (`disconnected_at is null`).
- **Catálogo de plantillas:** solo cuentas operativas.
- **Integración:** `DELETE /v1/accounts/{accountId}` del proveedor; repetir da `404` y hay ventana de gracia de una hora.

## 11. Seguridad y privacidad

- Autorización por membresía **y rol de administrador** en las dos rutas.
- El espacio sale del token, nunca de la petición.
- No se registran tokens ni identificadores internos del proveedor en los logs; los fallos usan códigos.
- Amenaza considerada: que un miembro cualquiera retire un canal para dejar la operación sin respuesta; se corta con el rol.

## 12. Migración y rollback

- Migración aditiva, sin reescritura: la columna nace nula, así que **todos los canales actuales siguen operativos**.
- Compatibilidad: el listado gana un campo y filtra por nulo; nada más cambia para quien ya lo consumía.
- Rollback: dejar de usar la columna devuelve el comportamiento anterior; los canales retirados volverían a aparecer.

## 13. Plan de pruebas

- **Unitarias:** desconexión idempotente; `404` del proveedor como éxito; `503` no marca retirado; sin rol → `403`; canal ajeno → `404`.
- **Integración:** el listado excluye retirados; el catálogo de plantillas no consulta cuentas retiradas; el encolado rechaza el canal retirado con motivo; al adjuntar de nuevo se limpia el estado.
- **Antiatajo:** variantes (dos canales de la misma plataforma), límites (retirar dos veces), estados inválidos (canal inexistente, ajeno, sin rol) y repetición (doble petición).

## 14. Criterios de aceptación

- [ ] Un administrador retira un canal desde la bandeja y desaparece de la lista operativa.
- [ ] La historia de ese canal sigue en la bandeja y no se pierde nada.
- [ ] Un envío hacia el canal retirado falla con un motivo claro y no se encola.
- [ ] El catálogo de plantillas deja de consultar las cuentas retiradas.
- [ ] Reconectar devuelve al canal al estado operativo.
- [ ] Todos los controles de calidad aplicables pasan.
- [ ] Documentación y decisiones actualizadas.
