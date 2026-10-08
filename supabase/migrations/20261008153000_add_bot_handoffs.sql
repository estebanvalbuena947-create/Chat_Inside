-- Auditoría aditiva: una derivación del Bot no se infiere del estado actual de la conversación.
create table public.bot_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null,
  assigned_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint bot_handoffs_conversation_fkey foreign key (tenant_id, conversation_id)
    references public.conversations(tenant_id, id) on delete cascade,
  constraint bot_handoffs_assignee_fkey foreign key (tenant_id, assigned_user_id)
    references public.memberships(tenant_id, user_id) on delete restrict
);

create index bot_handoffs_tenant_created_at_idx on public.bot_handoffs(tenant_id, created_at desc);
create index bot_handoffs_tenant_assignee_created_at_idx on public.bot_handoffs(tenant_id, assigned_user_id, created_at desc);
alter table public.bot_handoffs enable row level security;
create policy "members read their tenant bot handoffs" on public.bot_handoffs for select
  using (exists (select 1 from public.memberships m where m.tenant_id = bot_handoffs.tenant_id and m.user_id = auth.uid()));
