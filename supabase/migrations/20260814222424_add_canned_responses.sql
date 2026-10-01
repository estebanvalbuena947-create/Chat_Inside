create table public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  body text not null,
  created_by_user_id uuid,
  idempotency_key uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canned_responses_tenant_creator_fkey
    foreign key (tenant_id, created_by_user_id)
    references public.memberships (tenant_id, user_id) on delete set null,
  constraint canned_responses_title_length_check
    check (char_length(trim(title)) between 1 and 80),
  constraint canned_responses_body_length_check
    check (char_length(trim(body)) between 1 and 8000),
  constraint canned_responses_version_check check (version >= 1),
  constraint canned_responses_tenant_id_id_key unique (tenant_id, id),
  constraint canned_responses_tenant_idempotency_key_key unique (tenant_id, idempotency_key)
);

create index canned_responses_tenant_updated_at_idx
  on public.canned_responses (tenant_id, updated_at desc);

alter table public.canned_responses enable row level security;

revoke all on table public.canned_responses from anon, authenticated;

comment on table public.canned_responses is
  'Biblioteca de respuestas rápidas privada de cada tenant.';
