create table public.conversation_reads (
  tenant_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_reads_tenant_conversation_fkey
    foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id) on delete cascade,
  constraint conversation_reads_tenant_user_fkey
    foreign key (tenant_id, user_id)
    references public.memberships (tenant_id, user_id) on delete cascade
);

create index conversation_reads_tenant_user_idx
  on public.conversation_reads (tenant_id, user_id);

alter table public.conversation_reads enable row level security;
revoke all on table public.conversation_reads from anon, authenticated;

comment on table public.conversation_reads is
  'Marca de lectura por persona y conversacion. Avanza de forma monotona; una conversacion requiere atencion cuando tiene mensajes entrantes posteriores a esta marca.';
