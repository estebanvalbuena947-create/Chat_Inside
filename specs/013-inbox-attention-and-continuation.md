# Especificación: atención real y continuación de la bandeja

- **Estado:** aprobada para implementación
- **Responsable:** conversaciones
- **Fecha:** 2026-09-28
- **Cierre:** implementada el 2026-09-28 con la migración `20260928204706_add_conversation_reads`, aplicada y verificada en el proyecto remoto. El conteo de no leídos por conversación queda fuera de este corte, según la alternativa aplazada.

## Resultado

La bandeja muestra qué conversaciones requieren atención de la persona que está mirando, qué se dijo al final y cómo continuar la lista. Hoy la interfaz decide "no leída" con `status === 'open'` más un conjunto en memoria de la sesión, y la fila muestra una frase fija por estado; la lista además corta en 50 conversaciones sin continuación y busca solo en el nombre del contacto, sobre esa página ya cargada.

## Reglas

1. La marca de lectura pertenece a la combinación `(tenant, conversación, persona)`. Solo un miembro del tenant puede leerla o escribirla, y ninguna marca puede cruzar tenants.
2. La marca avanza de forma **monotónica**: un comando posterior con un instante anterior no la retrasa. Repetir el mismo comando devuelve la marca vigente sin efectos adicionales.
3. El servidor es la autoridad del alcance: la marca solicitada se acota al instante del mensaje más reciente de la conversación, de modo que un cliente no pueda silenciar mensajes que aún no existen.
4. Una conversación **requiere atención** para una persona cuando tiene al menos un mensaje **entrante** posterior a su marca. Los mensajes enviados por el equipo no generan atención, y una conversación sin marca previa requiere atención si tiene algún entrante.
5. La vista previa es el último mensaje de la conversación, sea entrante o saliente. Es un dato de lectura, no una columna denormalizada: no se persiste, para que no pueda divergir entre los tres caminos que escriben mensajes.
6. La lista se pagina por cursor sobre `(last_message_at desc, id desc)`, con tamaño acotado entre 1 y 100 y valor por defecto 50. `nextCursor` es nulo únicamente en la última página. Las conversaciones sin mensajes se ordenan al final y participan del cursor por su identificador.
7. La búsqueda se resuelve en servidor sobre el nombre visible y el usuario externo del contacto, sin distinguir mayúsculas ni acentos, con comodines escapados y longitud acotada. Una búsqueda vacía equivale a no filtrar.
8. El propietario de las reglas de marca y de atención es el dominio. La persistencia almacena la marca y aporta el modelo de lectura; la API coordina; la interfaz presenta. La interfaz deja de calcular atención.
9. La marca de lectura **no** modifica `conversations.updated_at`: vive en su propia tabla para no alterar el orden de la bandeja ni el cursor de tiempo real.
10. La interfaz sigue hablando solo con su BFF: no consulta Supabase ni Zernio.

## Contrato

- `GET /v1/tenants/:tenantId/conversations` acepta `limit`, `cursor`, `search`, además de `assignmentScope` y `labelId` ya existentes. Cada elemento agrega `needsAttention`, `lastMessagePreview` y `lastMessageDirection`; la respuesta agrega `nextCursor` con valor real.
- `POST /v1/tenants/:tenantId/conversations/:conversationId/read` con `{ upTo }` devuelve `{ item: { conversationId, lastReadAt } }`.
- Sin sesión: `401`. Sin membresía: `403`. Tenant o conversación inexistente: `404`. Entrada inválida, incluido un cursor mal formado: `400`. La conversación ya marcada más adelante no es un conflicto: es la misma marca.

## Datos, seguridad y rollback

- Migración aditiva: tabla `conversation_reads` con clave primaria `(conversation_id, user_id)`, claves foráneas compuestas hacia `conversations` y `memberships` por el mismo tenant, índice de consulta por `(tenant_id, user_id)`, RLS activa y privilegios revocados a `anon` y `authenticated`.
- La condición de avance se aplica como guarda de concurrencia en la escritura, no como una segunda copia de la regla: la decisión se calcula en el dominio y la escritura solo se aplica si la marca almacenada es anterior.
- Rollback de aplicación: la interfaz puede volver al indicador de sesión y la API ignorar los campos nuevos. La tabla es aditiva y no altera conversaciones, mensajes ni eventos existentes.
- Alternativa considerada y aplazada: una función SQL que devuelva página, vista previa y **conteo** de no leídos en una sola consulta. Se aplaza porque exige que el conteo viva en la base y porque el indicador booleano cubre la necesidad actual; el conteo puede agregarse después sin cambiar este contrato.
- Riesgo operativo de la migración: el repositorio no contiene cadena de conexión y el CLI de Supabase no está autenticado en este equipo, así que aplicar la migración requiere `supabase db push` con sesión autorizada o pegarla en el editor SQL del proyecto.

## Ampliación: el nivel de atención (2026-10-08)

La marca de lectura dice qué no se ha visto; **no** dice cuánto lleva el cliente esperando respuesta,
que es otra cosa y la que decide a quién atender primero. Cada elemento del listado agrega ahora
`attentionLevel`: `ok`, `aviso` o `alto`, y nulo cuando el último mensaje no es del cliente.

- El reloj es el del **último mensaje del cliente**, no el de la marca de lectura: abrir la
  conversación sin contestar no responde, y ése es justo el caso que hay que ver. El punto de la
  bandeja desaparece cuando se responde, no cuando se lee.
- `needsAttention` no cambia: sigue marcando lo no leído, y la bandeja lo muestra con la vista previa
  en negrita. El punto pasó a significar «sin respuesta».
- Los umbrales (ámbar desde 5 minutos, rojo por encima de 10) son **los mismos** del panel de actividad
  y viven en el dominio (`ATTENTION_THRESHOLDS`), en un solo sitio: cambiar la política es cambiar un
  valor, y la interfaz no tiene copia del número.
