-- CAPI de Meta Ads, fase 1: recoger lo que Meta exige para aceptar una conversion.
--
-- Dos partes:
--   1. El referral que Zernio YA nos envia y hoy descartamos (de que anuncio vino el cliente).
--   2. El hecho de negocio: conversacion GANADA, con el valor total del servicio.
--
-- "Ganado" es un estado del negocio, en paralelo al estado operativo (abierta/pendiente/resuelta):
-- una conversacion puede estar resuelta y ganada a la vez. Lo marca una persona desde el boton o el
-- bot cuando detecta el pago; ambas puertas escriben el mismo hecho.
--
-- Todo aditivo e idempotente.

-- 1) Atribucion: de que anuncio o publicacion vino la conversacion ---------------------------------

alter table public.conversations
  add column if not exists referral jsonb,
  add column if not exists ctwa_clid text,
  add column if not exists ad_id text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists referral_captured_at timestamptz;

comment on column public.conversations.referral is
  'Bloque referral tal como llego del proveedor, para auditoria.';
comment on column public.conversations.ctwa_clid is
  'Identificador de clic a WhatsApp. Solo existe en anuncios CTWA; puede quedar nulo.';
comment on column public.conversations.ad_id is
  'Anuncio de origen, informado por el proveedor.';

create index if not exists conversations_tenant_ad_idx
  on public.conversations (tenant_id, ad_id)
  where ad_id is not null;

alter table public.contacts
  add column if not exists platform_user_id text;

comment on column public.contacts.platform_user_id is
  'Identificador del contacto en su plataforma (por ejemplo el de la pagina).';

-- 2) Hecho de negocio: conversacion ganada con el valor total --------------------------------------

alter table public.conversations
  add column if not exists outcome text,
  add column if not exists outcome_amount numeric(12, 2),
  add column if not exists outcome_currency text default 'MXN',
  add column if not exists outcome_set_by text,
  add column if not exists outcome_set_by_user_id uuid,
  add column if not exists outcome_set_at timestamptz,
  add column if not exists outcome_source_reference text;

comment on column public.conversations.outcome is
  'Resultado del negocio. Hoy solo ganado; nulo significa sin cerrar.';
comment on column public.conversations.outcome_amount is
  'Valor total del servicio, no el deposito.';
comment on column public.conversations.outcome_set_by is
  'Quien registro el hecho: persona o bot.';
comment on column public.conversations.outcome_source_reference is
  'Referencia del origen (por ejemplo el pago). Sirve para que el bot no duplique el hecho.';

alter table public.conversations drop constraint if exists conversations_outcome_check;
alter table public.conversations add constraint conversations_outcome_check
  check (outcome is null or outcome in ('ganado'));

alter table public.conversations drop constraint if exists conversations_outcome_amount_check;
alter table public.conversations add constraint conversations_outcome_amount_check
  check (outcome_amount is null or outcome_amount >= 0);

alter table public.conversations drop constraint if exists conversations_outcome_currency_check;
alter table public.conversations add constraint conversations_outcome_currency_check
  check (outcome_currency is null or outcome_currency ~ '^[A-Z]{3}$');

alter table public.conversations drop constraint if exists conversations_outcome_set_by_check;
alter table public.conversations add constraint conversations_outcome_set_by_check
  check (outcome_set_by is null or outcome_set_by in ('persona', 'bot'));

-- Invariante: un negocio ganado SIEMPRE trae valor, origen y fecha. Si no, no es un hecho valido.
alter table public.conversations drop constraint if exists conversations_outcome_completeness_check;
alter table public.conversations add constraint conversations_outcome_completeness_check
  check (
    outcome is null
    or (
      outcome_amount is not null
      and outcome_set_by is not null
      and outcome_set_at is not null
    )
  );

-- Idempotencia del bot: la misma referencia de pago no puede registrar el hecho dos veces.
create unique index if not exists conversations_outcome_reference_idx
  on public.conversations (tenant_id, outcome_source_reference)
  where outcome_source_reference is not null;

-- 3) Quien aplico cada etiqueta ---------------------------------------------------------------

alter table public.conversation_labels
  add column if not exists created_by_user_id uuid;

comment on column public.conversation_labels.created_by_user_id is
  'Quien aplico la etiqueta a la conversacion.';