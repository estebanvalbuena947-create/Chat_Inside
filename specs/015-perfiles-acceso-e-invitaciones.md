# Especificación: perfiles, acceso por rol e invitaciones

- **Estado:** implementada
- **Responsable:** acceso y tenancy
- **Fecha:** 2026-09-28
- **Cierre:** implementada el 2026-09-28 sin migración, sobre `memberships`. Corregida el 2026-10-08: el enlace se emite una sola vez y el callback del navegador guarda su sesión antes de crear la contraseña. El enlace se muestra en pantalla para que el administrador lo comparta; este flujo no envía correo automático.

## Resultado

El acceso a la interfaz se concede por invitación desde el propio producto y cada integrante opera según su rol. El administrador puede invitar, cambiar roles y retirar accesos, sin poder dejar al tenant sin administrador por error.

## Matriz de capacidades

| Capacidad                                                    | admin | supervisor | agente |
| ------------------------------------------------------------ | ----- | ---------- | ------ |
| Ver bandeja, historial, etiquetas aplicadas y notas privadas | sí    | sí         | sí     |
| Responder mensajes y cambiar el estado de la conversación    | sí    | sí         | sí     |
| Activar o pausar el bot de una conversación                  | sí    | sí         | sí     |
| Crear notas privadas y marcar conversaciones como leídas     | sí    | sí         | sí     |
| Crear respuestas rápidas y editar las propias                | sí    | sí         | sí     |
| Editar o eliminar respuestas rápidas de otra persona         | sí    | sí         | no     |
| Asignar conversaciones a integrantes                         | sí    | sí         | no     |
| Administrar la biblioteca de etiquetas                       | sí    | sí         | no     |
| Conectar y nombrar canales                                   | sí    | no         | no     |
| Invitar, cambiar roles y retirar accesos                     | sí    | no         | no     |

## Reglas

1. La pertenencia `(tenant, persona)` es la única fuente de acceso; el rol vive en ella y la API es la autoridad. La interfaz solo refleja la decisión.
2. Invitar requiere rol `admin`. El correo se valida y se normaliza a minúsculas antes de usarse.
3. Invitar dos veces al mismo correo no duplica la pertenencia ni cambia el rol existente: devuelve la pertenencia vigente y un enlace nuevo.
4. Al invitar a alguien que aún no tiene cuenta, el enlace le permite establecer su contraseña. Si ya tiene cuenta, el enlace solo inicia sesión: no se crea una segunda cuenta ni se cambia su contraseña.
5. Un tenant conserva **siempre al menos un administrador**: no se puede degradar ni retirar al último. El intento responde conflicto, no un error genérico.
6. Retirar una pertenencia no elimina la cuenta de la persona ni sus accesos a otros tenants. Las conversaciones que tuviera asignadas quedan sin asignar, porque la relación ya está definida con esa consecuencia.
7. Solo se puede cambiar el rol o retirar a integrantes del mismo tenant del solicitante.
8. El enlace de invitación es un secreto de un solo uso: cada operación emite exactamente uno, se entrega únicamente al administrador que lo genera y nunca se registra en logs ni en la bitácora de eventos.
9. Los tokens de la invitación se reciben solo en el fragmento URL y el callback del navegador los guarda como sesión antes de permitir crear una contraseña; la navegación que sigue elimina el fragmento del historial y un enlace inválido o vencido no concede sesión.

## Contrato

- `POST /v1/tenants/:tenantId/invitations` con `{ email, role }` devuelve `{ item: { email, role, inviteLink, requiresPassword } }`.
- `PATCH /v1/tenants/:tenantId/members/:userId` con `{ role }` devuelve `{ item: { userId, email, role } }`.
- `DELETE /v1/tenants/:tenantId/members/:userId` devuelve `{ item: { userId } }`.
- `GET /v1/tenants/:tenantId/members` ya existe y sigue devolviendo los integrantes con su rol.
- Sin sesión `401`; sin rol `admin` `403`; integrante ajeno al tenant `404`; entrada inválida `400`; ruptura del invariante del último administrador `409`.

## Datos, seguridad y rollback

- No hay migración: `memberships` ya existe con claves compuestas por tenant, que impiden pertenencias cruzadas.
- El enlace se genera con la API de administración de Auth y la clave privada permanece en el servidor. Este flujo no envía correo: el administrador recibe el enlace en pantalla para compartirlo manualmente.
- Si la URL de callback no está autorizada en el proyecto, Auth no puede devolver la sesión a la aplicación. Debe registrarse `${APP_PUBLIC_URL}/auth/callback` entre las URLs de redirección autorizadas antes de desplegar.
- Rollback: dejar de exponer los comandos de invitación y de gestionar integrantes. Las pertenencias y los roles existentes permanecen vigentes.
