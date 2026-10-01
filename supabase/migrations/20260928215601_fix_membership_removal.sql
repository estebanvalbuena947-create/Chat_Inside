-- Retirar a un integrante no puede fallar ni destruir lo que hizo.

-- Las referencias compuestas a la pertenencia usaban `set null` sobre el par completo, lo que
-- intentaria anular `tenant_id`, que es obligatorio. Cada referencia libera ahora solo la
-- columna de la persona. Las notas dejan de bloquear el retiro: sobreviven con autoria vacia.
alter table public.conversations
  drop constraint conversations_tenant_assignee_fkey;
alter table public.conversations
  add constraint conversations_tenant_assignee_fkey
    foreign key (tenant_id, assigned_user_id)
    references public.memberships (tenant_id, user_id)
    on delete set null (assigned_user_id);

alter table public.messages
  drop constraint messages_tenant_sender_fkey;
alter table public.messages
  add constraint messages_tenant_sender_fkey
    foreign key (tenant_id, sender_user_id)
    references public.memberships (tenant_id, user_id)
    on delete set null (sender_user_id);

alter table public.canned_responses
  drop constraint canned_responses_tenant_creator_fkey;
alter table public.canned_responses
  add constraint canned_responses_tenant_creator_fkey
    foreign key (tenant_id, created_by_user_id)
    references public.memberships (tenant_id, user_id)
    on delete set null (created_by_user_id);

alter table public.conversation_notes
  alter column created_by_user_id drop not null;
alter table public.conversation_notes
  drop constraint conversation_notes_tenant_creator_fkey;
alter table public.conversation_notes
  add constraint conversation_notes_tenant_creator_fkey
    foreign key (tenant_id, created_by_user_id)
    references public.memberships (tenant_id, user_id)
    on delete set null (created_by_user_id);
