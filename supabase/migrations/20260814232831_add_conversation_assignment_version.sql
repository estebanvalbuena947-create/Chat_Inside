alter table public.conversations
  add column assignment_version integer not null default 1,
  add constraint conversations_assignment_version_check check (assignment_version >= 1);

comment on column public.conversations.assignment_version is
  'VersiÃ³n de concurrencia para asignaciones internas de conversaciones.';
