-- Base de datos inicial de Chat Zernio para el tenant Inside Spa.
-- No crea datos de clientes, canales ni integraciones externas.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint tenants_slug_format_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tenants_name_length_check check (char_length(trim(name)) between 1 and 120)
);

create table public.memberships (
  tenant_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  constraint memberships_tenant_id_fkey
    foreign key (tenant_id) references public.tenants (id) on delete cascade,
  constraint memberships_role_check check (role in ('admin', 'supervisor', 'agent'))
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  display_name text not null,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_display_name_length_check check (char_length(trim(display_name)) between 1 and 160),
  constraint contacts_tenant_id_id_key unique (tenant_id, id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_id uuid not null,
  assigned_user_id uuid,
  status text not null default 'open',
  automation_mode text not null default 'auto',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_tenant_contact_fkey
    foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete restrict,
  constraint conversations_tenant_assignee_fkey
    foreign key (tenant_id, assigned_user_id) references public.memberships (tenant_id, user_id) on delete set null,
  constraint conversations_status_check check (status in ('open', 'pending', 'resolved')),
  constraint conversations_automation_mode_check check (automation_mode in ('auto', 'suggest', 'paused')),
  constraint conversations_tenant_id_id_key unique (tenant_id, id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  sender_user_id uuid,
  direction text not null,
  sender_type text not null,
  body text not null default '',
  status text not null,
  idempotency_key uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_tenant_conversation_fkey
    foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  constraint messages_tenant_sender_fkey
    foreign key (tenant_id, sender_user_id) references public.memberships (tenant_id, user_id) on delete set null,
  constraint messages_direction_check check (direction in ('inbound', 'outbound')),
  constraint messages_sender_type_check check (sender_type in ('contact', 'agent', 'automation', 'system')),
  constraint messages_body_length_check check (char_length(body) <= 8000),
  constraint messages_status_check check (
    (direction = 'inbound' and status = 'received')
    or (direction = 'outbound' and status in ('draft', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed'))
  ),
  constraint messages_tenant_id_id_key unique (tenant_id, id)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  constraint webhook_events_provider_event_key unique (tenant_id, provider_event_id),
  constraint webhook_events_payload_object_check check (jsonb_typeof(payload) = 'object')
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  idempotency_key uuid not null,
  payload jsonb not null,
  state text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint outbox_events_state_check check (state in ('pending', 'processing', 'completed', 'failed')),
  constraint outbox_events_attempts_check check (attempts >= 0),
  constraint outbox_events_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint outbox_events_tenant_idempotency_key_key unique (tenant_id, idempotency_key)
);

create index contacts_tenant_created_at_idx on public.contacts (tenant_id, created_at desc);
create unique index contacts_tenant_external_reference_key
  on public.contacts (tenant_id, external_reference) where external_reference is not null;
create index conversations_tenant_status_last_message_idx
  on public.conversations (tenant_id, status, last_message_at desc nulls last);
create index messages_tenant_conversation_created_at_idx
  on public.messages (tenant_id, conversation_id, created_at);
create unique index messages_tenant_idempotency_key_key
  on public.messages (tenant_id, idempotency_key) where idempotency_key is not null;
create index webhook_events_unprocessed_idx
  on public.webhook_events (received_at) where processed_at is null and failed_at is null;
create index outbox_events_dispatch_idx
  on public.outbox_events (available_at) where state = 'pending';

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.webhook_events enable row level security;
alter table public.outbox_events enable row level security;

-- La Data API queda cerrada hasta implementar Auth y los casos de uso de la API propia.
revoke all on table public.tenants, public.memberships, public.contacts, public.conversations,
  public.messages, public.webhook_events, public.outbox_events from anon, authenticated;

comment on table public.tenants is 'Aislamiento principal para todos los recursos operativos.';
comment on table public.webhook_events is 'Inbox durable y deduplicado para eventos de proveedores.';
comment on table public.outbox_events is 'Outbox transaccional para efectos externos idempotentes.';
