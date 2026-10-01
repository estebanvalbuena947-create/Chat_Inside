-- Índices de soporte para claves foráneas y operaciones por tenant.
create index memberships_user_id_idx on public.memberships (user_id);
create index conversations_tenant_contact_id_idx on public.conversations (tenant_id, contact_id);
create index conversations_tenant_assigned_user_id_idx
  on public.conversations (tenant_id, assigned_user_id);
create index messages_tenant_sender_user_id_idx on public.messages (tenant_id, sender_user_id);
