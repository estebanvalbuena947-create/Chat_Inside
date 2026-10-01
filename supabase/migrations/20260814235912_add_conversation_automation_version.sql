alter table public.conversations
  add column automation_version integer not null default 1,
  add constraint conversations_automation_version_check check (automation_version >= 1);

comment on column public.conversations.automation_version is
  'Version de concurrencia para activar o pausar el bot por conversacion.';
