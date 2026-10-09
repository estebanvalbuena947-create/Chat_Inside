# Registro de validación contractual

**Fecha:** 2026-08-13
**Fase:** 0 — validación documental y de viabilidad; fase 1 — datos iniciales; fase 2 — Auth y API segura
**Alcance:** validación documental, configuración MCP limitada, migraciones del proyecto de desarrollo y código de sesión/API. Sin secretos privados, datos de clientes, canales, webhooks ni integraciones Zernio/n8n.

## Resultado

## Fase 19 - Plataforma de canal y bandeja adaptable

- El worker toma `message.platform` solo de webhooks Zernio autenticados y sincroniza de forma idempotente la cuenta de canal del mismo tenant. No infiere valores desde contactos, mensajes ni UI.
- Se reparó una cuenta de canal que no tenía plataforma, usando el último evento firmado de esa misma cuenta. La consulta agregada posterior confirmó 17 conversaciones con plataforma `instagram`, sin leer texto ni datos de contacto.
- La bandeja usa columnas flexibles y una densidad compacta; filtros, listado de contactos, historial y detalles conservan desplazamientos independientes.
- Controles: 95 pruebas aprobadas (17 dominio, 56 API y 22 worker), typecheck, lint y formato.

## Fase 18 - Alcance de bandeja por asignacion

- Todo miembro del tenant conserva la vista `Todas`. La vista `Asignadas a mi` filtra en la API por el usuario autenticado; la web no envia ni controla un ID de responsable.
- El nuevo alcance se combina con etiquetas y mantiene `all` como valor por defecto compatible. No hay migracion, efecto externo ni cambio de asignaciones.
- Controles: 93 pruebas aprobadas (17 de dominio, 56 de API y 20 de worker) y typecheck.

## Fase 17 - Base segura del Agent Gateway

- Se definio una solicitud minima de agente y un puerto de transporte interno. No contiene notas privadas, secretos, URL, autenticacion ni configuracion de n8n.
- El gateway invoca su transporte solamente para conversaciones `auto`; `paused` y `suggest` se omiten. Toda salida se valida con el contrato estricto antes de convertirse en decision interna.
- Este corte no esta conectado al worker, Zernio, outbox ni mensajes. Controles: 91 pruebas aprobadas (17 de dominio, 54 de API y 20 de worker) y typecheck.

## Fase 16 - Notas privadas por conversacion

- La migracion remota `20260815004834_add_conversation_private_notes` crea `conversation_notes`, con tenant, conversacion y autor ligados mediante FKs compuestas, limite de 2000 caracteres e idempotencia por tenant.
- La API propia permite listar y crear notas solo despues de validar sesion, membresia y la conversacion del mismo tenant. La UI usa BFF; las notas no se envian a Zernio, n8n ni al contacto.
- Se confirmo RLS activa y sin privilegio SELECT para `anon` ni `authenticated`. Controles: 87 pruebas aprobadas (17 de dominio, 54 de API y 16 de worker) y typecheck.

## Fase 15 - Interruptor de bot por conversacion

- La migracion remota `20260814235912_add_conversation_automation_version` agrega `automation_version` a `conversations`, con valor inicial `1` y restriccion positiva.
- Cualquier miembro autenticado del tenant puede pausar o reactivar el bot de una conversacion usando la API propia. El cambio es condicionado por la version visible, es idempotente para el mismo objetivo y rechaza el conflicto para un objetivo contrario.
- La web usa BFF y no expone acceso directo a Supabase. Este corte no envia mensajes ni ejecuta n8n/Zernio; deja el control persistido para que una integracion futura lo respete antes de cada efecto externo.
- Controles: 82 pruebas aprobadas (17 de dominio, 49 de API y 16 de worker), typecheck, lint, formato, compilacion de API y health local. Se confirmo en Supabase la nueva columna y RLS activa sin SELECT para `anon` ni `authenticated`.

## Fase 14 de asignacion segura de conversaciones

- La migracion remota `20260814232831_add_conversation_assignment_version` agrego `assignment_version` a `conversations`, con valor inicial `1` y restriccion positiva. Los tipos remotos confirmaron la columna y la comprobacion de seguridad confirmo RLS activa sin `SELECT` para `anon` ni `authenticated`.
- Administradores y supervisores pueden asignar o liberar por la API propia. La API valida sesion, rol, tenant, conversacion, integrante de destino y version visible. Agentes pueden ver el responsable, pero no cambiarlo.
- El selector carga integrantes del tenant mediante BFF. No expone secretos, no consulta Supabase desde el navegador y no crea mensajes, outbox ni llamadas a Zernio.
- Controles aprobados: 79 pruebas (17 de dominio, 46 de API y 16 de worker), typecheck, lint, formato, build de API, health local, tipos remotos, RLS/privilegios, asesores y revision de diff. El build completo de Next no se ejecuta mientras el servidor de desarrollo sigue activo.

La arquitectura propuesta es compatible con los contratos públicos verificados de Zernio y con los controles de Supabase. El proyecto Supabase de desarrollo fue validado mediante MCP de solo lectura. No existe aún evidencia de entorno para declarar una integración completa: faltan canales Zernio conectados y el contrato de producción de n8n.

## Zernio — confirmado documentalmente

| Tema       | Evidencia confirmada                                                                                                                                 | Decisión resultante                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Webhooks   | HMAC-SHA256 sobre cuerpo crudo mediante `X-Zernio-Signature`.                                                                                        | Verificar antes de parsear y comparar en tiempo constante.                                         |
| Entrega    | `2xx` dentro de 5 s confirma; hasta siete intentos con backoff; entrega al menos una vez; ID estable en payload y encabezado.                        | Inbox durable con índice único por ID y worker fuera de la solicitud.                              |
| Envío      | `Idempotency-Key` funciona para JSON y multipart; misma clave/cuerpo repite respuesta, `409` en curso, `422` con cuerpo distinto; retención de 24 h. | Clave estable y cuerpo inmutable; después de 24 h, reconciliar en vez de reenviar automáticamente. |
| Estados    | El HTTP de envío solo confirma aceptación; los estados llegan por webhooks.                                                                          | La UI muestra `queued`/`sending` y confirma con eventos posteriores.                               |
| Tenant     | Los eventos Inbox incluyen `account.id`; el patrón oficial lo mapea a tenant local.                                                                  | Resolver tenant exclusivamente en servidor desde la cuenta local autorizada.                       |
| Multimedia | Zernio acepta URL pública o binario multipart.                                                                                                       | Worker envía multipart desde Storage privado; no se publican objetos de Supabase.                  |
| Backfill   | API de listado para alta inicial y reconciliación, no polling continuo.                                                                              | Backfill con cursor y barrido de reconciliación de baja frecuencia.                                |

Fuentes: [webhooks](https://docs.zernio.com/webhooks), [envío de mensajes](https://docs.zernio.com/messages/send-inbox-message) y [bandeja multi-tenant](https://docs.zernio.com/multi-tenant/inbox).

## Supabase — confirmado documentalmente

| Tema       | Evidencia confirmada                                                                                    | Decisión resultante                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| RLS        | Debe habilitarse para tablas en esquemas expuestos; las políticas se combinan con permisos de Postgres. | RLS por tenant y rol, probada como defensa adicional a la autorización de API.                    |
| Claves     | Las claves de servicio evaden RLS y no deben exponerse al navegador.                                    | `service_role` solo en API/worker; UI con sesión y API propia.                                    |
| Data API   | Las tablas nuevas ya no se exponen automáticamente por defecto.                                         | No se habilitará Data API para tablas operativas mientras la UI use exclusivamente la API propia. |
| Storage    | Storage usa control de acceso mediante RLS sobre `storage.objects`.                                     | Bucket privado, políticas por tenant y URLs firmadas de duración breve.                           |
| Plataforma | Las bibliotecas JS actuales requieren Node.js 22 o posterior.                                           | Fundaciones usarán Node.js 22 LTS o posterior compatible.                                         |

Fuentes: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Realtime](https://supabase.com/docs/guides/realtime) y [changelog](https://supabase.com/changelog).

## Bloqueos que requieren decisión o evidencia humana

1. Confirmar proveedor de despliegue y Redis administrado.
2. Obtener contrato real y autenticación del webhook de producción n8n; su JSON preliminar no está validado.
3. Conectar un canal de prueba Zernio y ejecutar pruebas de webhook, texto, imagen, video, estados y límites del canal.
4. Definir límites de archivo, retención, SLO, agentes, tenants y volumen esperado.

## MCP de Supabase — configurado

- **Nombre:** `supabase_chat_zernio`
- **Proyecto limitado:** `jidefunczooxxppqmkra` (`UI Chat Zernio`)
- **Modo:** lectura/escritura, limitado al proyecto de desarrollo tras autorización humana explícita.
- **Funciones disponibles:** `database`, `docs`, `debugging`, `development`
- **Autenticación:** OAuth; sin tokens guardados en el repositorio.
- **Aislamiento:** entrada MCP independiente del servidor existente para otro cliente; no se modificó ni eliminó esa entrada.

La configuración es global del cliente Codex. Una nueva sesión local de Codex debe cargarla antes de que sus herramientas estén disponibles en esa sesión.

## MCP de Supabase — validación de acceso

- **Fecha:** 2026-08-13
- **Operación:** `supabase_chat_zernio/list_tables` en una sesión efímera con sandbox de solo lectura.
- **Resultado:** acceso confirmado al proyecto limitado; se enumeraron 36 tablas de sistema en los esquemas `auth`, `storage`, `realtime` y `vault`.
- **Hallazgo:** no aparecen tablas operativas de Chat Zernio; el esquema de aplicación está disponible para fundaciones.
- **Límites respetados:** no se ejecutó SQL, no se leyeron filas, secretos ni configuración sensible, y no se aplicaron migraciones ni cambios.

## Fase 1 de datos — aplicada y verificada

- **Proyecto:** `jidefunczooxxppqmkra` (`UI Chat Zernio`).
- **Migraciones remotas:** `20260813174236_inside_spa_chat_foundation` y `20260813174403_add_tenant_foreign_key_indexes`.
- **Tablas creadas:** `tenants`, `memberships`, `contacts`, `conversations`, `messages`, `webhook_events` e `outbox_events`.
- **Aislamiento:** todas tienen RLS activado; `anon` y `authenticated` no tienen privilegio `SELECT`. No se crearon políticas permisivas antes de contar con sesiones y autorización de aplicación.
- **Integridad:** las relaciones compuestas impiden enlazar contactos, conversaciones, asignaciones y mensajes de tenants distintos; inbox y outbox tienen claves de deduplicación/idempotencia.
- **Rendimiento:** se agregaron los índices de claves foráneas que recomendó el asesor. Los avisos restantes de índices sin uso son esperados en un proyecto vacío, sin tráfico.
- **Tipos:** el esquema remoto generó tipos TypeScript correctamente como comprobación de contrato.
- **Datos:** todas las tablas tienen cero filas; no se sembraron clientes, usuarios, canales ni conversaciones.

## Fase 2 de Auth y API — implementada localmente

- **Web:** `@supabase/ssr` gestiona la sesión de cookies con una clave publicable. Se añadieron acceso en `/login`, cierre de sesión en `/auth/signout` y middleware de renovación de sesión; no hay consultas directas de tablas operativas desde la UI.
- **API:** `GET /v1/tenants/:tenantId/conversations?limit=…` valida la cabecera Bearer, valida el JWT con Auth y exige membresía del usuario en el tenant antes de consultar. El límite está entre 1 y 100; no existe escritura en este corte.
- **Secretos:** el cliente de servidor exige `SUPABASE_URL` y `SUPABASE_SECRET_KEY` en `apps/api/.env` (acepta `SUPABASE_SERVICE_ROLE_KEY` heredada). La clave no se creó, leyó ni registró; una clave publicable se guardó únicamente en `apps/web/.env.local`, archivo ignorado por Git.
- **Fallo cerrado:** sin Bearer la ruta devuelve `401`; con Bearer con formato válido pero sin clave privada devuelve `503`. `/health` informó `{"status":"ok","service":"api","supabase":"not_configured"}` en la comprobación local.
- **Pruebas:** 29 pruebas unitarias aprobadas, incluidos Bearer ausente/malformado, configuración sin secreto moderna o heredada y membresía de tenant ausente. Tipos, lint, formato y build se ejecutaron antes del cierre.
- **Configuración posterior:** el administrador configuró una `SUPABASE_SECRET_KEY` moderna en `apps/api/.env`. La API local informa `supabase: "configured"` y una consulta de administración mínima confirmó conectividad con Auth para la identidad administradora, sin registrar valores de clave ni datos de perfil.

## Onboarding inicial de Inside Spa — aplicado y verificado

- **Fecha:** 2026-08-13.
- La identidad proporcionada por el administrador fue comprobada contra Supabase Auth antes de modificar datos operativos.
- Se creó o reutilizó el tenant `inside-spa` (`Inside Spa`) y se asignó a esa identidad la membresía `admin` mediante una operación idempotente.
- La verificación posterior confirmó tenant, rol y pertenencia correctos. No se crearon contactos, conversaciones, canales ni otros usuarios; no se registran UUID ni correo en esta documentación.
- El asesor de seguridad mantiene los avisos informativos `rls_enabled_no_policy`, esperados mientras la Data API permanezca bloqueada. Reporta además que la protección de contraseñas filtradas de Auth está desactivada; debe activarse antes de incorporar más usuarios.

## Fase 3 de bandeja real — implementada localmente

- La API ofrece `GET /v1/tenants` y mantiene la verificación de membresía antes de listar conversaciones. La autorización quedó centralizada en `TenantAccessService` para no duplicarla entre rutas.
- La web consume un BFF interno (`/api/inbox`); valida claims y usa el JWT de sesión solo entre servidores. No consulta tablas de Supabase desde el navegador ni expone la clave privada.
- La interfaz ya no muestra nombres, mensajes ni contactos simulados. Distingue carga, error, usuario sin tenant, selección requerida y bandeja vacía.
- La consulta remota de comprobación confirmó que el administrador tiene membresía en `inside-spa` y que el tenant tiene cero conversaciones, por lo que la bandeja vacía es el resultado esperado.
- Tipos, 31 pruebas unitarias, lint, formato y build pasaron. No se modificó el esquema ni se escribieron contactos, conversaciones, mensajes o integraciones.

## Fase 4 de ingreso de Zernio — implementada y migrada

- **Webhook:** `POST /v1/webhooks/zernio` conserva el cuerpo binario, limita el tamaño a 256 KiB, requiere `X-Zernio-Signature` y verifica HMAC-SHA256 en tiempo constante antes de parsear JSON.
- **Aislamiento:** se creó `channel_accounts` con vínculo único `(provider, provider_account_id) → tenant_id`. Un evento normal sin una cuenta `zernio` asociada no se acepta ni se registra en otro tenant.
- **Durabilidad:** los eventos válidos se insertan en `webhook_events`; la restricción única existente por tenant e ID de proveedor convierte una repetición en respuesta exitosa sin una segunda fila. `webhook.test` firmado permite comprobar la ruta antes de registrar una cuenta.
- **Base remota:** migración `add_zernio_channel_accounts` aplicada al proyecto de desarrollo. La tabla tiene RLS activa y permisos de `anon`/`authenticated` revocados; no se crearon cuentas de canal, contactos, conversaciones ni mensajes.
- **Controles:** 36 pruebas unitarias, tipos, lint, formato, build y comprobación de diff pasaron. El asesor conserva los avisos informativos de RLS sin políticas —esperados porque la Data API está cerrada— y el aviso previo de protección contra contraseñas filtradas de Auth.
- **Pendiente:** configurar `ZERNIO_WEBHOOK_SECRET` únicamente en `apps/api/.env`, registrar el webhook temporal en Zernio y asociar el `account.id` real de su canal a Inside Spa. La normalización de eventos en el worker y el envío por API quedan fuera de este corte.

## Validación pública del webhook temporal

- Con la API local activa y el túnel temporal de Cloudflare en ejecución, un evento `webhook.test` firmado alcanzó `POST /v1/webhooks/zernio` y recibió `201`.
- La prueba no incluyó datos de clientes y no creó contactos, conversaciones ni mensajes. El webhook configurado en Zernio debe apuntar al túnel vigente; el enlace cambia si se reinicia Cloudflare.

## Onboarding de cuenta Zernio de Inside Spa — aplicado y verificado

- El administrador proporcionó un identificador de cuenta de Zernio desde el panel de conexiones.
- Se creó de forma idempotente el vínculo explícito `zernio account → inside-spa`; la comprobación posterior confirmó el aislamiento correcto.
- El identificador no se registra en esta documentación. No se crearon contactos, conversaciones, mensajes ni se enviaron efectos al proveedor.

## Fase 5 de normalizacion entrante - implementada y migrada

- El worker procesa unicamente eventos `message.received` ya autenticados y almacenados. Antes de persistir vuelve a comprobar que la cuenta del proveedor pertenece al tenant, por lo que nunca utiliza el nombre, texto ni datos del contacto para enrutar un evento.
- La migracion `add_inbound_message_normalization` agrego las referencias externas de conversacion/mensaje, la asociacion con cuenta de canal y el estado de reclamacion del inbox. La comprobacion remota confirmo esas columnas sin leer datos operativos.
- Contactos, conversaciones y mensajes se deduplican por tenant, cuenta y referencia de proveedor. Un nuevo mensaje reabre exclusivamente una conversacion resuelta; no se implementaron adjuntos, envios, n8n, SSE ni consultas de datos desde el navegador.
- El worker registra fallos con codigos seguros sin cuerpos, nombres, claves ni otros datos personales y permanece activo ante una indisponibilidad temporal de la consulta de inbox.
- Tipos, pruebas, lint, formato y build se ejecutaron al cierre. Los avisos del asesor permanecen: RLS sin politicas en tablas cerradas a Data API, proteccion de contrasenas filtradas de Auth pendiente e indices sin uso en un proyecto sin trafico.
- Una primera entrega real revelo que la clave parcial de contactos no era compatible con el `upsert` del worker. Se aplico la migracion `fix_contact_external_reference_upsert`, que la reemplaza por una restriccion unica no parcial sin eliminar datos. El evento fallido se repuso de forma controlada y la comprobacion posterior confirmo dos conversaciones y dos mensajes entrantes creados; un sobre con formato invalido quedo fallido sin crear datos.

## Fase 9 de actualización en tiempo real mediante SSE

- La API incorpora `GET /v1/tenants/:tenantId/events`: valida Bearer y membresía antes de abrir el stream. Sus eventos contienen solo un cursor hash opaco, nunca mensajes, contactos, credenciales ni datos de Supabase.
- La web incorpora el BFF `/api/events`. La sesión y el Bearer permanecen del lado de Next.js; el navegador utiliza `EventSource` contra su mismo origen y, ante una señal, vuelve a consultar sus rutas protegidas de bandeja e historial.
- La detección inicial usa sondeo acotado de actividad de inbox, outbox y mensajes. La reconexión con `Last-Event-ID` solicita una resincronización segura y la UI comprueba el chat abierto cada cuatro segundos como respaldo. No hubo migraciones ni dependencias nuevas.
- Controles locales aprobados: 59 pruebas (17 dominio, 26 API y 16 worker), comprobación de tipos completa, lint, formato, build de API y `GET /health` con Supabase configurado. El build completo de Next no se ejecutó porque el servidor de desarrollo sigue activo; el typecheck de la web sí pasó.
- Pendiente de comprobación visual: con la sesión abierta, recibir o enviar un mensaje debe actualizar la bandeja sin usar Ctrl+F5. Si fuera necesario revertir, se puede desactivar el BFF SSE y se conserva la recarga manual.

## Fase 10 de gestión de estados de conversación

- Se agregó la migración aditiva `add_conversation_status_version`. El administrador la aplicó desde el SQL Editor de UI Chat Zernio y una consulta de aplicación confirmó que la columna `status_version` está disponible, sin leer contenido de conversaciones.
- La API exige sesión, membresía del tenant, conversación existente, estado válido y versión visible. El BFF mantiene el token del lado del servidor y la interfaz ofrece las acciones Abrir, Pendiente y Resolver según el estado actual.
- Un reintento cuyo objetivo ya es el estado vigente devuelve éxito sin una nueva escritura; una versión obsoleta contra un estado diferente devuelve conflicto. La actividad de conversación también alimenta el cursor SSE opaco.
- Pendiente de comprobación visual: cambiar el estado desde la bandeja debe reflejar el nuevo botón y etiqueta. La aplicación de la migración mediante SQL Editor no pudo registrar la entrada en el historial remoto del CLI porque la cuenta conectada al CLI carece de acceso al proyecto; antes de una futura ejecución de `supabase db push` se debe reparar/alinear dicho historial desde una cuenta administradora.

## No realizado

- No se añadieron credenciales de servicio al proyecto ni se habilitó una consulta real contra datos remotos.
- No se crearon usuarios, membresías, tenants, clientes ni conversaciones de prueba.
- No se configuró Storage, Redis, Zernio, n8n, webhooks ni canales.
- No se implementaron comandos de escritura, políticas RLS de producto, MFA, CSRF ni rate limiting: requieren un corte de diseño y pruebas específico.

## Fase 11 de respuestas rápidas privadas

- El MCP `supabase_chat_zernio` quedó autenticado por OAuth y limitado al proyecto UI Chat Zernio. Las migraciones remotas `20260814222424_add_canned_responses` y `20260814223212_add_canned_response_creator_index` se aplicaron y sus archivos locales se alinearon con el historial remoto.
- `canned_responses` tiene RLS activo, no concede `SELECT` a `anon` ni a `authenticated`, y no contiene filas de demostración. Una consulta de verificación confirmó estas propiedades sin leer contenido operativo.
- La API y los BFF de Next.js mantienen la sesión y el token del lado del servidor. Agentes, supervisores y administradores pueden seleccionar una respuesta para rellenar el borrador; solo administradores pueden crear, editar o eliminar, con idempotencia de creación y control de versión.
- La selección no crea mensajes, outbox ni efectos en Zernio. Las pruebas cubren administración, repetición de creación, conflicto concurrente y pertenencia antes de listado.
- El asesor de seguridad conserva los avisos informativos de RLS sin políticas porque las tablas operativas están deliberadamente cerradas a la Data API. El asesor mantiene también el aviso preexistente de protección contra contraseñas filtradas de Auth desactivada; debe activarse antes de sumar más usuarios. El aviso de índice de clave foránea de `canned_responses` se corrigió; los avisos de índice sin uso son esperados mientras la tabla está vacía.

## Fase 12 de etiquetas internas privadas

- La migración remota `20260814224906_add_internal_conversation_labels` creó `labels` y `conversation_labels`; el archivo local fue alineado con ese historial. Las relaciones compuestas garantizan que una etiqueta solo pueda enlazarse con una conversación del mismo tenant.
- Ambas tablas tienen RLS habilitado y no conceden `SELECT` a `anon` ni a `authenticated`. La web no consulta Supabase: usa BFF autenticado y la API propia conserva la autorización de membresía y rol.
- La generación remota de tipos confirmó ambas tablas y las dos relaciones compuestas: vínculo a `conversations` y vínculo a `labels` por el mismo `tenant_id`.
- Administradores crean, editan y eliminan la biblioteca con idempotencia de creación y versión de concurrencia. Todos los miembros pueden consultar, aplicar o retirar etiquetas; esos dos comandos son idempotentes y no crean mensajes, outbox ni llamadas a Zernio.
- El encabezado del chat muestra las etiquetas aplicadas y permite aplicarlas/retirarlas. El panel de administración solo aparece para rol `admin`; la API sigue aplicando el permiso como fuente de verdad.
- Controles aprobados: 72 pruebas (17 dominio, 39 API y 16 worker), comprobación completa de tipos, lint, formato, build de API, `GET /health` con Supabase configurado y comprobación de diff. El build completo de Next no se ejecutó porque el servidor de desarrollo continúa activo; el typecheck de web sí pasó.
- Los asesores mantienen los avisos informativos de RLS sin políticas para tablas cerradas a la Data API y de índices sin uso en un entorno de bajo tráfico. Permanece el aviso preexistente de protección de contraseñas filtradas desactivada; debe habilitarse antes de sumar usuarios.

## Fase 13 de filtros por etiqueta

- La bandeja acepta `labelId` como filtro opcional a través del BFF autenticado. La API valida membresía y que la etiqueta pertenezca al tenant antes de leer sus vínculos; una etiqueta fuera del tenant no revela conversaciones.
- La lista se restringe por los IDs de `conversation_labels` ya comprobados. Sin vínculos devuelve una bandeja vacía y sin parámetro conserva exactamente el listado anterior. No hubo migración, permisos nuevos, escritura, outbox ni llamada a Zernio.
- La interfaz permite elegir una etiqueta, quitar el filtro y combinarlo con los controles de estado y búsqueda ya existentes.
- Controles aprobados: pruebas de filtro válido, etiqueta horizontal y etiqueta sin vínculos; pruebas completas, tipos, lint, formato, build de API, health local y comprobación de diff. El build completo de Next se omite mientras sigue activo el servidor de desarrollo; typecheck de web sí pasa.

## Fase 20 de conexión automática de canales Zernio

- Se aplicó en el proyecto remoto la migración aditiva `add_zernio_tenant_profiles`. `tenants.zernio_profile_id` es nullable y tiene unicidad parcial, por lo que no cambia tenants ni canales existentes.
- La API propia crea o reutiliza el perfil Zernio con idempotencia, genera la autorización estándar y conserva `ZERNIO_API_KEY` exclusivamente en servidor. Solo el rol `admin` puede iniciar esa operación.
- El webhook HMAC reconoce `account.connected`: resuelve el tenant por `profileId`, registra la cuenta sin copiar IDs y rechaza una asociación horizontal. Los eventos de mensajes normales continúan exigiendo una cuenta ya vinculada.
- La bandeja incluye el acceso de configuración para administradores, lista canales sin exponer IDs y redirige a la autorización oficial de Zernio. Aún requiere configurar `ZERNIO_API_KEY`, `ZERNIO_CONNECT_REDIRECT_URL` y habilitar el evento `account.connected` al webhook público.
- Controles locales aprobados: 96 pruebas (17 dominio, 57 API, 22 worker), comprobación de tipos completa y lint. El build de Next se mantiene fuera de este corte mientras permanece el servidor de desarrollo; falta completar comprobación visual después de configurar Zernio.

## Fase 21 de perfiles visuales de contactos

- La migración remota `add_contact_profile_media` agregó al contacto `external_username`, `avatar_object_path` y `avatar_source_hash`, sin modificar conversaciones, mensajes ni contactos existentes. Se creó el bucket privado `contact-avatars`, con límite de 2 MiB y MIME permitidos JPEG, PNG y WebP.
- El worker recibe el usuario y la foto solo desde un `message.received` que ya superó validación HMAC. Verifica HTTPS, DNS sin direcciones privadas, ausencia de redirecciones, tamaño y firma binaria antes de guardar bytes en Storage. El fallo de imagen no bloquea el mensaje ni reemplaza el avatar previo.
- La API exige sesión y membresía antes de emitir una URL firmada de diez minutos. La UI solicita el avatar por su BFF autenticado; no conoce la URL original del proveedor ni consulta Supabase directamente.
- La verificación remota confirmó las tres columnas y el bucket no público. El asesor de seguridad no incorporó alertas nuevas; persisten los avisos conocidos de RLS sin políticas en tablas cerradas a la Data API y de protección contra contraseñas filtradas desactivada.
- Controles locales aprobados: 102 pruebas (17 dominio, 60 API, 25 worker), tipos completos, lint y formato. Falta una comprobación visual con el próximo mensaje Zernio que incluya foto y nombre de usuario.

## Fase 22 de presentación accesible de la bandeja

- El panel de detalles dejó de desaparecer en pantallas medianas: por debajo de 1180px se presenta como cajón superpuesto que el encabezado de la conversación abre y que se cierra con su botón, con el fondo o con Escape. Estado, bot, asignación, etiquetas y notas privadas vuelven a estar alcanzables sin cambiar contratos ni permisos.
- Por debajo de 620px la lista y la conversación alternan con un botón de retorno; antes la lista se ocultaba sin forma de volver a ella.
- El historial se ancla al último mensaje al abrir una conversación y al enviar, y conserva la posición cuando la persona se ha desplazado a leer mensajes anteriores. Cada cambio de día se separa con una etiqueta de fecha en español ("Hoy", "Ayer" o la fecha completa).
- El avatar de contacto aparece también en el panel de detalles y cae a iniciales cuando la URL firmada falla, en lugar de mostrar una imagen rota sobre las iniciales.
- Se corrigieron las cadenas con codificación doble en `apps/web/app/page.tsx` y `apps/web/middleware.ts`. Las que quedan en documentos y en mensajes de la API se atienden en un corte de higiene separado.
- Controles ejecutados: comprobación de tipos de web, lint del workspace, formato de los archivos modificados, 102 pruebas existentes (17 dominio, 60 API, 25 worker) y build de producción de Next con salida correcta. Falta la comprobación visual con una sesión autenticada y conversaciones reales.

## Fase 23 de estados de interfaz y textos de la bandeja

- Se corrigió un defecto de estado: un envío fallido reemplazaba el historial abierto por un mensaje de error, de modo que la persona perdía de vista la conversación. Ahora el fallo se muestra junto al compositor y el historial permanece intacto; el aviso se limpia al cambiar de conversación o al volver a escribir.
- Se separaron los estados que estaban acoplados: la biblioteca de etiquetas (crear, editar, eliminar) ya no comparte el indicador de guardado ni el mensaje de error con aplicar o retirar etiquetas en una conversación. Antes, guardar una etiqueta bloqueaba el cambio de etiquetas del chat y un error de la biblioteca se mostraba como error de la conversación.
- Escape cierra el panel superior abierto en un orden explícito (canales, biblioteca de respuestas, selector de respuestas, biblioteca de etiquetas, selector de etiquetas, asignación, filtro de etiqueta y cajón de detalles). El modal de canales además se cierra al pulsar el fondo, lleva el foco a su botón de cierre y no propaga el clic de su contenido.
- El compositor envía con Enter y reserva Shift+Enter para el salto de línea, usando el mismo camino que el botón (requestSubmit), por lo que no se duplica la lógica de envío.
- Se corrigieron textos visibles sin tilde y una etiqueta engañosa: "Etiquetas del contacto" ahora dice "Etiquetas de la conversación", porque son etiquetas internas de la conversación y no atributos del contacto.
- Los accesos de navegación a Actividad y Contactos dejaron de ser enlaces que no hacían nada: se presentan como botones deshabilitados y anunciados como disponibles en un módulo futuro.
- Controles ejecutados: comprobación de tipos de web, lint del workspace, formato del repositorio, 102 pruebas existentes y compilación en vivo del servidor de desarrollo con la sesión abierta. El build de producción de Next queda pendiente mientras el servidor de desarrollo siga activo, según la práctica ya registrada del proyecto.
- Observación de rendimiento registrada para el siguiente corte: con la sesión abierta, el sondeo incondicional cada 4 segundos más el stream SSE producen unas 30 solicitudes por minuto y por persona. Las latencias extremas y los 503 vistos durante esta fase (hasta 102 segundos) no provenían del sondeo: `tsx watch` reinicia API y worker cuando cambian los artefactos de `packages/*/dist`, y esos reinicios ocurrieron porque los propios comandos de verificación de esta fase reconstruyen esos paquetes. La lectura inicial que culpaba al sondeo quedó corregida aquí. No se modificó el mecanismo en esta fase porque ADR-023 lo documenta como red de seguridad deliberada.

## Fase 24 de sondeo condicional del tiempo real

- El sondeo rápido de cuatro segundos dejó de ejecutarse de forma incondicional: sostiene la bandeja solo mientras el stream SSE no esté abierto y se detiene en cuanto el stream se abre; si el stream emite error, se reanuda.
- Se conserva una comprobación lenta de treinta segundos en todos los casos, que cubre el escenario que ADR-023 protege: un stream que permanece abierto pero deja de entregar señales. La alternativa de eliminar el sondeo se descartó porque dejaría la bandeja obsoleta en silencio.
- Efecto esperado: pasar de unas 30 solicitudes por minuto y por persona a unas 2 cuando el stream está sano, sin perder consistencia eventual. ADR-023 quedó actualizado con la nueva estrategia y el motivo.
- Controles ejecutados: comprobación de tipos de web, lint del workspace y formato.
- Medición con cliente real: cargada la bandeja con la sesión abierta, en una ventana de 65 segundos se observaron 4 solicitudes de sondeo (dos ciclos de `/api/inbox` + historial, separados ~30 segundos) más 3 solicitudes bajo demanda al cambiar de conversación (historial, etiquetas y notas del chat elegido). Son unas 4 solicitudes por minuto de sondeo frente a las ~30 anteriores, una reducción cercana al 87%. El stream SSE seguía abierto al cerrar la ventana, evidenciado porque no apareció la línea de cierre de `/api/events` que el servidor imprime al terminar el stream; es decir, el sondeo rápido permaneció detenido como se diseñó.

## Fase 25 de validación del webhook con un evento real firmado

- Se restableció la entrada pública de mensajes con un túnel de Cloudflare apuntando a la API en `127.0.0.1:4000`. El túnel anterior había muerto el 2026-08-15 y su host de `trycloudflare.com` ya no resolvía; los túneles rápidos generan un host nuevo en cada arranque, de modo que la URL registrada en Zernio debe actualizarse en cada reinicio. Para producción se requiere un túnel nombrado con dominio propio o un despliegue estable de la API.
- Se verificó el contrato de firma de extremo a extremo por la URL pública: un `POST` con HMAC-SHA256 hexadecimal del cuerpo crudo respondió `201 {"duplicate":false}`, y el mismo cuerpo con firma falsa respondió `400`. Un evento `webhook.test` se acepta sin escribir en la base.
- La documentación oficial confirma que el esquema implementado es el esperado: `X-Zernio-Signature` es el HMAC-SHA256 hexadecimal del cuerpo crudo, la entrega es al menos una vez y debe deduplicarse por el `id` del evento, y la confirmación debe ocurrir dentro de cinco segundos encomendando el trabajo a un worker.
- Se reenvió firmado un evento `message.received` real que se había perdido por estar el túnel caído. El evento quedó registrado con `provider_event_id` `f25d214e…`, recibido a las 20:32:09.98 y procesado a las 20:32:13.30, y el worker creó el contacto "German Mtz" (`germartzc`), la conversación y el mensaje entrante en menos de cuatro segundos. El mismo cuerpo reenviado respondió `{"duplicate":true}` sin duplicar el evento ni el mensaje, lo que evidencia la idempotencia en los dos niveles: índice único sobre el identificador del evento y índice único parcial sobre `messages (tenant_id, channel_account_id, provider_message_id)` con manejo explícito de `23505`.
- Hallazgos de la comparación con la documentación del proveedor: (1) no existe barrido de historial, y al conectar una cuenta de Instagram o Facebook Zernio reproduce el historial de DM en segundo plano sin emitir webhooks, por lo que ese historial no llega a la base sin un listado con cursor; (2) el payload `message.received` no incluye foto de perfil, de modo que los avatares de la especificación 012 no pueden poblarse con la forma actual; (3) no se notifica lectura a la plataforma al abrir una conversación, por lo que el contacto no ve su mensaje como leído; (4) `metadata.referral` con `source: ADS` llega y se descarta, y es la materia prima para atribuir conversaciones a anuncios.
- Hueco de confiabilidad detectado en el worker: una evento se reclama marcando `processing_started_at` y las filas reclamadas se excluyen de la cola, pero no existe recuperación de un reclamo abandonado. Si el worker muere entre el reclamo y el cierre del evento, ese evento queda invisible para siempre: no se procesa, no se marca como fallido y no se reintenta.
- Inventario real medido contra la API de Zernio (solo lectura, con la clave del proyecto): el perfil del tenant contiene **2.869 conversaciones** repartidas en **tres cuentas** — Instagram `insidespamx` con 2.307, Facebook `insidespacdmx` con 561 y WhatsApp `+12029087457` con 1 —, y 1.872 de ellas tienen mensajes sin leer según el contador del proveedor. Nuestra base tiene 21 conversaciones y una sola cuenta registrada, es decir alrededor del 0,7% de la operación.
- Riesgo operativo derivado de ese inventario: los eventos de las dos cuentas que no están en `channel_accounts` (Messenger y WhatsApp) son rechazados con `422` por el webhook, porque la resolución del tenant exige una cuenta ya vinculada. Mientras no se registren, cualquier mensaje de esas plataformas se pierde aunque el endpoint público esté sano.
- Conflicto de identidad entre los dos caminos del proveedor, que impide un barrido ingenuo: el webhook identifica la conversación con `conversation.id` (`6abacbaf…`, interno), el mensaje con `message.id` (`6abacbb0…`, interno) y el contacto con `sender.contactId` (`6abacbb0…`, interno); la API de inbox identifica la conversación por `participantId` (`1395569002791550`), el mensaje por el `platformMessageId` del webhook y el contacto por `participantId`. Nuestro esquema guarda hoy las referencias basadas en los identificadores internos, así que un barrido directo duplicaría contactos, conversaciones y mensajes. Los identificadores de plataforma están presentes en ambos caminos y los payloads crudos ya están guardados en `webhook_events.payload`, por lo que la convergencia y la reparación son posibles sin volver a pedir nada al proveedor.
- Corrección de un hallazgo anterior de esta misma fase: la API de inbox **sí entrega foto de perfil** (`participantPicture` en el listado), de modo que los avatares de la especificación 012 pueden poblarse desde el barrido aunque el payload `message.received` no los incluya. El listado también entrega `unreadCount` por conversación y `lastMessage`.
- Observación operativa: en la conversación inspeccionada existen dos respuestas salientes largas enviadas desde Zernio, ajenas a nuestra UI. La operación ya responde por fuera del producto, y el barrido también incorporaría esas salientes; habrá que decidir si se registran como `agent` o como `automation`, porque el proveedor entrega `sentVia: null` y no permite distinguirlo.

## Fase 26 de atención real y continuación de la bandeja

- Se descartó el barrido de historial por decisión de producto: solo interesan las conversaciones nuevas para probar, y las cuentas restantes se conectarán cuando el cliente lo indique. El corte se dedicó entonces a que la atención y la navegación dejen de calcularse en el navegador.
- Migración aditiva `20260928204706_add_conversation_reads`: marca de lectura por persona y conversación, clave primaria `(conversation_id, user_id)`, claves foráneas compuestas por tenant hacia `conversations` y `memberships`, índice por `(tenant_id, user_id)`, RLS activa y privilegios revocados a `anon` y `authenticated`. Se aplicó en el proyecto remoto con autorización explícita y se verificó: la tabla existe, está vacía, el rol anónimo recibe `permission denied` y la consulta exacta del listado —con el último mensaje, el último entrante y la marca de la persona en una sola petición— responde.
- Dominio: `clampReadMark`, `nextReadMark`, `needsAttention`, cursor con validación y saneado del término de búsqueda. El saneado **retira** los caracteres reservados en lugar de escaparlos, para que el término no pueda alterar la forma de la consulta. Las pruebas del dominio pasaron de 17 a 61.
- API: el listado pagina por cursor keyset con desempate por identificador, busca en servidor, acota la vista previa a 200 caracteres y calcula la atención de la persona solicitante; el comando de lectura acota el instante, avanza solo hacia adelante, se protege con una guarda de concurrencia y tolera un `23505` de otra pestaña. La suite de la API se reescribió con un cliente falso que registra la forma exacta de cada consulta y pasó de 60 a 83 pruebas.
- Se corrigieron defectos encontrados al tocar el mismo código: un fallo al continuar la lista o al marcar lectura ya no reemplaza el contenido visible por un estado de error, y varios mensajes con codificación doble quedaron legibles.
- Interfaz: el indicador de atención viene del servidor y desaparece al abrir la conversación; la fila muestra el último mensaje (con el prefijo del equipo cuando es saliente) en lugar de una frase fija por estado; la búsqueda se resuelve contra el servidor con una espera breve; y la lista ofrece continuación cuando hay más páginas, conservando las páginas ya cargadas ante un refresco automático.
- Verificación en vivo con la sesión real: los eventos `conversation.started`, `message.received`, `message.sent` y `message.read` de Zernio se procesaron en unos dos segundos y crearon una conversación nueva; la interfaz escribió la marca de lectura (`POST .../read 201`) y la marca avanzó de 20:59:44 a 21:00:12 al llegar un mensaje nuevo con la conversación abierta, sin tocar la fila de la conversación.
- Controles ejecutados: comprobación de tipos, lint, formato y 169 pruebas (61 dominio, 83 API, 25 worker). El build de producción de Next queda pendiente mientras el servidor de desarrollo siga activo, según la práctica registrada del proyecto.

## Fase 27 de recuperación de reclamos abandonados

- Se corrigió una clase de pérdida silenciosa presente en **ambos** workers: el trabajo se reclama marcándolo como en curso, las consultas de cola excluyen lo reclamado, y si el proceso muere entre el reclamo y el cierre esa fila no se vuelve a mirar nunca. En entrada era un mensaje perdido sin aviso; en salida, una respuesta que nunca salía y un mensaje que se quedaba en "enviando".
- Regla implementada: cada worker devuelve a la cola el trabajo cuyo reclamo superó cinco minutos de abandono, como máximo una vez por minuto. En entrada solo se limpia la marca de reclamo y nunca se marca procesado ni fallido; en salida el evento vuelve a `pending` con su disponibilidad al presente.
- El reprocesamiento es seguro y no se apoyó en confianza: el contacto y la conversación se resuelven por referencia externa, el mensaje entrante tolera el duplicado por su índice único y el despacho saliente conserva su clave de idempotencia estable, de modo que un reenvío repite la respuesta del proveedor en lugar de enviar dos veces. El presupuesto de intentos del outbox sigue acotando el ciclo.
- La recuperación es una red de seguridad y no puede tumbar el drenaje: si falla, se registra con su código y el ciclo continúa.
- No se tocaron los eventos ya marcados como fallidos: fallar sigue siendo terminal, y reintentarlos exige un presupuesto por evento que requiere migración. Queda como corte separado.
- Controles ejecutados: las pruebas del worker pasaron de 25 a 36, la batería completa quedó en 180 (61 dominio, 83 API, 36 worker), y la comprobación de tipos, el lint y el formato están en verde.

## Fase 28 de mensajes perdidos por nulos del proveedor

- Se detectó en vivo un mensaje real rechazado (`invalid_message_received_payload`) mientras la bandeja recibía tráfico. La causa: cuando el mensaje no trae texto —una publicación compartida, un adjunto sin comentario— Zernio envía `text: null`, y el normalizador declaraba los campos opcionales con `optional()`, que acepta la ausencia pero rechaza el nulo. El evento completo se marcaba como fallido y el mensaje nunca llegaba a la bandeja.
- Alcance real del defecto: quince eventos `message.received` fallidos entre el 13 y el 15 de agosto, más uno del 28 de septiembre. Ninguno aparecía en la interfaz ni en ningún informe.
- Corrección: en el límite de entrada un nulo explícito en un campo opcional se trata como ausente, y solo los identificadores mínimos siguen siendo obligatorios. Un mensaje sin texto se guarda con cuerpo vacío, que es la representación fiel de lo ocurrido, y la interfaz lo rotula como contenido no soportado todavía tanto en la conversación como en la vista previa del listado.
- Recuperación de lo perdido sin migración: se limpió la marca de fallo de los quince eventos y el worker los reprocesó de forma convergente. La bandeja pasó de 22 a 23 conversaciones y de 46 a 66 mensajes, y quedaron cero eventos fallidos y cero pendientes. Los quince mensajes recuperados son los quince de cuerpo vacío que ahora se ven rotulados.
- Efecto secundario operativo observado: al aplicar el cambio sin detener el servidor de desarrollo, el worker se reinició a mitad de la edición y registró `TypeError: this.reclaimAbandonedClaims is not a function` durante unos segundos. No afectó datos y se resolvió solo en la siguiente recarga; conviene editar los workers con el bucle detenido o aceptar ese hueco.
- Controles ejecutados: las pruebas del worker pasaron de 36 a 38 con los casos de nulos, la batería completa quedó en 182 (61 dominio, 83 API, 38 worker), y la comprobación de tipos, el lint y el formato están en verde.

## Fase 29 de nombre visible de las cuentas conectadas

- Se agregó el nombre de cada cuenta conectada, pedido por la operación: con varias cuentas de la misma plataforma, el nombre es lo único que las distingue en la bandeja. La lista mostraba "Cuenta conectada" porque la columna estaba vacía.
- Regla implementada: el nombre lo decide el equipo y solo un administrador puede cambiarlo; el proveedor únicamente rellena un nombre vacío con el usuario que envía en sus eventos, y esa escritura se aplica con la condición de que siga vacío, para no pisar una decisión del equipo ni perderla ante un evento simultáneo. Se reutilizó la columna existente: no hubo migración.
- La interfaz muestra el nombre en la lista de canales conectados y ofrece nombrarlo o renombrarlo al administrador; una cuenta sin nombre se presenta como "Cuenta sin nombre" en lugar de sugerir que existe una cuenta llamada así.
- Se nombró la cuenta existente con el usuario que el proveedor ya enviaba (`insidespamx`), sin inventar datos y con respuesta mínima en la operación.
- Controles ejecutados: la API pasó de 83 a 88 pruebas con la nueva suite del servicio de canales, el worker quedó en 42 y la batería completa en 191 (61 dominio, 88 API, 42 worker); la comprobación de tipos, el lint y el formato están en verde.

## Fase 30 de perfiles, acceso por rol e invitaciones

- Se publicó la matriz de capacidades por rol y se cerró la brecha real: el acceso solo podía concederse insertando filas en la base, sin forma de invitar ni de cambiar un rol desde el producto.
- Invitación implementada con la API de administración de Auth y enlace de un solo uso: si la persona no tiene cuenta, el enlace le permite establecer su contraseña; si ya la tiene, el enlace solo inicia sesión. Se verificó que la clave privada puede usar esa API y que sin credencial válida la rechaza. La pertenencia es idempotente y una invitación repetida nunca cambia el rol existente.
- Invariante implementado: un tenant conserva siempre al menos un administrador; degradar o retirar al último responde conflicto y no escribe nada. Retirar la pertenencia no elimina la cuenta ni sus accesos a otros tenants, y las conversaciones asignadas quedan sin asignar por la propia relación.
- Interfaz: sección de equipo visible solo para administradores, con listado de integrantes, cambio de rol, retiro, formulario de invitación y el enlace para compartir mostrado una sola vez.
- Decisión de método: el enlace es un secreto de un solo uso, se entrega únicamente a quien lo genera y no se registra en logs ni en la bitácora de eventos.
- Pendiente declarado para no prometer lo que no está probado: no se creó ningún usuario real durante la verificación, el envío del correo depende del SMTP del proyecto y la URL de retorno debe estar autorizada en él. Hasta verificar ese recorrido con una persona real, la invitación se entrega como enlace para compartir. También sigue pendiente habilitar la protección contra contraseñas filtradas antes de sumar más personas.
- Controles ejecutados: la API pasó de 88 a 99 pruebas con la suite de invitaciones y administración de integrantes, la batería completa quedó en 202 (61 dominio, 99 API, 42 worker), y la comprobación de tipos, el lint y el formato están en verde. Las rutas de invitación, cambio de rol y retiro quedaron registradas y sirviendo.

## Fase 31 de permisos de biblioteca compartida

- Se ajustó la matriz de permisos según la operación real: la biblioteca de etiquetas pasa de solo administradores a administradores y supervisores, porque el supervisor es quien organiza la operación. Cualquier integrante crea respuestas rápidas y administra las que creó; supervisores y administradores administran todas. La razón es concreta: en una biblioteca compartida, permitir que cualquiera edite todo hace que dos personas se pisen el texto que la otra está usando. La respuesta rápida ahora expone `canManage` para que la interfaz muestre solo lo que cada persona puede hacer, y la API lo aplica igual aunque se llame directo.
- Se encontró y corrigió un defecto en el corte anterior: retirar a un integrante **fallaría** con cualquier persona que tuviera actividad. Las referencias compuestas de `conversations`, `messages` y `canned_responses` usaban `set null` sobre el par completo, lo que intentaría anular `tenant_id`, que es obligatorio, y las notas usaban `restrict`, que bloquea el retiro. La migración `20260928215601_fix_membership_removal` hace que cada referencia libere solo la columna de la persona y que las notas sobrevivan con autoría vacía. No se aplicó en el proyecto remoto: queda para quien administra la base, y hasta entonces el retiro de integrantes con actividad fallará.
- Se implementó y después se revirtió, a pedido, un perfil editable del contacto con nombre y teléfono: se eliminaron el comando `PATCH /v1/tenants/:tenantId/contacts/:contactId`, su migración, la lógica del trabajador que dejaba de sobrescribir el nombre y la edición en el panel de la conversación. La preferencia es administrar el perfil de quien inicia sesión, no el del contacto.
- Controles ejecutados: la API pasó de 99 a 109 pruebas, el worker de 42 a 45 y la batería completa a 215 (61 dominio, 109 API, 45 worker) al cerrar el corte. Tras revertir el perfil del contacto quedaron 104 pruebas de API y 42 del worker, con la comprobación de tipos, el lint y el formato en verde.

## Fase 32 del perfil de quien inicia sesión

- Cada integrante define su nombre visible desde la barra lateral; con él aparece en las notas privadas, en las asignaciones, en la lista del equipo y en su propio avatar, en lugar del correo.
- Decisión: el nombre vive en la cuenta y no en la pertenencia, así que se conserva entre espacios y no obliga a migrar la tabla. Solo se edita el perfil propio: la cuenta se toma de la sesión y la petición no acepta un identificador ajeno.
- El nombre es presentación pura y nunca autoriza: los permisos siguen dependiendo del rol vigente en la pertenencia. Un nombre ausente es un estado válido y la interfaz muestra el correo como respaldo, sin inventar datos.
- Al guardar se envía la unión explícita de los metadatos de la cuenta, para no depender de si el proveedor combina o reemplaza el resto del perfil.
- Se revirtió, a pedido, el perfil editable del contacto que se había implementado antes en esta misma sesión; el retiro de integrantes conservó su arreglo de claves foráneas, que es un defecto independiente y sigue pendiente de aplicar en el proyecto remoto.

## Fase 33 de puesta en marcha local

- Se levantó de nuevo el entorno local (web, API y worker) y se volvió a publicar el webhook con un túnel nuevo. La URL pública anterior había dejado de resolver, así que los eventos de Zernio estuvieron llegando a una dirección muerta: el último evento procesado era de las 03:58 UTC, unas diez horas antes.
- Se comprobó que el webhook en sí no cambió: la ruta responde y valida firma, y los últimos eventos entraron y se procesaron sin fallos. Lo que se rompe cuando el túnel muere no es el procesamiento sino la dirección pública, y no avisa: la única señal es que `webhook_events` deja de recibir filas. Quedó documentado en `docs/OPERATIONS.md`.
- Se verificó el build de producción completo (`corepack pnpm build`): Next compiló las 14 páginas, incluidas las rutas nuevas del equipo y del perfil propio, y la API y el worker compilaron con `tsc`.
- El usuario aplicó la migración `20260928215601_fix_membership_removal` y se verificó su efecto en el proyecto remoto: una nota sin autoría se crea correctamente —antes lo impedía una restricción de no nulo— y la clave foránea de autoría rechaza un autor inexistente. La nota de prueba se eliminó en el acto y la tabla quedó vacía. También se confirmó que las columnas del perfil del contacto, que se revirtió, no existen: no quedó nada a medias en la base.
- Una primera verificación propia falló por un error mío —omití una columna obligatoria en la fila de prueba— y no por la migración; se corrigió la prueba y se repitió.

## Fase 34 de multimedia en las conversaciones

- Se midió la vigencia real de los enlaces de multimedia del proveedor: el de unas horas antes respondía `206`, y los del 13 y 14 de agosto respondían `404`. De los eventos con adjunto, solo 19 traían enlace y la mayoría eran publicaciones compartidas, no archivos. Conclusión: el histórico no se puede rescatar y la copia debe hacerse al recibir el mensaje.
- Se implementó la copia al almacenamiento propio en el momento de la ingesta, con descarga segura compartida con los avatares (solo `https`, direcciones públicas, sin redirecciones, con tope de tamaño) y reconocimiento del tipo por bytes reales.
- Regla aplicada: ningún adjunto puede impedir que un mensaje se guarde. Un adjunto con forma inesperada, un enlace caducado o un fallo de descarga se anotan y el mensaje permanece. Un reintento del webhook reintenta la copia que faltaba.
- La propia prueba de tolerancia destapó un defecto: el esquema del adjunto rechazaba el mensaje entero cuando el proveedor enviaba un campo con un tipo inesperado. Se corrigió leyendo el adjunto de forma tolerante, igual que se hizo antes con el texto nulo.
- Interfaz: la imagen se muestra dentro de la conversación y se añadió la vista **Multimedia** en formato de lista con miniatura, nombre del contacto, tipo y fecha en cada fila, más un buscador por contacto y un filtro por tipo. El buscador usa el mismo saneamiento que la bandeja y un término sin caracteres utilizables devuelve una lista vacía en lugar de todo el archivo.
- Verificación con tráfico real: el usuario aplicó la migración y envió una fotografía. Quedó registrada como `image` con tipo `image/jpeg` reconocido por sus bytes y 32.504 bytes, copiada al bucket privado, y el objeto se descarga con enlace firmado respondiendo 200 y `content-type: image/jpeg`. El mensaje sin texto se conservó, hay una sola fila (la ingesta no duplicó) y las dos consultas anidadas que usa la interfaz —los adjuntos dentro del historial y el contacto dentro de la galería— responden correctamente.
- Queda pendiente una pasada que reintente las copias fallidas —el índice parcial ya existe para encontrarlas— y una política de retención, porque el almacenamiento crecerá con el uso.
- Controles ejecutados: 229 pruebas en verde (65 dominio, 115 API, 49 worker), con la comprobación de tipos, el lint y el formato en verde.
- Controles ejecutados: la API quedó en 109 pruebas con la suite del perfil propio, el worker en 42 y la batería completa en 212 (61 dominio, 109 API, 42 worker); la comprobación de tipos, el lint y el formato están en verde.

## Fase 35 de publicaciones compartidas

- Se corrigió una regla equivocada de la fase anterior: una publicación compartida **sí trae su medio**. Se comprobó con un `share` real: su enlace responde `200` con `video/mp4` de 1,4 MB, y el proveedor entrega además **el texto completo de la publicación** y su tipo original (`ig_post`). Antes se descartaba como simple referencia, así que la conversación mostraba un texto muerto sin forma de ver el contexto.
- Ahora la publicación se copia como cualquier otro adjunto y su texto se guarda en la tabla de adjuntos. La interfaz muestra el texto bajo el mensaje y, al pulsarlo, abre el visor con el vídeo o la imagen y el texto completo: eso es el contexto que el equipo necesita para responder.
- Se detectó que **el proveedor entrega el texto con doble codificación** (bytes UTF-8 leídos como latin-1), lo que dejaba la publicación ilegible. Se añadió una reparación conservadora: solo actúa ante las secuencias típicas del defecto y solo si el resultado es válido; ante la duda conserva el original. Tiene pruebas con las secuencias exactas.
- Dos pruebas propias fallaron primero por errores míos, no del código: escribí las comillas dobles codificadas con los caracteres de cp1252 en lugar de los caracteres de control reales, y el intérprete me corrompió caracteres no ASCII en los comandos. Las reescribí con secuencias escapadas, de modo que no dependan de la codificación del archivo.
- Pendiente declarado: los adjuntos ya guardados antes de este cambio no tienen texto ni copia, porque su ingestión ocurrió con la regla anterior. Se pueden recuperar con la pasada de reintento, ya que el payload original sigue almacenado y los enlaces aún responden.
- Controles ejecutados: 229 pruebas en verde (65 dominio, 115 API, 49 worker), con la comprobación de tipos, el lint y el formato en verde.

## Fase 36 de reintento de multimedia

- Se implementó la pasada que recupera lo que quedó a medias. Corre cada cinco minutos dentro del trabajador —igual que el reclamador de eventos abandonados— y hace dos cosas: copia la multimedia cuyo enlace no se descargó en su momento y **recupera el texto de las publicaciones compartidas** guardadas antes de que supiéramos leerlo, leyendo el payload original que sigue almacenado.
- Los reintentos son acotados: cada adjunto lleva su cuenta de intentos (tope de cinco), espera diez minutos entre intentos y, si el enlace ya caducó, se queda marcado sin insistir para siempre. Un fallo de la pasada nunca lanza: se anota y el mensaje permanece intacto.
- Motivo concreto: cinco publicaciones compartidas quedaron registradas sin copia por la regla equivocada de la fase 34. Sus enlaces todavía respondían, así que eran recuperables, y su texto también porque el payload original está en la tabla de eventos.
- Controles ejecutados: el worker pasó de 49 a 53 pruebas —el intervalo propio, la copia con recuperación del texto, el fallo anotado sin excepción y la espera entre intentos— y la batería completa a 233 (65 dominio, 115 API, 53 worker), con la comprobación de tipos, el lint y el formato en verde.

## Fase 37 de rotación de asesoras, adjuntos del aviso y cierre de los flujos

- **Rotación de transferencias.** La conversación ya no se deriva a una persona fija: el flujo pide la transferencia sin `userId` y la API reparte por turno entre quien tiene la bandeja abierta. La disponibilidad es un pulso autenticado que manda la bandeja cada minuto mientras la pestaña está visible (`POST /v1/tenants/{tenantId}/presence`) y que vence a los dos minutos. El orden lo decide PostgreSQL en `claim_next_active_advisor`, con la fila del cursor bloqueada, de modo que dos transferencias simultáneas no reciben a la misma persona ni nadie recibe dos seguidas mientras haya dos activas. Sin nadie disponible la respuesta es 422 y la conversación no cambia. **El reparto es solo entre membresías con rol `agent`**: un administrador o un supervisor puede tener la bandeja abierta —y su pulso se registra igual—, pero no recibe transferencias automáticas, porque su papel no es atender. Los roles que participan están en un único sitio (`v_roles`, dentro de la función SQL), así que sumar otro no obliga a tocar la API ni los flujos. La base de la rotación se añadió en la migración `20261009140000_add_advisor_presence_rotation`, que se renombró desde `20261009130000` (ese prefijo ya estaba ocupado por otra migración y el CLI no puede ordenar dos versiones iguales), y el filtro por rol llegó después en `20261009160000_rotation_only_agents`, en su propia migración porque la función ya estaba aplicada en el proyecto remoto.
- **Permisos de la función.** `claim_next_active_advisor` es `security definer`, así que se revoca de `public`, `anon` y `authenticated` y se concede solo a `service_role`: un `revoke` a `public` no retira las concesiones explícitas que Supabase crea por defecto, y por esa vía un usuario autenticado podría enumerar presencia de otro espacio o mover el cursor.
- **Reintentos.** Repetir la misma petición de transferencia ya no cambia de persona: si la conversación está asignada y el bot apagado, se devuelve esa misma asignación sin gastar turno. Y la conversación se lee y se valida **antes** de reclamar el turno, de modo que una conversación inexistente (404) no saca a nadie de la rotación. Límite conocido y anotado en `docs/DECISIONS.md`: un conflicto de versión (409) o un fallo al registrar la transferencia todavía pueden consumir un turno; unificarlo en una transacción de base queda como corte posterior.
- **Pulso de la bandeja.** El servicio reutiliza la comprobación de membresía que ya existía en vez de repetir la consulta, valida el identificador de espacio en el borde (400 en lugar del 500 que daba un valor no UUID) y la ventana de presencia vive en una sola constante (`apps/api/src/tenants/advisor-presence.rule.ts`) que usan el pulso y la rotación. La bandeja avisa en la consola si el pulso no llega: sin ese aviso, una sesión caída dejaba a la persona fuera del reparto sin ningún síntoma visible.
- **Adjuntos del aviso al bot.** El evento `message.inbound` incluye ahora `message.attachments` con `id`, `kind`, `contentType` y `url`, un enlace firmado de diez minutos a nuestra copia, generado al entregar el aviso. Un adjunto que todavía no se ha copiado viaja con `url: null` y no impide el aviso. En el mismo corte se reconoció el PDF por sus bytes y se añadió `application/pdf` al depósito de la conversación (`20261009150000_add_pdf_to_conversation_media`): sin lo primero el archivo se descartaba por desconocido y sin lo segundo la escritura se rechazaba, así que ningún comprobante en PDF llegaba a la validación del pago.
- **Multimedia por título.** El cuerpo de envío admite `media: [{ branchMediaTitle }]` y la API lo busca dentro de la sede de la conversación y del espacio del token, tomando la de menor `sort_order` si hay varias. Sustituye al UUID inventado que llevaban ocho nodos de envío, que solo podía existir en la base del espacio donde se copió y que hacía fallar el mensaje entero, texto incluido.
- **Flujos.** 4.1 dejó de validar la forma de ManyChat para resolver la cuenta (por eso el recordatorio y el aviso de liberación no salían nunca), sus cuatro «guardar campos» pasaron a `POST /v1/tools/contact-fields` (antes un GET a una ruta de solo lectura con el identificador vacío y `Number(subscriber_id)`, que sobre un UUID da `NaN`) y sus cuatro claves de idempotencia llevan el turno. En 4.2 y 4.5 el nodo que resolvía la cuenta cortaba la rama con un `throw` y el IF de la conversión tenía las dos salidas sin cablear (rama inalcanzable); los nueve verificadores de cada flujo leían `status: 'success'`, que nuestra API no devuelve. En 7.1 el flujo padre llamaba a los subflujos con `workflowInputs.value: {}` —sin ningún campo— así que el subflujo moría antes de leer nada. Sara dejó de depender de que el proveedor escribiera una URL en el texto: lee los adjuntos de nuestro aviso.
- **Codificación.** Se reparó el texto doblemente codificado de los dieciséis flujos contra los originales limpios de `Flujos/`: 836 tramos en Sara y varios en los demás, además de emojis y comillas que habían quedado como símbolos raros. La comprobación automática queda en cero marcadores y los dieciséis archivos siguen parseando.
- **Controles ejecutados**: 750 pruebas en verde (232 dominio, 367 API, 126 worker, 25 multimedia), comprobación de tipos completa, lint sin avisos y formato correcto. Se añadieron pruebas para la presencia (membresía ajena, identificador inválido, escritura idempotente), para la rotación (espacio y ventana que se reclaman, reintento que no cambia de persona, conversación inexistente que no gasta turno, `turnBotOff` en falso sin registro de transferencia) y para la multimedia por título (resolución, sede sin esa imagen, conversación sin sede y las dos formas a la vez rechazadas).
- **Pendiente manual, no verificado aquí**: aplicar las dos migraciones nuevas en el proyecto remoto; subir a `branch-media` la imagen titulada «Accesorios» de cada sede (mientras no exista, el envío responde 422 y no encola nada); y comprobar el recorrido completo en n8n con el interruptor de envío apagado, donde el 422 esperado es «el envío del bot está apagado». El reparto real de la rotación en SQL (dos reclamos en paralelo devolviendo personas distintas) no se puede probar con dobles: queda como sonda manual con dos llamadas simultáneas a la función y su resultado anotado aquí cuando se ejecute.
- **Fuera de esta carpeta**: Sara llama por `workflowId` a seis flujos que no están en `Flujos_v2/` (conocimiento, mensaje de errores, sucursal más cercana, cierre y pausa, gift cards y el emisor de TikTok). Si no existen ya en n8n con esos identificadores, esas rutas fallan al ejecutarse.
