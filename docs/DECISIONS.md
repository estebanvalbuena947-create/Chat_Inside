# Registro de decisiones

Las decisiones de esta fase son propuestas aprobadas para documentación. Una integración o capacidad de proveedor no se considera confirmada hasta validarla en el entorno de desarrollo y documentar la evidencia.

---

## ADR-045 - La multimedia se copia al recibirla, porque el enlace del proveedor caduca

- **Fecha:** 2026-09-29
- **Estado:** aceptada
- **Contexto:** Zernio entrega la multimedia como un enlace firmado del CDN de Instagram. Se midió su vigencia: un adjunto de unas horas antes respondía correctamente y los del 13 y 14 de agosto devolvían `404`. Guardar solo el enlace produce una galería que se rompe sola en pocos días, y una copia posterior ya no es posible.
- **Decisión:** al procesar el mensaje entrante se copia el archivo al bucket privado `conversation-media` y se conserva el enlace original solo como referencia. El tipo se decide por los bytes reales del archivo, nunca por lo que declare el proveedor, y lo que no se reconoce no se escribe. La descarga trata el enlace como entrada no confiable: solo `https`, sin credenciales, solo direcciones públicas y sin seguir redirecciones. Nada de esto puede impedir que el mensaje se guarde: un fallo se anota y la fila queda marcada. La ingesta es idempotente por mensaje y posición, y un reintento del webhook reintenta la copia que faltaba. El bucket es privado y la API entrega enlaces firmados de corto plazo, igual que con los avatares.
- **Alternativas consideradas:** Guardar solo el enlace del proveedor, que se rompe en días y ya dejó sin recuperar el histórico; descargar los archivos en la petición del webhook, que pondría en riesgo el acuse de recibo dentro del plazo del proveedor; confiar en el tipo declarado, que permitiría escribir contenido arbitrario como si fuera una imagen; guardar en público para simplificar, que expondría imágenes de clientes.
- **Consecuencias:** La galería seguirá mostrando la imagen dentro de un mes y la conversación muestra la foto junto a su texto. El consumo de almacenamiento crece con el uso, así que conviene fijar una retención antes de que el volumen sea grande. El histórico anterior no se puede rescatar: sus enlaces ya caducaron. Queda pendiente una pasada que reintente las copias fallidas.
- **Cómo se verifica:** Pruebas de clasificación y de cursor; del registro y la copia de un adjunto; de que un fallo de descarga no rompe el mensaje y deja constancia; de que una publicación compartida no se descarga; de que no se repite una copia ya hecha; y de que la galería exige pertenencia, firma enlaces y rechaza un cursor que la aplicación no emitió.

## ADR-044 - El nombre visible pertenece a la cuenta, no al tenant

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** La identidad visible del equipo era el correo: las notas decían `sara@empresa.com` y las asignaciones mostraban la misma dirección. Eso funciona para una persona, pero no para un equipo que se reconoce por nombre. Se evaluó también corregir el perfil del contacto de la conversación, y se descartó.
- **Decisión:** Cada persona define su nombre visible, que se guarda en los metadatos de su cuenta y no en la pertenencia al tenant, de modo que la misma persona lo conserva si pertenece a varios espacios. Solo se edita el propio perfil: la cuenta se toma de la sesión y la petición no acepta un identificador ajeno. El nombre es presentación pura y nunca participa en una decisión de autorización, que sigue dependiendo del rol vigente en la pertenencia. La escritura envía la unión explícita de los metadatos para no depender de si el proveedor combina o reemplaza. Un nombre ausente es un estado válido y la interfaz muestra el correo como respaldo.
- **Alternativas consideradas:** Guardar el nombre en la pertenencia, que obliga a repetirlo por tenant y a migrar la tabla; seguir usando el correo como identidad, que obliga a leer direcciones para saber con quién se habla; permitir que un administrador renombre a otros desde el equipo, que convierte un dato personal en una decisión administrativa y no hacía falta.
- **Consecuencias:** Notas, asignaciones, lista del equipo y avatar muestran nombres. El nombre no es un identificador único y no sirve para autorizar: dos personas podrían elegir el mismo, y por eso ninguna regla lo consulta. Los metadatos de la cuenta son editables por su dueño, lo cual es aceptable precisamente porque solo afectan a la presentación.
- **Cómo se verifica:** Pruebas de lectura del perfil propio, de ausencia de nombre sin invención, de unión de metadatos al guardar, de fallo visible en lectura y escritura, y de que el nombre visible se incorpora a la lista de integrantes del tenant.

## ADR-043 - Biblioteca compartida: el agente mantiene lo suyo, el supervisor ordena

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** Las etiquetas y las respuestas rápidas estaban cerradas al administrador, lo que obligaba a escalar cualquier ajuste cotidiano. Al abrirlas apareció el problema contrario: la biblioteca de respuestas es compartida, y si cualquiera puede editar cualquiera, dos personas reescriben a la vez el texto que la otra está usando en una conversación.
- **Decisión:** La biblioteca de etiquetas la administran administradores y supervisores, porque ordenar la operación es su trabajo; los agentes siguen aplicando y retirando etiquetas. Cualquier integrante crea respuestas rápidas y administra las que creó, mientras supervisores y administradores administran todas. La pertenencia del autor se resuelve con el rol vigente del solicitante comparado con el autor guardado, y la respuesta expone `canManage` para que la interfaz muestre únicamente lo que cada persona puede hacer.
- **Alternativas consideradas:** Dejar ambas bibliotecas solo en manos del administrador, que obliga a escalar lo cotidiano; permitir que cualquiera edite cualquier respuesta, que produce pisadas silenciosas en un texto compartido; usar un permiso nuevo por capacidad, que agrega vocabulario de autorización sin cambiar la operación real.
- **Consecuencias:** El equipo se organiza sin escalar, y cada quien responde por lo que escribió. La regla vive en la API y no en la interfaz, así que se aplica igual aunque un comando llegue directo. Un agente que necesite corregir la respuesta de otra persona debe pedirlo a un supervisor, y la interfaz lo explica en lugar de esconder el botón.
- **Cómo se verifica:** Pruebas de creación por cualquier miembro, de edición de lo propio, de rechazo de lo ajeno, de administración por supervisor, del conflicto por versión vencida y del indicador `canManage` en el listado.

## ADR-042 - Retirar a un integrante no destruye su trabajo

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** Al construir el retiro de integrantes se descubrió que las referencias compuestas de `conversations`, `messages` y `canned_responses` usaban `set null` sobre el par completo, lo que intentaría anular `tenant_id` —obligatorio— y haría fallar el retiro de cualquiera con actividad, mientras que las notas usaban `restrict` y lo bloquearían directamente. El defecto era latente: ninguna prueba podía verlo porque nadie había retirado a un integrante todavía.
- **Decisión:** Cada referencia a la pertenencia libera únicamente la columna de la persona mediante `set null (columna)`, conservando el tenant. Las notas dejan de ser obligatorias y de bloquear el retiro: sobreviven con autoría vacía, de modo que el trabajo permanece aunque quien lo hizo ya no esté.
- **Alternativas consideradas:** Impedir el retiro de integrantes con actividad, que deja al equipo sin salida; borrar en cascada las notas y asignaciones de quien se retira, que destruye contexto operativo del cliente; resolverlo en la aplicación liberando referencias antes de borrar, que no evita que la clave foránea siga bloqueando el borrado.
- **Consecuencias:** Nadie pierde su trabajo al ser retirado: las conversaciones quedan sin asignar, los mensajes conservan su autoría o la pierden sin romper nada, y las notas permanecen visibles con autoría ausente. La interfaz tolera esa ausencia en las notas. La migración toca claves foráneas existentes sobre tablas con datos: no borra ni modifica filas, pero debe aplicarse antes de retirar a alguien.
- **Cómo se verifica:** Pruebas de la API para el retiro de un integrante sin administrador restante, del invariante del último administrador y del aislamiento por tenant; y verificación de la migración en el proyecto remoto antes del primer retiro real.

## ADR-041 - Acceso por invitación con un administrador siempre presente

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** El acceso a la interfaz existía solo insertando filas en `memberships` a mano. No había forma de invitar a alguien desde el producto ni de cambiar un rol, y un tenant podía quedarse sin administrador por un descuido. La protección contra contraseñas filtradas del proyecto sigue desactivada, lo que deja de ser aceptable en cuanto entran más personas.
- **Decisión:** El acceso se concede por invitación desde el propio producto y requiere rol `admin`. La API genera un enlace de un solo uso con la API de administración de Auth: si la persona aún no tiene cuenta, el enlace le permite establecer su contraseña; si ya la tiene, el enlace solo inicia sesión y no se crea una segunda cuenta. La pertenencia es idempotente y **una invitación repetida nunca cambia el rol existente**. Cambiar el rol o retirar a alguien también exige `admin`, y un tenant conserva siempre al menos un administrador: degradar o retirar al último responde conflicto. Retirar la pertenencia no elimina la cuenta de la persona ni sus accesos a otros tenants, y las conversaciones que tuviera asignadas quedan sin asignar por la propia relación.
- **Alternativas consideradas:** Mantener la creación manual en la base; depender solo del correo del proveedor, que exige SMTP configurado; crear la cuenta con una contraseña temporal compartida, que obliga a un canal inseguro y a un cambio que no se puede forzar; permitir que cualquier integrante invite.
- **Consecuencias:** El equipo crece sin tocar la base y sin exponer la clave privada. El enlace es un secreto de un solo uso que solo ve quien lo genera y nunca se registra. El correo puede no llegar si el proyecto no tiene SMTP, y por eso el enlace se entrega en pantalla para compartirlo. La interfaz refleja el rol, pero la API decide en cada comando, así que un cambio de rol afecta los siguientes comandos y no los que ya están en vuelo. Queda pendiente habilitar la protección contra contraseñas filtradas antes de sumar más personas.
- **Cómo se verifica:** Pruebas de autorización por rol, del invariante del último administrador, de la invitación repetida sin cambio de rol, del enlace de acceso entregado a una cuenta existente, del aislamiento por tenant y de que un enlace no generable falla de forma visible.

## ADR-040 - El nombre visible de una cuenta lo decide el equipo, no el proveedor

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** La lista de canales mostraba "Cuenta conectada" porque `display_name` estaba vacío. Un tenant puede tener varias cuentas de la misma plataforma —hoy hay dos de Instagram y una de Facebook en el mismo perfil— y sin nombre no hay forma de distinguirlas en la bandeja. El proveedor sí entrega un usuario por cuenta en sus eventos.
- **Decisión:** El nombre visible pertenece a nuestra cuenta y lo decide el equipo: solo un administrador puede cambiarlo mediante `PATCH /v1/tenants/:tenantId/channels/:channelId`. El proveedor únicamente puede **rellenar** un nombre vacío con el usuario que envía en sus eventos, y esa escritura se aplica con la condición de que el nombre siga vacío, de modo que nunca sobrescriba una decisión del equipo ni la pise un evento simultáneo. Se reutiliza la columna existente: no hay migración.
- **Alternativas consideradas:** Mostrar siempre el identificador del proveedor, que expone datos internos y no es legible; mostrar solo la plataforma, que no distingue dos cuentas iguales; dejar que el proveedor sobrescriba el nombre en cada evento, que borraría la decisión del equipo; agregar una columna nueva de alias paralela al nombre existente.
- **Consecuencias:** Con varias cuentas de la misma plataforma, el equipo puede nombrarlas y reconocerlas de inmediato. El nombre no es único ni identificador: no cambia la relación con la cuenta ni con sus conversaciones. Una cuenta sin tráfico permanece sin nombre hasta que un administrador la nombre o llegue su primer mensaje.
- **Cómo se verifica:** Pruebas del normalizador sobre el usuario y el nombre comercial del proveedor, pruebas del trabajador sobre el relleno condicionado y pruebas de la API sobre rol, alcance por tenant y error visible; más la comprobación en el proyecto remoto, donde la cuenta existente quedó nombrada con el usuario que el proveedor ya enviaba.

## ADR-039 - Un nulo explícito del proveedor no puede invalidar un mensaje

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** Cuando un mensaje entrante no trae texto —una publicación compartida, un adjunto sin comentario— Zernio envía `text: null`. El normalizador declaraba los campos opcionales con `optional()`, que acepta la ausencia pero rechaza el nulo: el evento completo se marcaba como fallido y el mensaje nunca llegaba a la bandeja. Quince mensajes reales entre el 13 y el 15 de agosto y uno del 28 quedaron fuera por esta causa, todos ellos invisibles en la interfaz.
- **Decisión:** En el límite de entrada, un `null` explícito en un campo opcional se trata como ausente; solo los identificadores mínimos —cuenta, conversación, remitente, mensaje y marca de tiempo— siguen siendo obligatorios. Un mensaje sin texto se guarda con cuerpo vacío, porque esa es la representación fiel de lo que ocurrió, y la interfaz lo rotula como contenido no soportado todavía en lugar de inventar texto en los datos.
- **Alternativas consideradas:** Descartar los mensajes sin texto, que además perdía el contacto y la conversación; rellenar el cuerpo con un texto inventado; pedir al proveedor que omita el campo en vez de enviarlo nulo, que no está en nuestras manos.
- **Consecuencias:** Ningún mensaje se pierde por un campo opcional nulo. El cuerpo vacío viaja por el contrato existente y la etiqueta vive en la presentación. Los eventos ya fallidos se recuperan sin migración: basta con limpiar su marca de fallo y el reprocesamiento converge, porque el contacto y la conversación se resuelven por referencia externa y el mensaje tolera el duplicado.
- **Cómo se verifica:** Pruebas del normalizador con `text: null` y con nulos en cada campo opcional, incluida la conservación de la referencia del mensaje; y el reencolado verificado en el proyecto remoto, donde se recuperaron quince eventos, la bandeja pasó de 46 a 66 mensajes y ninguna fila quedó fallida ni pendiente.

## ADR-038 - Recuperación de reclamos abandonados en los workers

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** Los dos workers reclaman trabajo marcándolo como en curso: la entrada escribe `processing_started_at` en `webhook_events` y la salida pasa `outbox_events` a `processing`. Las consultas de cola excluyen lo reclamado. Si el proceso muere entre el reclamo y el cierre, esa fila no se vuelve a mirar nunca: no se procesa, no se marca fallida y no aparece en ningún informe. En entrada significa un mensaje perdido en silencio; en salida, una respuesta que nunca sale y un mensaje que se queda en "enviando".
- **Decisión:** Cada worker, dentro de su ciclo de drenaje, devuelve a la cola el trabajo cuyo reclamo superó un umbral de abandono de cinco minutos, como máximo una vez por minuto. En entrada solo se limpia la marca de reclamo; en salida el evento vuelve a `pending` con su disponibilidad al presente. El reprocesamiento es seguro porque el contacto y la conversación se resuelven por referencia externa, el mensaje entrante tolera el duplicado mediante su índice único, y el despacho saliente conserva la clave de idempotencia estable, de modo que el proveedor repite la respuesta original en lugar de enviar dos veces. Un fallo de la recuperación se registra y nunca detiene el drenaje.
- **Alternativas consideradas:** No recuperar; recuperar sin límite de frecuencia; reintentar también los eventos ya marcados como fallidos; sustituir las colas por un sistema con visibilidad y leasing, como Redis, que resuelve lo mismo con otra dependencia operativa.
- **Consecuencias:** Ningún trabajo reclamado se pierde en silencio y un proceso que muere a mitad de un evento converge al reintentarse. La recuperación es una red de seguridad, no un reintento infinito: el evento vuelve a reclamarse y, si falla de forma determinista, se marca fallido y sale de la cola. Un despacho recuperado mantiene el mensaje en "enviando" hasta que el reenvío se resuelve, porque en ese lapso no se sabe si el proveedor lo aceptó. Los eventos ya marcados como fallidos siguen siendo terminales: su reintento necesita presupuesto por evento y queda fuera de este corte.
- **Cómo se verifica:** Pruebas del umbral y de la puerta de frecuencia, de la forma exacta de la consulta de recuperación en ambas colas y de que un fallo de recuperación no detiene el drenaje.

## ADR-037 - Atención por persona y continuación por cursor en la bandeja

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** La bandeja decidía si una conversación estaba sin leer en el navegador, con `status === 'open'` más un conjunto en memoria de la sesión, de modo que al recargar reaparecían todas y las pendientes nunca marcaban nada. La lista cortaba en 50 conversaciones sin continuación y buscaba solo en el nombre del contacto, sobre la página ya cargada.
- **Decisión:** La marca de lectura pertenece a `(tenant, conversación, persona)` en su propia tabla `conversation_reads`, avanza de forma monotónica y el servidor la acota al instante del mensaje más reciente, de modo que un cliente no pueda silenciar mensajes que aún no existen. Una conversación requiere atención cuando tiene un mensaje entrante posterior a la marca; los envíos del equipo no generan atención. La vista previa y el último entrante se leen con relaciones embebidas acotadas por consulta, sin columnas denormalizadas que puedan divergir entre los tres caminos que escriben mensajes. La continuación es un cursor keyset sobre `(last_message_at desc nulls last, id desc)`, y la búsqueda se resuelve en dos pasos —contactos que coinciden, luego sus conversaciones— porque el motor de consultas no admite puntos dentro de sus condiciones lógicas.
- **Alternativas consideradas:** Mantener el indicador de sesión; guardar la vista previa en una columna mantenida por un disparador; una función SQL que devolviera página, vista previa y conteo de no leídos en una sola consulta; buscar dentro de la condición lógica embebida; filtrar la búsqueda en el navegador.
- **Consecuencias:** La atención es por persona y sobrevive a la recarga; la interfaz dejó de calcularla. La marca vive fuera de `conversations` y no altera el orden de la bandeja ni el cursor de tiempo real. El conteo de no leídos por conversación queda fuera de este corte y puede agregarse después sin cambiar el contrato. La búsqueda no distingue acentos: hacerlo exigiría habilitar la extensión `unaccent`.
- **Cómo se verifica:** Pruebas de dominio para monotonicidad, acotado y atención; pruebas de API para cursor, búsqueda, paginación y comando de lectura; verificación remota de la tabla, sus privilegios revocados y la consulta exacta del listado; y comprobación en vivo con la sesión real, donde la marca avanzó al recibir un mensaje nuevo con la conversación abierta.

## ADR-036 - Las funciones de la bandeja permanecen alcanzables en cualquier ancho

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Contexto:** El panel de detalles se ocultaba por completo con `display: none` desde 1180px, y con él desaparecían las únicas entradas a estado, bot, asignación, etiquetas y notas privadas. Por debajo de 620px se ocultaba además la lista de conversaciones sin ninguna forma de volver a ella. La bandeja quedaba de solo lectura o sin navegación, aunque la especificación de bandeja compacta exige conservar las funciones.
- **Decisión:** La presentación de la bandeja nunca retira una función. Por debajo de 1180px el panel de detalles se convierte en un cajón superpuesto que el encabezado de la conversación abre y que se cierra con su botón, con el fondo o con Escape; por debajo de 620px la lista y la conversación alternan con un botón de retorno. La alternancia se resuelve con estado de presentación y media queries, sin mover ninguna regla de operación a la interfaz.
- **Alternativas consideradas:** Mantener oculto el panel y duplicar las acciones en el encabezado; reducir la densidad sin cajón; construir una vista móvil separada; detectar el ancho en JavaScript; dejar el panel fuera del alcance y documentarlo como limitación.
- **Consecuencias:** La operación completa sigue disponible en cualquier ancho y el historial se ancla al último mensaje salvo que la persona se haya desplazado a leer mensajes anteriores. El avatar cae a iniciales cuando la URL firmada no carga, en la lista y en el panel. Se añaden únicamente reglas de presentación (`.details-panel.open`, `.mobile-list-open`, `.details-drawer-backdrop`); no cambian contratos, datos, permisos ni efectos externos.
- **Cómo se verifica:** Revisión estática de las reglas CSS y del JSX; comprobación de tipos, lint, formato, pruebas y build de web. La comprobación visual con una sesión autenticada y conversaciones reales queda como paso manual.

## ADR-035 - Avatares de contacto privados con entrega temporal

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** El usuario externo y el avatar obtenidos de `message.received` firmado se guardan con el contacto del tenant. El worker descarga únicamente imágenes HTTPS con DNS público, sin redirecciones, de hasta 2 MiB y cuya firma binaria sea JPEG, PNG o WebP. Los bytes se almacenan en `contact-avatars`, un bucket privado; la API emite una URL firmada de diez minutos solo después de comprobar pertenencia del usuario al tenant.
- **Consecuencias:** La UI no recibe ni conserva la URL original de Zernio y puede volver a iniciales si no hay objeto válido. Una falla de avatar no falla el mensaje. Los objetos antiguos pueden quedar huérfanos tras un cambio de foto; se depurarán en un corte operativo posterior.
- **Como se verifica:** Pruebas de URL local rechazada, ausencia de avatar, firma temporal tras membresía y contrato de bandeja; migración remota y comprobación del bucket privado.

## ADR-034 - Perfil Zernio por tenant y alta de cuenta por webhook firmado

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** La aplicacion crea o reutiliza un unico perfil Zernio por tenant, con clave de idempotencia estable. Solo un administrador inicia el OAuth estandar alojado en Zernio. La cuenta no se confia desde el retorno del navegador: el webhook HMAC `account.connected`, asociado al `profileId`, es la unica fuente que crea o actualiza `channel_accounts`.
- **Consecuencias:** El navegador no recibe la clave Zernio ni se le solicita un `accountId`. Una cuenta ya registrada en otro tenant provoca conflicto y nunca se reasigna. Si falla o falta el webhook, no se acepta trafico de esa cuenta como perteneciente al tenant.
- **Como se verifica:** Migracion remota aditiva para el perfil, pruebas del webhook firmado de alta automatica y controles de tipos, lint, formato y pruebas del workspace.

## ADR-033 - Plataforma del canal desde eventos firmados

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** La plataforma visible de una conversación proviene de `channel_accounts.platform`. El worker la sincroniza únicamente desde `message.platform` de un webhook Zernio ya autenticado. La reparación histórica solo completa valores vacíos con el último valor observado de la misma cuenta.
- **Consecuencias:** No se deduce el canal desde nombres, texto o interfaz; no se sobrescriben plataformas existentes. La bandeja puede etiquetar con precisión Instagram, Messenger, WhatsApp, TikTok u otros valores entregados por el proveedor.
- **Como se verifica:** Pruebas de normalización y sincronización por tenant, además de una consulta remota agregada que confirmó la plataforma de conversaciones existentes sin leer contenido de clientes.

## ADR-032 - Alcance de asignacion resuelto en servidor

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** La bandeja conserva un alcance `all` para todo miembro del tenant y agrega `assigned_to_me`. Este ultimo filtra por la identidad autenticada en la API, no por un ID enviado por la UI.
- **Consecuencias:** La vista es compatible al omitir el parametro y se combina con filtros de etiqueta. No cambia permisos, asignaciones ni tablas.
- **Como se verifica:** Pruebas de identidad autenticada, ausencia de filtro de usuario para `all`, aislamiento tenant y controles de contrato.

## ADR-031 - Gateway del agente bloqueado fuera de auto

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** El Agent Gateway recibe una solicitud minima con IDs internos y texto del mensaje. Antes de invocar cualquier transporte consulta la politica de dominio: solo `auto` es elegible; `paused` y `suggest` se omiten. La salida se valida estrictamente antes de convertirse en una decision interna.
- **Consecuencias:** Esta base no contiene URL, secreto, autenticacion n8n, llamada de red, mensaje ni outbox. La conexion futura debe aportar contrato oficial y comprobar de nuevo `auto` antes del efecto externo.
- **Como se verifica:** Pruebas de modo `auto`, bloqueos `paused`/`suggest` y rechazo de salida invalida.

## ADR-030 - Notas privadas acumulativas por conversacion

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** Las notas internas se almacenan como registros acumulativos aislados por tenant y conversacion. Cualquier miembro autenticado del tenant puede leerlas y crear una nueva; no se editan ni eliminan en este corte.
- **Consecuencias:** La nota no viaja a Zernio, n8n, mensajes ni eventos en tiempo real. La creacion requiere clave de idempotencia y conserva autoria interna.
- **Como se verifica:** FK compuestas tenant/recurso/autor, RLS, privilegios sin navegador, pruebas de membresia, alcance de conversacion y reintento idempotente.

## ADR-029 - Interruptor de bot por conversacion

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** `conversations.automation_mode` controla la futura automatizacion por chat. Todo integrante autenticado del tenant puede alternar solo entre `auto` y `paused`; `automation_version` protege la operacion de concurrencia. Los valores historicos `suggest` se conservan, pero no autorizan envio automatico.
- **Consecuencias:** El corte no llama a n8n, Zernio ni crea outbox. Un Agent Gateway futuro debe verificar `auto` antes de crear el comando y de nuevo inmediatamente antes del envio externo.
- **Como se verifica:** Migracion remota aditiva, contratos, pruebas de miembro/concurrencia/reintento, RLS y privilegios cerrados para navegador.

## ADR-028 - Asignacion interna con version independiente

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Decision:** La asignacion conserva la FK compuesta existente a `memberships` y usa `conversations.assignment_version`, independiente de `status_version`. Solo `admin` y `supervisor` cambian el responsable; el destino se comprueba en el mismo tenant. Un reintento con el destino vigente tiene exito; una version obsoleta con un destino distinto devuelve conflicto.
- **Consecuencias:** No se crea outbox ni llamada a Zernio. La etiqueta de correo de integrantes se obtiene solo en API de servidor, se limita a miembros autenticados del mismo tenant y no entra en SSE ni logs.
- **Como se verifica:** Pruebas de rol, integrante fuera de tenant, actualizacion condicionada y reintento idempotente; migracion remota, tipos remotos y RLS/privilegios.

## ADR-001 — Plataforma de atención por chat sin dominios operativos externos

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** El repositorio contenía material de ejemplo para spa, reservas y agenda que no pertenece al objetivo del producto.
- **Decisión:** Limitar Chat Zernio a atención conversacional, automatización controlada, organización de bandeja y multimedia.
- **Alternativas consideradas:** Incorporar reservas/pagos como módulos iniciales; mantenerlos como requisitos implícitos.
- **Consecuencias:** Esos conceptos no forman parte del modelo, contratos, UI ni pruebas. `example-spa/` se conserva como material fuera de alcance.
- **Cómo se verifica:** Revisión de especificaciones, arquitectura, UI y contratos contra el alcance.

## ADR-002 — Monolito modular con API, worker y UI separados

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** El sistema requiere límites sólidos de dominio, trabajo asíncrono y escalabilidad independiente, sin la complejidad prematura de microservicios.
- **Decisión:** Usar un monorepo TypeScript con `apps/web`, `apps/api`, `apps/worker` y paquetes de dominio/infraestructura.
- **Alternativas consideradas:** Microservicios desde el inicio; aplicación única sin worker separado.
- **Consecuencias:** API y worker escalan de forma independiente; los contratos internos deberán permanecer explícitos.
- **Cómo se verifica:** Dependencias hacia el dominio, pruebas de integración y despliegues de procesos separados.

## ADR-003 — Base local, inbox/outbox e idempotencia

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** Webhooks, colas y proveedores pueden repetir, retrasar o perder confirmaciones.
- **Decisión:** Persistir un inbox deduplicado y crear outbox transaccional para cada efecto externo; usar claves idempotentes estables.
- **Alternativas consideradas:** UI leyendo directamente de Zernio; procesar todo dentro del webhook; reintentos sin clave estable.
- **Consecuencias:** Mayor modelado y operación, a cambio de trazabilidad y recuperación.
- **Cómo se verifica:** Pruebas de duplicados, concurrencia, timeout y reconciliación.

## ADR-004 — SSE inicial para actualizaciones de interfaz

- **Fecha:** 2026-08-13
- **Estado:** propuesta
- **Contexto:** La interfaz necesita actualizaciones principalmente del servidor hacia el navegador.
- **Decisión:** Adoptar SSE con recuperación mediante `Last-Event-ID`, sujeto a spike frente a Supabase Realtime.
- **Alternativas consideradas:** Supabase Realtime; WebSocket.
- **Consecuencias:** Menor complejidad inicial; presencia o colaboración bidireccional requerirían una revisión posterior.
- **Cómo se verifica:** Spike documentado de seguridad, coste, límites y reconexión.

## ADR-005 — Agent Gateway como frontera obligatoria para n8n

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** El workflow existente no debe ampliar su acceso a datos, proveedores ni secretos.
- **Decisión:** Toda interacción con n8n pasa por un gateway con autenticación, esquemas estrictos, timeout, auditoría y autorización de herramientas.
- **Alternativas consideradas:** n8n conectado directamente a Zernio o Supabase.
- **Consecuencias:** Debe validarse el contrato real antes de integrar; un handoff pausa la automatización por defecto.
- **Cómo se verifica:** Pruebas de contrato, aislamiento, respuestas duplicadas y handoff.

## ADR-006 — Envío de adjuntos Zernio desde worker mediante multipart

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** Zernio permite adjuntos por URL públicamente accesible o mediante solicitudes multipart; la plataforma conserva medios en Storage privado.
- **Decisión:** El worker enviará binarios aprobados desde Storage privado mediante multipart. No se publicará un objeto de Storage para usarlo como `attachmentUrl`.
- **Alternativas consideradas:** Exponer temporalmente una URL pública; entregar una URL arbitraria desde n8n.
- **Consecuencias:** El worker requiere acceso autenticado al objeto y debe aplicar límites de tiempo/tamaño; se conserva la política de archivos privados.
- **Cómo se verifica:** Prueba de contrato con imagen y video en staging, comprobando que el archivo permanece privado antes y después del envío.

## ADR-007 — Ventana externa de idempotencia y estado incierto

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** Zernio conserva las claves de idempotencia durante 24 horas; después no es seguro repetir automáticamente un envío cuyo resultado sea desconocido.
- **Decisión:** Los reintentos automáticos conservan la clave y el cuerpo originales dentro de la ventana del proveedor. Al expirar, el mensaje pasa a estado de reconciliación/manual en vez de crear una clave nueva y reenviar.
- **Alternativas consideradas:** Reintentar indefinidamente; generar una nueva clave tras 24 horas.
- **Consecuencias:** Se evita un doble envío tardío; la reconciliación debe consultar el historial o requerir una decisión operativa.
- **Cómo se verifica:** Pruebas simuladas de timeout, 409, 422 y expiración de ventana.

## ADR-008 — Fundaciones sin dependencias de proveedores

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** El proyecto Supabase de desarrollo está vacío de tablas operativas, pero Zernio, Redis y n8n aún no tienen contratos/entornos conectados.
- **Decisión:** Crear el monorepo, contratos, dominio, API, worker y UI sin clientes ni efectos hacia proveedores.
- **Alternativas consideradas:** Esperar todas las integraciones; conectar proveedores con valores provisionales.
- **Consecuencias:** Las reglas internas se verifican desde el inicio sin secretos ni riesgo entre clientes; las capas de infraestructura se incorporarán tras validación contractual.
- **Cómo se verifica:** Lockfile, controles estáticos, pruebas de dominio y ausencia de conexiones externas en este corte.

## ADR-009 — Parches transitivos de seguridad fijados en el workspace

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** La auditoría de dependencias detectó vulnerabilidades de seguridad en dependencias transitivas de la UI que no se pueden actualizar a través de una versión mayor de Next sin ampliar este corte.
- **Decisión:** Fijar mediante `pnpm.overrides` las versiones compatibles corregidas de `postcss` y `sharp`; mantener los parches directos de Fastify y Nest dentro de sus versiones mayores actuales.
- **Alternativas consideradas:** Ignorar los avisos; actualizar Next a una versión mayor; introducir dependencias de sustitución.
- **Consecuencias:** El lockfile queda reproducible y sin vulnerabilidades conocidas de producción. Cada actualización de Next deberá volver a revisar los overrides.
- **Cómo se verifica:** `corepack pnpm audit --prod`, compilación y pruebas del workspace.

## ADR-010 — Supabase como fuente local con Data API bloqueada inicialmente

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** El proyecto de desarrollo está vacío y la interfaz aún no tiene autenticación ni casos de uso de API para autorizar accesos por tenant.
- **Decisión:** Crear el esquema operativo inicial con RLS y revocar los privilegios de `anon` y `authenticated`. La API propia será la única frontera para los datos cuando se implemente autenticación.
- **Alternativas consideradas:** Conectar la UI directamente con una clave publicable; dejar RLS sin activar; crear una política permisiva temporal.
- **Consecuencias:** No hay lectura ni escritura accidental desde el navegador. La siguiente fase deberá incluir sesiones, políticas RLS comprobadas y un cliente de servidor antes de exponer datos en la interfaz.
- **Cómo se verifica:** Asesores de seguridad, inspección del esquema, tipos generados y pruebas de autorización futuras.

## ADR-011 — Auth en cookies y autorización de tenant en la API propia

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** La interfaz necesita iniciar sesión sin recibir una credencial privilegiada y los datos operativos siguen cerrados a la Data API de Supabase.
- **Decisión:** La web usa `@supabase/ssr` y una clave publicable para conservar la sesión en cookies. La API recibe un JWT Bearer, lo valida con Supabase Auth y comprueba `memberships(tenant_id, user_id)` antes de cada consulta operativa. Solo la API crea el cliente con `SUPABASE_SECRET_KEY` (o la alternativa heredada `SUPABASE_SERVICE_ROLE_KEY`).
- **Alternativas consideradas:** Guardar la sesión en `localStorage`; consultar las tablas desde la UI; autorizar por un `tenant_id` sin verificar la membresía; publicar una política RLS temporal permisiva.
- **Consecuencias:** La clave privada debe configurarse exclusivamente en el entorno de API; una identidad de Auth sin membresía recibe `403`, y un entorno sin clave privada responde `503` tras validar la forma de la credencial. La primera ruta queda limitada a lectura de conversaciones; no se introduce escritura sin un caso de uso transaccional e idempotente.
- **Cómo se verifica:** Pruebas de cabecera Bearer, configuración incompleta y membresía ausente; comprobación local de `/health` y ruta protegida; inspección de que no existen secretos en `apps/web`.

## ADR-012 — BFF de lectura y selección explícita de tenant

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** La interfaz autenticada debe mostrar la bandeja real sin consultar tablas de Supabase ni asumir que una identidad pertenece a un tenant determinado.
- **Decisión:** Next.js expone un BFF interno que valida los claims de sesión y transmite el JWT solo al API propio. La API lista las membresías del usuario y vuelve a verificar la membresía antes de cada consulta de conversaciones. La web resuelve automáticamente el tenant únicamente si hay exactamente uno; con cero o varios muestra un estado explícito.
- **Alternativas consideradas:** Acceso de la UI a la Data API; elegir el primer tenant recibido; conservar conversaciones de demostración mientras la base está vacía.
- **Consecuencias:** La primera carga de datos es de solo lectura y una bandeja vacía es un estado válido. Será necesario un selector de tenant cuando un usuario tenga más de una membresía; historial, comandos y SSE permanecen en cortes posteriores.
- **Cómo se verifica:** Pruebas de membresía y listado de tenants, contratos validados, build de Next/API y consulta remota que confirma una membresía y cero conversaciones para Inside Spa.

## ADR-013 — Ingreso de Zernio con vínculo explícito de cuenta

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** Los webhooks de Zernio son compartidos por equipo y los eventos de Inbox indican la cuenta emisora en `account.id`; no es seguro deducir el tenant por nombre, URL o datos de contacto.
- **Decisión:** La API verifica el HMAC-SHA256 sobre los bytes originales antes de interpretar el JSON. Cada cuenta se registra en `channel_accounts` con proveedor `zernio` y un único tenant. Solo eventos firmados de una cuenta registrada se insertan en `webhook_events`; el conflicto único se considera una entrega duplicada correcta.
- **Alternativas consideradas:** Atribuir todos los eventos a Inside Spa; usar el primer tenant; procesar la conversación dentro de la solicitud del webhook; aceptar cuerpos sin firma durante pruebas.
- **Consecuencias:** El administrador debe registrar la cuenta real antes de activar eventos de mensajes. `webhook.test` firmado se acepta sin cuenta para comprobar conectividad. El endpoint no envía mensajes ni procesa el cuerpo; un worker de normalización será un corte posterior.
- **Cómo se verifica:** Pruebas de HMAC, cuerpo alterado, cuenta desconocida, duplicado y evento de prueba; migración remota con RLS y permisos Data API revocados.

## ADR-014 — Worker de normalización idempotente para mensajes entrantes

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** Un webhook validado de Zernio es una entrega al menos una vez y no debe crear duplicados ni asignarse a un tenant por contenido.
- **Decisión:** El worker reclama eventos pendientes, procesa exclusivamente `message.received`, vuelve a resolver la cuenta contra `channel_accounts` y conserva referencias externas de cuenta para contacto, conversación y mensaje. Los eventos ajenos se completan sin inventar datos; los inválidos o fallidos quedan visibles con un código seguro.
- **Alternativas consideradas:** Crear datos directamente en el webhook; deducir tenant por nombre; almacenar solo el texto sin referencias externas; detener el worker ante un fallo temporal de lectura.
- **Consecuencias:** Las restricciones únicas hacen idempotente el mensaje recibido y la regla de dominio reabre solo conversaciones resueltas. La recuperación de reclamaciones abandonadas requiere un reconciliador antes de producción.
- **Cómo se verifica:** Pruebas de formato, referencias aisladas por cuenta, reapertura y continuidad del worker ante fallo de consulta; verificación del esquema remoto y controles del workspace.

## ADR-015 — Rutas internas con fallo de sesión legible por cliente

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** Una redirección HTML de middleware para una ruta `/api/` hace que el cliente de la bandeja intente interpretar HTML como JSON y oculte la causa real de una sesión vencida.
- **Decisión:** Las rutas internas devuelven `401` JSON cuando no hay claims válidos. La interfaz redirige al acceso ante ese estado y protege el parseo ante respuestas que no sean JSON.
- **Consecuencias:** El usuario puede renovar sesión sin confundir un problema de autenticación con una indisponibilidad de la bandeja. Las rutas de página siguen redirigiendo a `/login`.
- **Cómo se verifica:** Petición sin sesión a `/api/inbox` devuelve `401` JSON; tipos, lint, formato y build del workspace.

## ADR-016 — Fechas de persistencia normalizadas en el límite de API

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** PostgreSQL/Supabase puede entregar marcas de tiempo con un desplazamiento `+00`, mientras el contrato público de la bandeja exige datetimes ISO canónicos.
- **Decisión:** La API valida y convierte las fechas de conversaciones a ISO UTC antes de aplicar el contrato. Una fecha ausente o inválida se hace visible como error de servidor en vez de devolver una respuesta que el contrato no acepta.
- **Consecuencias:** El formato de almacenamiento no se filtra al cliente y todas las variantes válidas de Postgres se representan de manera consistente.
- **Cómo se verifica:** Prueba de una fecha con desplazamiento `+00`; pruebas, tipos, lint, formato y build del workspace.

## ADR-017 — Historial local y outbox atómico para respuestas humanas

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** La interfaz ya muestra conversaciones normalizadas, pero no puede presentar su historial ni ejecutar una respuesta humana de forma trazable y segura.
- **Decisión:** La API propia lee los mensajes locales con autorización por tenant. Un comando de texto crea el mensaje `queued` y, mediante un trigger privado, su outbox en la misma transacción. El worker es el único componente que usa `ZERNIO_API_KEY` para efectuar el envío con la clave idempotente del comando. Un `2xx` significa `sent`; confirmaciones de entrega/lectura se integrarán cuando exista correlación explícita de proveedor.
- **Alternativas consideradas:** UI llamando a Zernio; insertar mensaje y outbox en llamadas separadas; reenviar con una clave nueva tras timeout; inferir la correlación de webhooks por contenido.
- **Consecuencias:** La base local mantiene el historial visible y el efecto externo puede reintentarse sin duplicar. Los fallos definitivos son visibles y se evita correlacionar mensajes de distintos contactos por su texto.
- **Cómo se verifica:** Pruebas de aislamiento, idempotencia, un único outbox por comando, adaptador simulado y controles completos del workspace; revisión de asesores de Supabase tras la migración.

## ADR-018 — Estados de entrada incluidos en el contrato de historial

- **Fecha:** 2026-08-13
- **Estado:** aceptada
- **Contexto:** La persistencia usa `received` para un mensaje entrante válido, pero el contrato inicial del historial enumeraba únicamente estados salientes.
- **Decisión:** El contrato de mensaje incluye `received`. La política de progresión de transporte deja invariantes los mensajes entrantes y solo ordena los estados salientes.
- **Consecuencias:** El historial representa tanto mensajes recibidos como salientes sin relajar la validación de estados ni cambiar el esquema.
- **Cómo se verifica:** Prueba de serialización de `received`, prueba de no regresión de estado y controles del workspace.

## ADR-019 — Correlación explícita para ciclo de vida de mensajes

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** Los eventos `sent`, `delivered`, `read` y `failed` deben actualizar exactamente el mensaje saliente que reporta Zernio, sin confundir mensajes con texto parecido o de otra conversación.
- **Decisión:** Conservar `data.messageId` devuelto por el envío y usarlo, junto con tenant y cuenta de canal, como única correlación de eventos de ciclo de vida. Un evento sin coincidencia se registra como procesado sin crear una copia ni inferir identidad.
- **Consecuencias:** La bandeja muestra únicamente estados confirmados y evita actualizaciones horizontales o duplicados. Los mensajes enviados antes de incorporar la referencia no se reconcilian de forma retrospectiva.
- **Cómo se verifica:** Pruebas de respuesta del adaptador, cuenta equivocada, referencia desconocida, eventos tardíos y transición monotónica.

## ADR-020 — Confirmación de envío por identificador, con hora de acuse opcional

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** La respuesta activa de Zernio confirmó un envío con `data.messageId` y `conversationId`, pero omitió `data.sentAt`, aunque el ejemplo de su documentación incluye ese campo. Rechazar esa respuesta deja mensajes aceptados en la cola y fuerza reintentos idempotentes innecesarios.
- **Decisión:** Un HTTP exitoso que contenga un `data.messageId` válido confirma el envío y permite completar el outbox. `data.sentAt` se conserva cuando exista; si falta, se usa la hora local en que se recibió el acuse exclusivamente como `sent_at`. No se infiere entrega ni lectura: esos estados siguen dependiendo de los webhooks correlacionados.
- **Alternativas consideradas:** Exigir siempre `sentAt`; marcar un mensaje aceptado como fallido; deducir entrega desde la ausencia de error.
- **Consecuencias:** La integración tolera una variante compatible de la respuesta sin perder correlación ni idempotencia. La hora alternativa es una marca de acuse local, por lo que no debe usarse como evidencia de entrega por plataforma.
- **Cómo se verifica:** Pruebas del adaptador con respuesta que incluye y que omite `sentAt`, prueba manual del outbox existente y comprobación de su estado final sin crear otra solicitud local.

## ADR-021 — El temporizador de trabajo conserva vivo al worker

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** El worker iniciaba un drenaje y programaba su repetición con un temporizador no referenciado. Tras completarse el arranque, Node podía terminar aunque existieran eventos pendientes en el outbox.
- **Decisión:** El programador periódico mantiene una referencia activa al temporizador. Se extrae en una función pequeña y probada que ejecuta el drenaje inicial y agenda los siguientes cada dos segundos.
- **Alternativas consideradas:** Procesar la cola manualmente; depender de una página abierta; marcar los mensajes como enviados sin que el worker los reclame; usar un temporizador no referenciado.
- **Consecuencias:** El worker de desarrollo y producción permanece disponible para inbox y outbox. La reclamación condicional de filas y la clave idempotente mantienen la seguridad ante más de una instancia.
- **Cómo se verifica:** Prueba del ciclo inicial y de que no se invoca `unref`, verificación real de un outbox completado y controles completos del workspace.

## ADR-022 — Identificador de plataforma como correlación prioritaria de Zernio

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** Los eventos de lectura de Instagram llegaban y se procesaban correctamente, pero `message.id` no coincidía con el identificador devuelto por el endpoint de envío. El mismo payload incluyó `message.platformMessageId`, que sí corresponde a la identidad local conservada tras el envío.
- **Decisión:** Para el ciclo de vida, se prioriza `message.platformMessageId` y se mantiene `message.id` solo como respaldo cuando el primero esté ausente. Una reconciliación manual y acotada puede volver a aplicar eventos ya procesados usando la nueva correlación exacta.
- **Alternativas consideradas:** Comparar texto o horario; asociar por contacto; actualizar todos los mensajes de una conversación; ignorar los estados de lectura ya recibidos.
- **Consecuencias:** La actualización sigue aislada por tenant y cuenta de canal, y los eventos antiguos pueden recuperar su estado correcto sin reenviar ni inventar identidades. La progresión monotónica sigue siendo la única autoridad para el estado final.
- **Cómo se verifica:** Prueba de prioridad de `platformMessageId`, prueba de respaldo por `message.id`, reconciliación manual de eventos persistidos y controles completos del workspace.

## ADR-023 — SSE opaco y protegido por tenant para tiempo real

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** La bandeja requería refresco manual para mostrar mensajes y estados procesados por el worker, aunque la arquitectura establece SSE como mecanismo inicial de tiempo real.
- **Decisión:** La API propia produce señales SSE opacas tras verificar sesión Bearer y membresía de tenant. Un BFF de Next.js conserva la sesión en servidor y el navegador se conecta solo a su propio origen. Cada señal ordena volver a consultar REST, sin transmitir contenido ni credenciales mediante el stream.
- **Alternativas consideradas:** Exponer Supabase Realtime al navegador; usar tokens en parámetros de EventSource; publicar cuerpos de mensajes por SSE; depender de recarga manual.
- **Consecuencias:** No se exponen tablas operativas, claves ni datos de otras cuentas. La consistencia es eventual y la reconexión fuerza una recarga segura mediante `Last-Event-ID`. La UI mantiene un sondeo de respaldo de cuatro segundos para que un stream local intermediado o reintentándose no deje obsoleto el historial abierto; producción futura deberá sustituir el sondeo por una publicación distribuida si aumenta el volumen.
- **Cómo se verifica:** Pruebas de autorización, aislamiento de tenant, opacidad del cursor, formato del stream, BFF autenticado y recarga de UI ante una señal.
- **Actualización 2026-09-28:** el sondeo de respaldo dejó de ser incondicional. El sondeo rápido de cuatro segundos sostiene la bandeja solo mientras el stream no esté abierto y se detiene en cuanto el stream se abre, reanudándose si emite error; en paralelo se mantiene una comprobación lenta de treinta segundos en todos los casos, que es la que cubre el escenario previsto aquí (un stream que permanece abierto pero deja de entregar señales). El motivo fue el volumen medido: unas treinta solicitudes por minuto y por persona con el sondeo permanente. La alternativa considerada y descartada fue eliminar el sondeo del todo, porque dejaría la bandeja silenciosamente obsoleta ante una señal perdida.

## ADR-024 — Cambio de estado con versión de concurrencia

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** Dos miembros de un mismo tenant pueden tener abierta la misma conversación. Un cambio posterior no debe sobrescribir de forma silenciosa la decisión que otro miembro ya aplicó.
- **Decisión:** `conversations.status_version` se incrementa en cada cambio de estado. El comando incluye la versión visible y actualiza por tenant, conversación y versión. Si el estado objetivo ya quedó aplicado, el reintento devuelve la representación actual; si quedó un estado distinto, responde conflicto.
- **Alternativas consideradas:** Última escritura gana; comparar fechas normalizadas por cliente; bloquear la conversación en la interfaz; confiar en que solo opere un agente.
- **Consecuencias:** Las acciones son repetibles sin efectos externos y los conflictos se vuelven visibles para la persona operadora. Los mensajes entrantes conservan su regla de reapertura y actualizan la versión cuando cambian de `resolved` a `open`.
- **Cómo se verifica:** Pruebas de cambio válido, reintento idempotente, conflicto, aislamiento por tenant y actualización de cursor SSE.

## ADR-025 - Respuestas rápidas privadas con edición protegida

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** Un equipo necesita reutilizar textos frecuentes sin compartirlos entre tenants ni convertir una selección en un envío automático.
- **Decisión:** `canned_responses` pertenece a un tenant, queda cerrada a la Data API y se opera exclusivamente por la API propia. Cualquier miembro puede listar y colocar una respuesta en el borrador; solo `admin` puede crear, editar o borrar. La creación usa una clave idempotente por tenant y las ediciones/borrados se condicionan por versión.
- **Alternativas consideradas:** Guardar plantillas en el navegador; permitir que cualquier agente cambie la biblioteca; seleccionar y enviar directamente a Zernio; última escritura gana.
- **Consecuencias:** La selección no crea mensajes ni eventos outbox, por lo que la persona aún revisa y modifica el texto antes del envío manual. Los conflictos quedan visibles y ningún recurso puede cruzar el límite de tenant.
- **Cómo se verifica:** Pruebas de rol, creación idempotente y conflicto; consulta remota de RLS y privilegios; controles de tipos, lint, formato, pruebas y build de API.

## ADR-026 — Etiquetas internas como recursos privados y vínculos idempotentes

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** El equipo necesita clasificar conversaciones sin usar etiquetas de Zernio ni permitir que un tenant vea o modifique los recursos de otro.
- **Decisión:** La biblioteca `labels` y sus vínculos `conversation_labels` pertenecen al tenant y permanecen cerrados a la Data API. La API propia exige membresía para consultar, aplicar y retirar; exige `admin` para administrar la biblioteca. Crear usa una clave idempotente por tenant; editar/eliminar usan versión; aplicar/retirar converge al mismo estado aunque el comando se repita.
- **Alternativas consideradas:** Usar etiquetas de proveedor; guardar etiquetas solo en el navegador; permitir edición a todos los agentes; última escritura gana; emitir eventos o llamadas a Zernio.
- **Consecuencias:** Ninguna etiqueta produce un mensaje, outbox o efecto externo. Las FK compuestas impiden enlaces horizontales y borrar una etiqueta retira únicamente sus vínculos internos. La interfaz conserva la sesión en servidor mediante BFF y solo presenta comandos.
- **Cómo se verifica:** Pruebas de rol, aislamiento, creación repetida, conflicto y aplicación idempotente; verificación remota de RLS/privilegios; asesores y controles completos del repositorio.

## ADR-027 — Filtro de bandeja con validación de etiqueta tenant-scoped

- **Fecha:** 2026-08-14
- **Estado:** aceptada
- **Contexto:** Las etiquetas clasifican conversaciones, pero una persona necesita encontrar la cola asociada sin cargar etiquetas de otros tenants ni convertir la interfaz en autoridad de acceso.
- **Decisión:** `labelId` es un parámetro opcional del listado de conversaciones. Tras autenticar y comprobar membresía, la API comprueba que la etiqueta existe en ese tenant, consulta sus vínculos `conversation_labels` y restringe la consulta de conversaciones a esos IDs. Si no hay vínculos devuelve una lista vacía; sin parámetro mantiene la lectura actual.
- **Alternativas consideradas:** Filtrar en el navegador después de cargar todas las etiquetas por conversación; confiar en el UUID sin comprobar tenant; exponer la Data API; usar un join tipado no soportado por el cliente actual.
- **Consecuencias:** El filtro es una lectura sin efectos externos y sigue siendo compatible con estado y búsqueda de la interfaz. Una etiqueta inexistente u horizontal es `404`, no una lista ambigua. No hay migración, permisos ni datos de demostración.
- **Cómo se verifica:** Pruebas de filtro válido, ausencia de vínculos, etiqueta horizontal y lectura normal; controles completos de API/web.

## CAPI de Meta Ads: el hecho de negocio es "ganado" con valor (2026-10-01)

**Contexto.** Para que Meta acepte una conversion se necesita el identificador de clic (`ctwa_clid`)
o el identificador del usuario en la plataforma, el **valor total** de la cita (no el deposito) y el
identificador de la conversacion. Ademas hace falta un hecho de negocio explicito: nada se convierte
por recibir un mensaje o cambiar un estado.

**Decision.**

- El hecho de negocio es la conversacion **ganada** con su **valor total**. Se modela como estado
  propio (`outcome`), **en paralelo** al estado operativo: una conversacion puede estar resuelta y
  ganada a la vez.
- Se registra por **dos puertas con una sola regla**: el boton "Ganado" en la conversacion (persona)
  y el endpoint de tools (bot, cuando detecta el pago). Nunca dos implementaciones.
- Un negocio ganado trae **siempre** valor, origen (persona o bot) y fecha: lo impone la base.
- El bot puede reintentar sin duplicar: la referencia de origen es unica por espacio.
- **Se descarta** marcar una etiqueta concreta como "cita confirmada". Las etiquetas organizan; el
  hecho de negocio tiene su propio estado. Evita ataduras a nombres concretos.
- El valor se carga en **MXN** y el evento que se enviara a Meta es `Purchase`.

**Consecuencias.** Ninguna migracion aplicada se ve afectada (la de este cambio aun no estaba
aplicada). Perdido, otras monedas y otros tipos de evento quedan como extensiones del mismo corte.

---

## Migración de los flujos de ManyChat a WEPLASH (sesión de octubre 2026)

### La identidad del bot es `automation`, no `bot`

`sender_type` admite `contact`, `agent`, `automation` y `system`. El bot escribe como
**`automation`** y sin usuario asociado: no es una persona. Se comprobó en la restricción de la base
antes de escribir el código; `bot` no existe.

### El interruptor de envío vive en la plataforma

`bot_integrations.sending_enabled`, apagado por defecto. El extremo de envío lo comprueba y rechaza
con 422. **No depende de que n8n se acuerde de no llamar**: si mañana alguien importa un flujo con el
nodo de envío activo, los mensajes no salen. Se enciende y se apaga con una fila.

### El envío se encola; la herramienta responde "aceptado", no "enviado"

`docs/TOOLS_CONTRACT.md` pide un `201` con `providerMessageId`. Ese identificador **no existe** cuando
la herramienta responde: lo produce Zernio, y quien entrega es el trabajador. Se mantiene la cola
—reintentos, idempotencia, tolerancia a caídas de Zernio— y la respuesta se documenta como aceptado.
Un mensaje que se reintenta solo vale más que un mensaje inmediato que se pierde.

### Idempotencia hacia Zernio con la clave del mensaje

El despachador ya envía `Idempotency-Key: messages.idempotency_key`. Zernio no reintenta y su envío
no es idempotente: sin esa cabecera, un reintento nuestro tras un fallo ambiguo entregaría el mensaje
**dos veces al cliente**.

### La multimedia se guarda como ruta, no como URL

La URL firmada caduca (10 minutos, según el contrato). Si se guardara al encolar, un reintento tardío
enviaría un enlace muerto y el cliente no vería la imagen, sin error visible. El trabajador **firma en
el momento de enviar**.

### El aviso al bot nace de un disparador de la base

La cola `bot_deliveries` se llena con un disparador sobre los mensajes entrantes. Un aviso encolado
desde el código se puede olvidar en algún camino nuevo; uno que nace del mensaje, no.

### El aviso no almacena el contenido del mensaje

`bot_deliveries` apunta al mensaje; el trabajador lo lee al entregar. Los datos del cliente no se
duplican por la base, igual que en las conversiones.

### La identidad de ManyChat no se puede reproducir

`subscriber_id` aparece **292 veces** en los flujos; `conversation_id`, dos. El bot no tiene el
identificador de ManyChat y no puede tenerlo. El nodo traductor de la puerta rellena `subscriber_id`
con el identificador de la conversación **como puente**, y lo marca (`identidad_manychat: false`) para
localizar dónde hay que sustituir las llamadas a ManyChat por nuestras herramientas.

### `customer` propio en lugar de ManyChat en los «campos personalizados»

Parte de los nodos migrados no enviaban mensajes: escribían campos del contacto. Tienen su propio
almacén (`contact_fields`) con **el mismo cuerpo que ManyChat**, para que migrarlos sea cambiar la
dirección y un nombre de campo, no reescribir cada nodo.

### Los precios son datos, no texto en el prompt

Hoy viven en un prompt de 273.547 caracteres y repetidos en seis nodos de código. `branch_services`
los saca a una tabla con importe y **unidad** por separado (`per_person` o `total`): sin esa
distinción el bot diría «$1.998 por persona» cuando son dos. Además, un prompt más corto es una
respuesta más rápida y más barata.

### Los servicios y la multimedia son por sede, y la sede sale del token

Ninguna ruta lleva `tenantId`: la credencial de máquina identifica el espacio. La sede se busca dentro
de ese espacio, así que un slug de otro negocio no existe. Comprobado con prueba.

### `advisorEmail` no es resoluble hoy

El contrato recibe el correo del asesor. Los correos del equipo viven solo en el sistema de
autenticación de Supabase, que no se consulta desde la API de datos: `memberships` no tiene esa
columna y no existe ninguna tabla que la sustituya. Se aceptan las dos formas (`userId` o
`advisorEmail`) cuando el dato exista; hoy `userId` es la única que se puede resolver.

### Las plantillas llevan huecos, y los rellena el servidor

Seis nodos envían «plantilla confirmación». `message_templates` guarda el texto con huecos (`{fecha}`,
`{sede}`) y **el servicio los rellena**, no el flujo. Una sustitución hecha en n8n que falle deja el
`{fecha}` a la vista del cliente, sin error y sin rastro; aquí, si falta un valor, la respuesta es 422
y **no se envía nada**.

### El contrato dice «uno de los dos», y se cumple

El envío exigía texto siempre. El contrato dice «`text`: uno de los dos» y «`media`: uno de los dos», y
la base acepta el cuerpo vacío (`body text not null default ''`; ya hay mensajes así, de clientes que
mandaron solo una foto). Ahora un archivo sin texto es válido. La clave de idempotencia **sigue siendo
obligatoria**: sin ella, un reintento le mandaría la foto dos veces al cliente.

### La multimedia de sede puede cambiar por canal

Los nodos están duplicados por canal y no por capricho: Instagram y TikTok piden formatos distintos.
`branch_media.channel` nace con `any`, así que nada cambia para lo que ya exista —la misma imagen sigue
sirviendo en cualquier sitio— y una distinta se añade con su canal sin tocar la común.

### Derivar apaga el bot, por la regla del dominio y con su versión

El propio texto de los nodos de transferencia dice «para que el asesor continúe». Si el bot sigue
contestando, la asesora y el bot le hablan al cliente a la vez. `turnBotOff` es verdadero por defecto,
el valor no se escribe a mano sino que sale de `handoffToHuman()` en el dominio, y la actualización sube
`automation_version` para que dos cambios simultáneos no se pisen en silencio.

### El listado de sedes solo devuelve las activas

El bot necesita la lista para poder ofrecer una: no puede fijar la sede con un slug que no conoce.
Ofrecer una sede cerrada sería peor que no ofrecer ninguna.

### Un solo doble de Supabase para las pruebas

Cada archivo de prueba se fabricaba el suyo, y tres fallaron por simplificar lo mismo: el constructor
real es **encadenable y esperable a la vez**. Ahora hay un único doble compartido que reproduce esa
naturaleza doble y anota las llamadas por tabla, así una prueba afirma sobre lo que se pidió sin
depender del orden de las consultas.

### La multimedia de sede se importa desde un enlace, y la ruta sale del hash

En vez de subir el archivo desde el navegador, el administrador pega una dirección pública y nosotros
lo copiamos. Reutiliza el mismo motor que ya trae los adjuntos de las conversaciones —con su defensa
contra direcciones internas y el tipo reconocido por bytes— en lugar de escribir uno nuevo.

La ruta se deriva de un **hash de la dirección**: la misma foto importada dos veces apunta al mismo
archivo, y la restricción única de la tabla impide registrarla dos veces. La idempotencia no se
programa: sale del esquema.

### Los precios del prompt viven en su sección 5

El prompt maestro tiene 2 333 líneas y dieciocho secciones. Los importes están en la **sección 5**
(líneas 519 a 837), más tres menciones sueltas: la 636 —la tabla de formato, dentro de la 5—, la 2159
—una respuesta de ejemplo con la cifra dentro— y la 2256. Saber dónde están convierte «sacar los
precios del prompt» de una intuición en una lista de sustituciones con número de línea.

### El prompt no puede consultar la base: los precios entran como variable

El prompt es el **mensaje de sistema** de un nodo de agente: un texto, no un programa. No puede llamar
a ninguna herramienta. Quien llama es el **flujo**, y mete el resultado en el prompt como variable
—igual que ya hace con el estado de la reserva.

Así que el trabajo son dos piezas: un nodo que consulte `GET /v1/tools/branches/{sede}/services` y dé
formato a la lista, y las sustituciones que usan esa variable. Solo las sustituciones no funcionarían:
el bot diría las llaves en crudo.

### El anticipo no es un precio: es un plazo

El anticipo de 500 aparece en la sección 2.6.3 y en las plantillas de pago, y describe **cuándo** hay
que pagar y qué pasa si no se paga. Eso es una regla de proceso, no una tarifa: **no sale del prompt**.
La tabla guarda lo que el bot cobra; el prompt explica cuándo cobrarlo.

### Los flujos de ManyChat eran transporte, no contenido

Los veintiocho nodos que lanzaban un flujo de ManyChat no esperaban un contenido que hubiera que
rescatar: ManyChat **no permite enviar un mensaje directo** por su API, y activar un flujo era la única
forma de mandar algo. Con nuestra plataforma sí se puede enviar directo, así que esos nodos se
**sustituyen**, no se migran. No hay nada que recuperar de ManyChat.

### Que la conversación ya exista no es un fallo: es una carrera

Dos mensajes seguidos del mismo cliente entran en paralelo y los dos intentan **abrir** la
conversación. La tabla tiene una clave única por `(tenant_id, channel_account_id, external_reference)`,
así que el segundo recibe un duplicado.

Tratarlo como fallo no era solo ruidoso: el evento quedaba marcado como fallido, el trabajador solo lee
eventos sin fallo, y por tanto **el mensaje del cliente se perdía sin que nadie lo viera**. En producción
pasó en siete de doscientos veinticinco mensajes entrantes.

La regla es que un duplicado al abrir una conversación significa que **otro proceso ya la abrió**, y el
hilo es el mismo: se adopta la que ganó. El camino de la automatización ya lo hacía así; faltaba en el
camino de entrada. Las dos usan ahora `createOrAdoptConversation`, para que la regla viva en un solo
sitio y no puedan divergir.

### Un mensaje largo se parte en dos en la puerta, no en cada flujo

El contrato de la tool admite 4000 caracteres, pero **el canal no**: Instagram corta alrededor de 1000.
El límite no es nuestro, y quien lo conoce es la plataforma, no el flujo.

Partirlo en el flujo habría significado duplicar nueve nodos y sus conexiones, y volver a repetir la
regla en cada flujo nuevo. Se parte en `POST /v1/tools/messages`, por el último **salto de párrafo** que
quepa —que es donde el texto ya separa sus dos partes— y, si no lo hay, por un salto de línea, un
espacio o el límite exacto.

Las dos partes **no pueden compartir clave de idempotencia**: la segunda chocaría con la primera y no
saldría nunca. Y como el contrato exige un **UUID**, no vale añadirle un sufijo: la segunda se deriva de
la original de forma determinista, para que un reintento produzca exactamente las mismas partes.

### Un identificador tiene un solo nombre, y es texto

El aviso que recibe el bot trae `conversationId` en camel, pero el traductor lo devolvía **solo** como
`conversation_id` y `subscriber_id`. Quien leyera el nombre original después del traductor recibía
`undefined`. Ahora el traductor devuelve **los tres**, para que ningún nodo dependa de cuál eligió otro.

Y ninguno debe envolverlo en `Number()`. Era un resto de ManyChat, donde el identificador era numérico;
el nuestro es un **UUID**, y `Number(uuid)` es `NaN`. Cuatro nodos de campos lo hacían, y otros seis
leían el nombre que no existía: **ninguno se había ejecutado nunca contra la API** —n8n no tenía
credencial— así que el fallo esperaba a la primera prueba con un cliente real.

### El traductor reconstruye el sobre de ManyChat, no una cadena

El traductor ponía el texto del cliente en `body` **como cadena**, porque el aviso llega anidado en
`message.body` y se supuso que Sara lo leía en la raíz. No es así: Sara lee el texto **dentro** de
`body`, con la forma que ManyChat le daba.

En ManyChat, `body` es un sobre: `body.id`, `body.last_input_text`, `body.custom_fields`,
`body.name`, `body.status`. Los doce nodos que tocan `body` lo tratan como **objeto**; ninguno como
texto. Con una cadena el aviso entra, el traductor funciona y el turno llega **vacío**: el extractor
devuelve `intencion=informacion` con todos los slots en nulo y el agente contesta un saludo genérico.
El bot parece funcionar y no ha leído nada, que es el fallo más caro posible porque no se ve. Pasó en
la primera prueba contra la plataforma: el cliente escribió «Test» y el bot saludó.

La regla es que el traductor **reconstruye el sobre completo**, no un campo suelto, y que el nodo sea
idempotente: lee primero de `weplash_evento`, así que ejecutarlo dos veces devuelve lo mismo.

Dos campos se dejan **sin traducir a propósito**. `status` se pasa tal cual (`open`) porque el valor
`active` de ManyChat habilita el seguimiento automático, que es un envío al cliente. `live_chat_url`
sigue vacío porque es un enlace de ManyChat que no tenemos. Traducir cualquiera de los dos sería
inventar una capacidad; el día que se quiera seguimiento, se decide y se implementa, no se hereda por
parecido de nombres.

Cómo se verifica: se ejecuta el código del traductor contra el aviso de ejemplo y su salida se
alimenta a la **expresión real** extraída de `Edit Fields6`, no a una copia. La misma prueba se corre
con `body` como cadena y **debe** dar vacío, para que la prueba no pueda pasar por casualidad.

### Una fecha nula no se convierte en cadena vacía

`Leer reserva confirmada del contacto` filtraba con `COALESCE(inicio, '') ~ '...'`. `inicio` es una
columna temporal, así que el literal vacío obligaba a Postgres a convertirlo a **fecha**, y esa
conversión falla en cuanto una fila tiene ambas fechas nulas:
`invalid input syntax for type timestamp: ""`.

El nodo tiene `onError: continueRegularOutput`, de modo que el error **no aparecía como error**: el
turno seguía, `confirmada` quedaba siempre en falso y el cierre determinista de reserva confirmada
nunca se disparaba. Un fallo silencioso en la ruta que decide si el cliente ya tiene cita.

La regla es no convertir nunca un literal vacío a un tipo temporal, y no volver a parsear a fecha un
texto que el propio SQL acaba de derivar. La consulta deja todo como texto: guarda los nulos de forma
explícita, compara contra `to_char(...)` del mismo formato y ordena por ese texto, que en
`YYYY-MM-DD HH:MM` ordena igual que el calendario. Tras el cambio la consulta no contiene **ninguna**
conversión a `timestamp`. Queda por confirmar en la base si las columnas son `timestamp` o
`timestamptz`: si fueran `timestamptz`, el cálculo de «4 horas» depende del huso de la sesión, que ya
era así antes de este cambio y conviene fijar aparte.

### La clave de idempotencia del bot se traduce en la puerta

El contrato de las tools pedía claves legibles —su ejemplo era `flujo-4.2-paso-7-<mensaje>`— pero la
implementación validaba la clave con el esquema de la interfaz, que exige un **UUID**. Así, ninguna de
las claves que escriben los flujos (`send-flow-<subscriber_id>`, `catalogo-<subscriber_id>`,
`foto-accesorios-<subscriber_id>`…) era aceptada: el envío respondía 422 y el bot no podía escribir.
La documentación describía una puerta que no existía.

Se corrigió **en la puerta**, no en cada flujo: `apps/api/src/tools/idempotency-key.ts` convierte la
clave opaca en un UUID determinista derivado de espacio, conversación y clave. Tres razones:

1. La columna `messages.idempotency_key` es de tipo `uuid`, así que algo tiene que generar el UUID; y
   generarlo en un nodo Code de n8n dejaría esa lógica fuera de los cuatro controles del repositorio.
2. El camino de la interfaz no cambia: sigue exigiendo un UUID.
3. Es determinista, de modo que un reintento de n8n (`retryOnFail`) produce el mismo UUID y sigue
   siendo idempotente. Un UUID ya válido se respeta tal cual, así que las claves que ya lo eran no
   cambian de valor. Una clave **vacía** no se convierte: se deja para que el esquema la rechace, en
   lugar de transformar un olvido en un mensaje enviado.

Además, esas claves eran **fijas por contacto**. Con una clave fija, el segundo mensaje distinto de la
misma conversación no se enviaba: la API responde 409 («la clave ya fue usada para otro mensaje»). El
bot podía decir **una** frase por cliente y ninguna más. Ahora cada nodo usa
`<propósito>-{{ $execution.id }}`, que identifica el turno, y la segunda parte de un texto largo sigue
recibiendo una clave derivada distinta para no chocar con la primera.

Cómo se verifica: pruebas unitarias de la traducción (misma clave → mismo UUID; otra conversación u
otro espacio → otro UUID; un UUID válido no se toca; una clave vacía tampoco) y la prueba del servicio
que comprueba que una clave legible llega al encolado convertida en UUID.

### El turno moría antes de enviar: la comprobación seguía siendo de ManyChat

El bot recibía, entendía y **no respondía**. No era el agente: eran tres costuras que seguían
hablando el idioma de ManyChat.

`Set AI Answers` —el nodo que guarda los campos del contacto— tenía `POST` a `/v1/tools/contact-fields`
**sin cuerpo**. Con el cuerpo vacío ese extremo responde `422 Hace falta contactId o conversationId`,
y como el nodo no maneja errores, la ejecución **terminaba ahí**, antes de `Enviar mensaje`. La respuesta
del agente se descartaba en un nodo de guardado.

`Enviar mensaje` tomaba la conversación de `$('Code in JavaScript').first().json.subscriber_id`, un campo
que **no existe** en ese punto: ese Code devuelve sólo `{ output: { data: [...] } }` porque su entrada
es un `Edit Fields` que sólo fija `output`. El envío iba con `conversationId` vacío. La regla es tomar
la conversación de un nodo que **siempre** corre —`Detectar imagen ManyChat2`, común a la ruta de
texto y a la de archivos— y no de la forma accidental de lo que venga delante.

Los dos nodos de verificación exigían `status: "success"` en la raíz, que era la forma de ManyChat.
Nuestra respuesta es `{ item: { id, status: "queued" }, tenantId }`. Como el mensaje se **encola**
antes de que el verificador hable, el resultado era lo peor de los dos mundos: el cliente recibía el
mensaje y la ejecución quedaba marcada como fallida, saltándose el registro de la última interacción y
el seguimiento. Lo mismo con `Informar resultado de transferencia`, que buscaba `status: "success"`
donde la asignación devuelve `assignedUserId`.

La regla general es que **cada costura se comprueba contra la respuesta real de la API que la sirve**,
y que un verificador no puede exigir la forma del sistema del que venimos. Cómo se verifica: contra
producción, con cuerpos deliberadamente inválidos para no encolar nada —`{}` en cada extremo devuelve
la 422 que nombra el campo que falta, y `GET /v1/tools/labels` devuelve 200, lo que demuestra que el
token tiene los tres alcances sin necesidad de enviar nada.

### La transferencia necesita una membresía real, y la tool vieja se retira

`POST /v1/tools/assignments` exige `userId`, y el contrato documentado decía `advisorEmail`: los tres
nodos de transferencia mandaban `{subscriber_id, flow_ns}`, un cuerpo de ManyChat que ese extremo no
entiende. La implementación es la que manda y se comprueba contra `memberships`, así que el documento
se corrigió a `userId` en lugar de añadir una búsqueda por correo: asignar a alguien que no pertenece
al espacio es justo lo que no debe permitirse, y una segunda vía de identificación solo añadiría
superficie.

El espacio tiene dos membresías, así que la derivación se fija en la de **supervisor**
(`hola@insidespa.com.mx`), que es quien atiende clientes; cambiarla es cambiar un UUID en tres nodos.
La decisión queda escrita aquí porque el flujo, por sí solo, no puede explicar por qué ese UUID.

`Foto_Deposito` se **elimina**: mandaba `{subscriber_id, flow_ns}` a `/v1/tools/messages` y su
descripción («activar esta tool para que el asesor continúe la conversación») invitaba al agente a
llamarla, así que era una trampa viva: el modelo podía romper el turno con un 422. Lo único que hacía
falta de ella —derivar a una persona— ya lo cubre `Transferir_al_asesor`. Si el negocio quiere que el
bot mande la foto del depósito, es otra herramienta y necesita el `branchMediaId` de esa imagen.

### Una prueba lee los flujos que se despliegan

Los flujos de `Flujos_v2/` son datos que se editan a mano y se pegan en n8n, y no pasaban por ningún
control. Eso dejó llegar dos defectos de la misma clase, y ninguno de los cuatro controles podía
verlos: la carpeta está excluida de `prettier` y no había pruebas sobre ella.

El primero lo introdujo este trabajo: los cuerpos de los ocho envíos de Sara quedaron con los saltos
de línea **estructurales** escritos como texto literal (`\n` en lugar de un salto), así que n8n no
habría podido interpretarlos —el nodo falla con «JSON parameter needs to be valid JSON»— y los ocho
envíos habrían muerto a la vez. Lo encontró una sonda de una sola ejecución, no una prueba. El
segundo llevaba más tiempo en 4.1: dos cuerpos con saltos **reales** dentro de una cadena, que es el
mismo error escrito al revés.

`apps/api/src/tools/flow-payloads.test.ts` recorre los flujos y exige que cada cuerpo dirigido a
nuestra API se pueda interpretar **como lo hace n8n**: en un cuerpo que es texto JSON con
interpolaciones, se sustituyen y se parsea; en un cuerpo que es una sola expresión que devuelve un
objeto, se normaliza el literal de JavaScript (claves sin comillas, comillas simples, referencias a
nodos). La prueba vive en `apps/api` porque el contrato que esos cuerpos tienen que cumplir es el de
estas tools.

El sustituto de una interpolación es un **número**, y es deliberado: el mismo cuerpo puede usar la
interpolación dentro de comillas (`"conversationId": "{{ … }}"`) o en el lugar de un valor
(`"field_value": {{ … }}`), y un número es JSON válido en los dos contextos. Una comprobación que
sólo cubriera el primero daría por bueno un cuerpo que n8n rechaza.

Cómo se verifica: se restauró el cuerpo roto de 4.1 y la prueba falló con el nombre del nodo y la
posición exacta (`Bad control character in string literal in JSON at position 79`); con el cuerpo
arreglado, pasa. Los tres números de la prueba (flujos encontrados, nodos de salida y cuerpos
revisados) están acotados: si la carpeta o el formato cambian, avisa en lugar de pasar en vacío.

### El texto del agente entra escapado, y la regla se fija por posición

La prueba anterior no podía ver este defecto, y por eso llegó a producción: sustituía **todas** las
interpolaciones por un número, así que validaba la forma del cuerpo pero nunca un contenido hostil. El
primer mensaje real con un salto de línea lo rompió —`Bad control character in string literal in JSON
at position 189`— y el bot se quedó mudo **antes** de mandar nada: n8n sustituye cada `{{ … }}` por el
valor tal cual, y el cuerpo es un JSON escrito a mano.

Con ManyChat el problema no existía porque el texto no viajaba en el cuerpo: se guardaba en campos
personalizados y el flujo los leía. Al migrar, el texto pasó a viajar en `text` y con él el defecto.

La regla se fija **por posición, no por valor**: en el contrato de estas tools, `text` es el único
miembro que lleva contenido arbitrario, así que todo lo que entra ahí se escapa con
`JSON.stringify(String(<valor> ?? '')).slice(1, -1)`; los identificadores (`conversationId`,
`idempotencyKey`) los genera nuestra plataforma, no pueden romper el JSON y se leen mejor tal cual. Se
descartó pasar el cuerpo entero a la forma de objeto (`={{ { … } }}`, que n8n evalúa sin parsear)
porque el mecanismo de texto con interpolaciones **ya estaba probado en producción** y no había forma
de verificar el otro sin desplegar; queda como simplificación pendiente, no como arreglo necesario.

El `String(… ?? '')` no es adorno: sin él, un valor numérico (`$execution.id`) sale de
`JSON.stringify` sin comillas y `.slice(1, -1)` le come los dígitos. Hay una prueba del patrón con
salto, comillas, barra invertida, vacío, `null` y número.

Cómo se verifica: la prueba exige el escape en los seis flujos y falla **nombrando el nodo y la
interpolación**; se deshizo el escape de un solo valor y falló, y al restaurarlo pasó. El primer turno
real entregado es del 7 de octubre a las 20:08, con estado `read`.

## Métricas de cierre y de tiempo de respuesta del asesor

### Quién atendió una conversación cerrada se mide por participación

Cerrar una conversación ya existía (`status = 'resolved'`) pero no decía **quién** la había cerrado, y
la métrica de «cerradas por el bot y por un asesor» necesitaba esa respuesta. Guardar «quién pulsó
cerrar» habría medido quién ordena la lista, no quién atendió al cliente; y como el bot todavía no
cierra conversaciones, ese dato nacería casi siempre vacío. Se atribuye por **participación**, que es
un hecho ya registrado (`messages.sender_type = 'agent'`): si ningún asesor escribió, la llevó el bot;
si alguno escribió, la atendió una persona.

Faltaba, eso sí, **cuándo** se cerró. Se contaban las cerradas con `status = 'resolved'`, que dice
cuántas están cerradas hoy y no cuántas se cerraron en el periodo: una conversación resuelta hace un
mes seguía sumando en la semana. Se añadió `conversations.resolved_at`, escrita en el mismo `update`
que cambia el estado y limpiada al reabrir. Al aplicar la migración no había ninguna resuelta (0 de
422), así que no hubo nada que rellenar.

El total (`closedConversations`) se conserva como la suma de las dos partes, y ese invariante se
prueba.

### El tiempo de respuesta mide la primera respuesta, y los límites viajan con el dato

Es el tiempo desde el mensaje del cliente hasta la **primera** respuesta de un asesor en el periodo.
Se mide la primera porque lo que se quiere saber es cuánto esperó el cliente; una segunda respuesta más
lenta no lo cambia. Lo que manda el bot no cuenta —no es espera de una persona— y una respuesta sin
mensaje previo del cliente tampoco: no hay espera que medir.

Sin ninguna respuesta de asesor, el periodo devuelve **`null`, no `0`**: un cero mentiría y además
pintaría de verde un periodo sin datos. Los umbrales (ámbar desde 5 minutos, rojo por encima de 10) son
política del negocio y **viajan en la respuesta** para que la interfaz no tenga su propia copia del
número: cambiarlos es cambiar un sitio. La pantalla construye las etiquetas («Entre 5 y 10 min») a
partir de esos límites, no de constantes escritas en el cliente.

Riesgo declarado: una respuesta de asesor que conteste a un mensaje de hace más de 24 horas queda
fuera de la medición, porque la lectura mira ese margen hacia atrás para poder emparejar la respuesta
con el mensaje que contesta. Es un borde, no un error de cálculo. El desglose por asesor queda para el
siguiente corte: necesita resolver nombres y no cabía aquí.

### El resumen se leía cortado en mil filas

Se descubrió **midiendo, no leyendo**: al calcular a mano lo que debía mostrar la tarjeta, una petición
de veinte mil filas devolvió exactamente mil. El servidor de datos corta cada respuesta en mil filas
aunque se pidan más, así que el resumen contaba mil mensajes y los presentaba como el total del
periodo, con `truncated` en falso: un número incompleto con aspecto de cifra exacta. El defecto venía
de antes y afectaba también a la métrica que ya existía.

Ahora se pide **por páginas** hasta el tope, y el aviso de «cifra mínima» dice la verdad. La
diferencia es real: en 30 días hay **2 728** mensajes que emparejar, no los 1 000 que se leían. El tope
sigue existiendo porque la agregación se hace en memoria; a más volumen, lo correcto será agregar en la
base de datos, y eso está declarado como el siguiente límite.

De la primera medición real sale un dato que conviene mirar: en 30 días hay **una** conversación medida
y la espera fue de **6 horas 2 minutos**, es decir roja. No es un error de cálculo: es el único caso del
periodo en el que un asesor respondió.

## El punto de la bandeja cuenta la espera, no la lectura

La bandeja marcaba con un punto naranja lo que nadie había abierto, y el encargo fue que ese punto
dijera además **cuánto lleva el cliente sin respuesta**. Se descartó colorear el mismo punto sin
cambiar su significado: al abrir una conversación sin contestar el punto desaparecía, así que el caso
más urgente —leído y sin responder— se escondía solo.

Ahora el punto aparece cuando el **último mensaje es del cliente**, su color dice la espera (`ok`,
`aviso`, `alto`) y se apaga cuando se responde. Lo no leído no se pierde: `needsAttention` se sigue
calculando igual y la bandeja lo enseña con la vista previa en negrita, que es el gesto habitual de las
bandejas de correo.

El nivel se calcula en la API, donde ya estaba el último mensaje: no hizo falta ni consulta nueva ni
tabla nueva. Y los umbrales, que habían quedado en el servicio de métricas, se movieron al dominio
(`ATTENTION_THRESHOLDS`): el panel de actividad y la bandeja dicen lo mismo porque leen la misma
política. La pantalla recibe el **nivel**, no los minutos, así que no puede quedarse con una copia
vieja del límite ni contradecir al panel.
