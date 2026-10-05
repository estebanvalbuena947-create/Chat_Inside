-- Aviso al bot: configuracion por espacio y cola de avisos.
--
-- Ver plans/033 y specs/019 para el contexto de integraciones.
--
-- Diseño:
--   1. La configuracion es dato, no codigo: la direccion del webhook del bot se cambia sin desplegar
--      y nace DESACTIVADA, para que encenderla sea una decision explicita.
--   2. El aviso NO se guarda con el texto del mensaje: se guarda a que mensaje se refiere y el
--      trabajador lo reconstruye al entregar. Asi el contenido del cliente no se duplica en la base.
--   3. La cola se llena con un DISPARADOR sobre los mensajes entrantes. Es la parte que mas me
--      importa: un aviso que se encola desde el codigo se puede olvidar en algun camino nuevo; uno
--      que nace del mensaje, no. Cuando mañana se anada otro tipo de mensaje, el aviso sale solo.
--
-- Aditivo e idempotente.

create table if not exists public.bot_integrations (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  webhook_url text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_integrations_url_check check (webhook_url ~ '^https?://[^[:space:]]+$')
);

comment on table public.bot_integrations is
  'A donde se avisa al bot de cada mensaje entrante. Nace desactivada a proposito.';
comment on column public.bot_integrations.webhook_url is
  'Direccion del webhook de n8n que recibe el aviso.';

create table if not exists public.bot_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_deliveries_status_check
    check (status in ('pending', 'sent', 'failed', 'skipped'))
);

comment on table public.bot_deliveries is
  'Cola de avisos al bot. Apunta al mensaje; el contenido se lee al entregar, no se duplica aqui.';

-- Un mensaje se avisa una sola vez.
create unique index if not exists bot_deliveries_message_idx
  on public.bot_deliveries (message_id);

create index if not exists bot_deliveries_pending_idx
  on public.bot_deliveries (created_at)
  where status = 'pending';

-- El disparador que llena la cola.
create or replace function public.enqueue_bot_delivery() returns trigger
language plpgsql
as $$
begin
  if new.direction = 'inbound' then
    insert into public.bot_deliveries (tenant_id, message_id, conversation_id)
    values (new.tenant_id, new.id, new.conversation_id)
    on conflict (message_id) do nothing;
  end if;
  return new;
end;
$$;

comment on function public.enqueue_bot_delivery() is
  'Encola un aviso por cada mensaje entrante, sin que ningun camino del codigo tenga que acordarse.';

drop trigger if exists messages_enqueue_bot_delivery on public.messages;

create trigger messages_enqueue_bot_delivery
  after insert on public.messages
  for each row
  execute function public.enqueue_bot_delivery();
