-- CAPI de Meta: integracion por espacio y cola de eventos de conversion.
--
-- Ver specs/019-zernio-meta-conversions-api.md y plans/033-capi-meta-ads-recoleccion.md.
--
-- Dos ideas:
--   1. La integracion es CONFIGURACION, no codigo: la cuenta de anuncios, el pixel, si se envian
--      datos de contacto y el codigo de prueba se cambian sin desplegar.
--   2. El evento se guarda una sola vez, con su event_id estable: es la clave con la que Meta
--      deduplica. Un reintento reutiliza el mismo identificador, asi que no puede contar doble.
--
-- Aditivo e idempotente.

create table if not exists public.conversion_integrations (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  provider text not null default 'metaads',
  provider_account_id text not null,
  destination_id text not null,
  enabled boolean not null default false,
  -- Si se envian correo o telefono del cliente. Apagarlo es un cambio de configuracion, no de
  -- codigo: la identidad se seguira enviando con el identificador de plataforma.
  include_contact_data boolean not null default false,
  -- GRANTED o DENIED: Meta aplica Limited Data Use a todo el lote cuando va DENIED.
  consent_ad_user_data text,
  test_code text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversion_integrations_provider_check check (provider in ('metaads')),
  constraint conversion_integrations_account_check check (provider_account_id <> ''),
  constraint conversion_integrations_destination_check check (destination_id <> ''),
  constraint conversion_integrations_consent_check
    check (consent_ad_user_data is null or consent_ad_user_data in ('GRANTED', 'DENIED'))
);

comment on table public.conversion_integrations is
  'Configuracion de envio de conversiones a Meta por espacio.';
comment on column public.conversion_integrations.include_contact_data is
  'Enviar correo o telefono del cliente. Se apaga desde la configuracion, sin desplegar.';
comment on column public.conversion_integrations.test_code is
  'Codigo de prueba de Meta: envia a Test Events sin ensuciar los datos reales.';

create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  event_name text not null,
  event_id text not null,
  event_time timestamptz not null,
  value_amount numeric(12, 2),
  currency text,
  action_source text not null default 'crm',
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  trace_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversion_events_name_check check (length(btrim(event_name)) > 0),
  constraint conversion_events_id_check check (event_id <> ''),
  constraint conversion_events_status_check
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  constraint conversion_events_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint conversion_events_value_check check (value_amount is null or value_amount >= 0)
);

comment on table public.conversion_events is
  'Cola de conversiones hacia Meta. Una fila por hecho de negocio, con su event_id estable.';
comment on column public.conversion_events.event_id is
  'Clave de deduplicacion: el mismo valor en pixel y servidor evita contar dos veces.';
comment on column public.conversion_events.trace_id is
  'fbtrace_id de Meta, para reclamar a soporte.';
comment on column public.conversion_events.status is
  'pending, sent, failed o skipped. Un reintento reutiliza el mismo event_id.';

-- El mismo hecho no puede encolarse dos veces.
create unique index if not exists conversion_events_event_id_idx
  on public.conversion_events (tenant_id, event_id);

create index if not exists conversion_events_pending_idx
  on public.conversion_events (created_at)
  where status = 'pending';

-- Nota de diseno: a proposito NO se limita event_name. El camino de pixel acepta nombres libres,
-- mientras que el de mensajeria de WhatsApp solo admite una lista corta. Esa regla vive en el
-- servicio, que conoce por que camino va cada evento, y no en la base, que no lo sabe.
