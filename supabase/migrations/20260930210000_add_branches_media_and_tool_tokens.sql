-- Sedes, multimedia por sede y credenciales de máquina para las tools.
--
-- Todo lo que hay aquí pertenece al lado del canal y de la interfaz: las conversaciones, su sede
-- y el material que el bot comparte. La lógica del negocio (disponibilidad, reservas, pagos,
-- catálogo) vive en su propia base y no se toca.
--
-- Es idempotente a propósito: se puede volver a ejecutar sin romper nada.

-- 1) Sedes ------------------------------------------------------------------------------------

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  slug text not null,
  external_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_name_length_check check (char_length(name) between 1 and 80),
  constraint branches_slug_format_check check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  constraint branches_tenant_slug_key unique (tenant_id, slug)
);

create index if not exists branches_tenant_active_idx
  on public.branches (tenant_id, is_active, name);

comment on table public.branches is
  'Sedes del espacio (Juarez, Polanco, Lomas...). El slug es el que usan las tools.';
comment on column public.branches.external_reference is
  'Referencia en el sistema de reservas, si existe. No se interpreta aqui.';

-- 2) Multimedia por sede ----------------------------------------------------------------------

create table if not exists public.branch_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  kind text not null,
  storage_object_path text not null,
  title text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint branch_media_kind_check check (kind in ('image', 'video')),
  constraint branch_media_path_length_check check (char_length(storage_object_path) between 1 and 512),
  constraint branch_media_branch_path_key unique (branch_id, storage_object_path)
);

create index if not exists branch_media_branch_order_idx
  on public.branch_media (tenant_id, branch_id, sort_order);

comment on table public.branch_media is
  'Material de cada sede que el bot comparte y la interfaz administra. Se sirve con URLs firmadas.';

-- 3) Credenciales de maquina para las tools ---------------------------------------------------

create table if not exists public.tool_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  token_hash text not null,
  scopes text[] not null default array['messages', 'media', 'assignments', 'conversations'],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tool_tokens_name_length_check check (char_length(name) between 1 and 80),
  constraint tool_tokens_hash_key unique (token_hash)
);

create index if not exists tool_tokens_tenant_active_idx
  on public.tool_tokens (tenant_id) where revoked_at is null;

comment on table public.tool_tokens is
  'Credencial de maquina que usan las tools (n8n) para llamar a la API. Nunca es una sesion de persona.';
comment on column public.tool_tokens.token_hash is
  'Solo se guarda el hash del token; el valor en claro se muestra una vez al crearlo.';

-- 4) La sede de la conversacion ---------------------------------------------------------------

alter table public.conversations
  add column if not exists branch_id uuid references public.branches (id) on delete set null;

create index if not exists conversations_tenant_branch_idx
  on public.conversations (tenant_id, branch_id, last_message_at desc);

comment on column public.conversations.branch_id is
  'Sede de la conversacion. Es un dato del negocio: la interfaz filtra por el y el bot lo usa.';

-- El acceso es exclusivamente desde la API con la clave de servicio; la interfaz nunca habla
-- con la base directamente.

-- Reversion: las cuatro piezas van en orden inverso al de creacion, porque tres dependen de
-- public.branches. Quitar la tabla antes que la columna que la referencia falla.
--
--   alter table public.conversations drop column if exists branch_id;   -- depende de branches
--   drop table if exists public.branch_media;                          -- depende de branches
--   drop table if exists public.tool_tokens;
--   drop table if exists public.branches;                              -- al final, sin dependencias
--
-- Que se pierde: la sede de cada conversacion (vuelve a nulo), el material de sede y las
-- credenciales de maquina. Los archivos del almacen NO se borran: quedan huerfanos en el bucket
-- branch-media y hay que vaciarlos aparte. Al desaparecer los tool_tokens, n8n recibe 401 hasta
-- que se cree otro.
