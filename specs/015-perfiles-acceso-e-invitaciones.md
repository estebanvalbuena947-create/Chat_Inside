# Especificación: perfiles, acceso por rol e invitaciones

- **Estado:** implementada
- **Responsable:** acceso y tenancy
- **Fecha:** 2026-09-28
- **Cierre:** implementada el 2026-09-28 sin migración, sobre `memberships`. Corregida el 2026-10-08: el enlace se emite una sola vez y el callback del navegador guarda su sesión antes de crear la contraseña. El enlace se muestra en pantalla para que el administrador lo comparta; este flujo no envía correo automático. Ampliada el 2026-10-14 (ADR-056, `specs/036`): cuando el enlace no concede sesión, el acceso dice el motivo en lugar de mostrar un formulario indistinguible de un error de credenciales. Corregida el 2026-10-14 (ADR-057, `specs/037`): el enlace nuevo no se canjea al abrirse por una previsualización, porque el secreto viaja en el fragmento. Corregida el 2026-10-15 (ADR-058, `specs/037`): la invitación y la recuperación se entregan por el correo oficial del proyecto, el enlace se canjea al abrirlo sin pantalla intermedia, se admite la recuperación de contraseña y el alta exige la política de contraseñas del proyecto.

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
4. Al invitar a alguien que aún no tiene cuenta, el enlace le permite indicar su nombre visible y establecer su contraseña. Si ya tiene cuenta, el enlace solo inicia sesión: no se crea una segunda cuenta ni se cambia su contraseña. La contraseña debe cumplir la política del proyecto: al menos ocho caracteres con una minúscula, una mayúscula, un número y un símbolo.
5. Un tenant conserva **siempre al menos un administrador**: no se puede degradar ni retirar al último. El intento responde conflicto, no un error genérico.
6. Retirar una pertenencia no elimina la cuenta de la persona ni sus accesos a otros tenants. Las conversaciones que tuviera asignadas quedan sin asignar, porque la relación ya está definida con esa consecuencia.
7. Solo se puede cambiar el rol o retirar a integrantes del mismo tenant del solicitante.
8. El enlace de acceso es un secreto de un solo uso: cada operación emite exactamente uno, Auth lo envía al correo de la persona y nunca se registra en logs ni en la bitácora de eventos.
9. Los enlaces llegan por correo con `hashed_token` y el tipo de verificación solo en el fragmento de `/auth/invite`. Esa página canjea el hash al cargar, elimina el fragmento del historial y abre sesión, sin pantalla intermedia: `invite` pide nombre y contraseña, `magiclink` entra a la bandeja sin cambiar la contraseña existente y `recovery` restablece la contraseña. `/auth/callback` conserva la lectura de tokens implícitos únicamente para enlaces anteriores.

## Contrato

- `POST /v1/tenants/:tenantId/invitations` con `{ email, role }` devuelve `{ item: { email, role, emailSent, requiresPassword } }`. El enlace no viaja en la respuesta: Auth lo envía al correo.
- `PATCH /v1/tenants/:tenantId/members/:userId` con `{ role }` devuelve `{ item: { userId, email, role } }`.
- `DELETE /v1/tenants/:tenantId/members/:userId` devuelve `{ item: { userId } }`.
- `GET /v1/tenants/:tenantId/members` ya existe y sigue devolviendo los integrantes con su rol.
- Sin sesión `401`; sin rol `admin` `403`; integrante ajeno al tenant `404`; entrada inválida `400`; ruptura del invariante del último administrador `409`.

## Datos, seguridad y rollback

- No hay migración: `memberships` ya existe con claves compuestas por tenant, que impiden pertenencias cruzadas.
- La clave privada de Auth permanece en el servidor y la API nunca entrega `action_link` ni un enlace a mano: Auth envía el correo con el SMTP del proyecto y el secreto viaja solo tras `#` en la página propia.
- El correo depende de que el dominio del remitente esté verificado en el proveedor del SMTP y de que las plantillas de invitación, recuperación y enlace mágico apunten a `/auth/invite` con `{{ .TokenHash }}`. `APP_PUBLIC_URL` debe ser el dominio público del chat. Los enlaces anteriores sí requieren que `${APP_PUBLIC_URL}/auth/callback` siga autorizado hasta que expiren.
- Rollback: dejar de exponer los comandos de invitación y de gestionar integrantes. Las pertenencias y los roles existentes permanecen vigentes.
