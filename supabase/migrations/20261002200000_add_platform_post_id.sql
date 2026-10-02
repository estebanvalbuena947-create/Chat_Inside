-- Identificador de la publicacion de la que salio un comentario.
--
-- Los endpoints de Zernio exigen la publicacion en la ruta (/comments/{postId}/{commentId}/...), y
-- hasta ahora no la guardabamos: sin ella no se puede ocultar, responder ni eliminar.
--
-- Ojo con la ruta del dato: en el evento del webhook NO viene en post.id (llega vacio) sino en
-- platformPostId, tanto en el objeto post como en el comment. Se usa el primero y, si faltara, el
-- segundo.
--
-- Aditivo e idempotente, y rellena los comentarios anteriores desde el evento que los trajo.

alter table public.messages
  add column if not exists platform_post_id text;

comment on column public.messages.platform_post_id is
  'Publicacion de origen de un comentario. Obligatoria para moderarlo en la plataforma.';

update public.messages as m
set platform_post_id = evento.publicacion
from (
  select
    payload -> 'comment' ->> 'id' as comentario,
    coalesce(
      payload -> 'post' ->> 'platformPostId',
      payload -> 'comment' ->> 'platformPostId'
    ) as publicacion,
    row_number() over (partition by payload -> 'comment' ->> 'id' order by received_at desc) as orden
  from public.webhook_events
  where event_type = 'comment.received'
) as evento
where evento.orden = 1
  and evento.publicacion is not null
  and evento.comentario = split_part(m.provider_message_id, ':', 4)
  and m.source = 'comment'
  and m.platform_post_id is null;