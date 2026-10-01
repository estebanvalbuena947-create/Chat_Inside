-- Separa las conversaciones de mensajes directos de las que solo tienen comentarios.
--
-- Se guarda en la conversacion para poder filtrar y paginar en la consulta, en lugar de
-- contar mensajes en cada lectura. El trabajador lo mantiene al guardar cada mensaje.

alter table public.conversations
  add column if not exists has_dm boolean not null default false,
  add column if not exists has_comment boolean not null default false;

update public.conversations as conversacion
set has_dm = exists (
      select 1 from public.messages as mensaje
      where mensaje.conversation_id = conversacion.id and mensaje.source = 'dm'
    ),
    has_comment = exists (
      select 1 from public.messages as mensaje
      where mensaje.conversation_id = conversacion.id and mensaje.source = 'comment'
    );

create index if not exists conversations_tenant_kind_idx
  on public.conversations (tenant_id, has_dm, has_comment, last_message_at desc);

comment on column public.conversations.has_dm is
  'La conversacion tiene al menos un mensaje directo. Se mantiene al guardar mensajes.';
comment on column public.conversations.has_comment is
  'La conversacion tiene al menos un comentario de publicacion. Se mantiene al guardar mensajes.';
