create table public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  created_by_user_id uuid not null,
  body text not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint conversation_notes_tenant_conversation_fkey
    foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id) on delete cascade,
  constraint conversation_notes_tenant_creator_fkey
    foreign key (tenant_id, created_by_user_id)
    references public.memberships (tenant_id, user_id) on delete restrict,
  constraint conversation_notes_body_length_check
    check (char_length(trim(body)) between 1 and 2000),
  constraint conversation_notes_tenant_idempotency_key_key
    unique (tenant_id, idempotency_key)
);

create index conversation_notes_tenant_conversation_created_at_idx
  on public.conversation_notes (tenant_id, conversation_id, created_at desc);

alter table public.conversation_notes enable row level security;
revoke all on table public.conversation_notes from anon, authenticated;

comment on table public.conversation_notes is
  'Notas internas acumulativas para una conversacion; no se envian a proveedores.';
