-- Historial local y outbox atómico para mensajes de texto salientes.
-- La función no es expuesta por la Data API: solo se ejecuta mediante el trigger.

drop index if exists public.messages_tenant_idempotency_key_key;

alter table public.messages
  add constraint messages_tenant_idempotency_key_key unique (tenant_id, idempotency_key);

alter table public.outbox_events
  add column processing_started_at timestamptz,
  add column failure_code text;

create index outbox_events_pending_claim_idx
  on public.outbox_events (available_at)
  where state = 'pending' and processing_started_at is null;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.enqueue_zernio_outbound_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.direction = 'outbound' and new.status = 'queued' and new.idempotency_key is not null then
    insert into public.outbox_events (
      tenant_id,
      aggregate_type,
      aggregate_id,
      event_type,
      idempotency_key,
      payload
    )
    values (
      new.tenant_id,
      'message',
      new.id,
      'zernio.message.dispatch',
      new.idempotency_key,
      jsonb_build_object('messageId', new.id)
    )
    on conflict (tenant_id, idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.enqueue_zernio_outbound_message()
  from public, anon, authenticated, service_role;

create trigger messages_enqueue_zernio_outbound_message
after insert on public.messages
for each row
execute function private.enqueue_zernio_outbound_message();

comment on function private.enqueue_zernio_outbound_message() is
  'Crea el evento outbox de un mensaje humano queued en la misma transacción.';
