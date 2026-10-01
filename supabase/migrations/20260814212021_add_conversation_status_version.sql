alter table public.conversations
  add column status_version integer not null default 1,
  add constraint conversations_status_version_check check (status_version >= 1);

comment on column public.conversations.status_version is
  'Versión de concurrencia para cambios explícitos de estado de conversación.';
