-- Origen del mensaje: un mensaje directo o un comentario de una publicacion.

alter table public.messages
  add column source text not null default 'dm';

alter table public.messages
  add constraint messages_source_check check (source in ('dm', 'comment'));

comment on column public.messages.source is
  'Origen del mensaje: dm para un mensaje directo, comment para un comentario de publicacion.';
