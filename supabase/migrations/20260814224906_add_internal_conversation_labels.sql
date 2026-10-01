create table public.labels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  idempotency_key uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labels_name_length_check check (char_length(trim(name)) between 1 and 64),
  constraint labels_version_check check (version >= 1),
  constraint labels_tenant_id_id_key unique (tenant_id, id),
  constraint labels_tenant_idempotency_key_key unique (tenant_id, idempotency_key)
);

create unique index labels_tenant_normalized_name_key
  on public.labels (tenant_id, lower(trim(name)));
create index labels_tenant_updated_at_idx
  on public.labels (tenant_id, updated_at desc);

create table public.conversation_labels (
  tenant_id uuid not null,
  conversation_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, conversation_id, label_id),
  constraint conversation_labels_tenant_conversation_fkey
    foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id) on delete cascade,
  constraint conversation_labels_tenant_label_fkey
    foreign key (tenant_id, label_id)
    references public.labels (tenant_id, id) on delete cascade
);

create index conversation_labels_tenant_label_idx
  on public.conversation_labels (tenant_id, label_id);

alter table public.labels enable row level security;
alter table public.conversation_labels enable row level security;

revoke all on table public.labels, public.conversation_labels from anon, authenticated;

comment on table public.labels is
  'Biblioteca de etiquetas internas privada de cada tenant.';
comment on table public.conversation_labels is
  'Vincula etiquetas internas con conversaciones del mismo tenant.';
