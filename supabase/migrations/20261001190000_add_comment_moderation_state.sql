-- Moderacion de comentarios: estado real en la plataforma y rastro de cada accion.
--
-- Ver specs/020-acciones-sobre-comentarios.md.
--
-- Dos ideas que sostiene este esquema:
--   1. La conversacion nunca miente: comment_state refleja lo que confirmo la plataforma.
--   2. El texto original no se pierde nunca, aunque se edite o se elimine en la plataforma.
--
-- El propio texto del mensaje guarda lo que se muestra; comment_original_body conserva lo que llego
-- la primera vez, para poder responder a la pregunta "que decia ese comentario".
--
-- Todo aditivo e idempotente.

alter table public.messages
  add column if not exists comment_state text,
  add column if not exists comment_original_body text,
  add column if not exists comment_edited_at timestamptz,
  add column if not exists comment_private_reply_at timestamptz,
  add column if not exists comment_reply_by text,
  add column if not exists comment_moderated_by_user_id uuid,
  add column if not exists comment_moderated_at timestamptz;

comment on column public.messages.comment_state is
  'Estado del comentario en la plataforma: visible, hidden o deleted. Nulo si no es un comentario.';
comment on column public.messages.comment_original_body is
  'Texto tal como llego, antes de cualquier edicion. No se sobrescribe nunca.';
comment on column public.messages.comment_private_reply_at is
  'Cuando se envio la respuesta privada. La plataforma solo permite una por comentario.';
comment on column public.messages.comment_reply_by is
  'Quien publico la respuesta al comentario: persona o bot. Sirve para contar las automaticas.';
comment on column public.messages.comment_moderated_by_user_id is
  'Quien hizo la ultima accion de moderacion.';

alter table public.messages drop constraint if exists messages_comment_state_check;
alter table public.messages add constraint messages_comment_state_check
  check (comment_state is null or comment_state in ('visible', 'hidden', 'deleted'));

alter table public.messages drop constraint if exists messages_comment_reply_by_check;
alter table public.messages add constraint messages_comment_reply_by_check
  check (comment_reply_by is null or comment_reply_by in ('persona', 'bot'));

-- La respuesta privada es de un solo uso: si hay fecha, ya se gasto. Sin fecha, disponible.
alter table public.messages drop constraint if exists messages_comment_private_reply_check;
alter table public.messages add constraint messages_comment_private_reply_check
  check (comment_private_reply_at is null or comment_state is distinct from 'deleted');

-- Tope del hilo: contar rapido cuantas respuestas automaticas lleva una conversacion.
create index if not exists messages_comment_auto_replies_idx
  on public.messages (conversation_id)
  where comment_reply_by = 'bot';
