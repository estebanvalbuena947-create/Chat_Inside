-- Avisos sin contenido. Un rollback tampoco publica la invalidación.
-- INVOKER: usa los permisos del escritor; no concede acceso al navegador.
create or replace function public.broadcast_inbox_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_tenant uuid;
begin
  if TG_OP = 'UPDATE' and NEW is not distinct from OLD then
    return NEW;
  end if;
  if TG_OP = 'DELETE' then
    affected_tenant := OLD.tenant_id;
  else
    affected_tenant := NEW.tenant_id;
  end if;
  perform realtime.send('{}'::jsonb, 'inbox.changed', 'inbox:' || affected_tenant::text, true);
  if TG_OP = 'UPDATE' and OLD.tenant_id is distinct from NEW.tenant_id then
    perform realtime.send('{}'::jsonb, 'inbox.changed', 'inbox:' || OLD.tenant_id::text, true);
  end if;
  return null;
end;
$$;

revoke all on function public.broadcast_inbox_change() from public, anon, authenticated;
grant execute on function public.broadcast_inbox_change() to service_role;

-- No se notifican las escrituras internas de colas ni los pulsos de presencia.
create trigger inbox_changed after insert or update or delete on public.messages
for each row execute function public.broadcast_inbox_change();
create trigger inbox_changed after insert or update or delete on public.conversations
for each row execute function public.broadcast_inbox_change();
create trigger inbox_changed after insert or update or delete on public.message_attachments
for each row execute function public.broadcast_inbox_change();
create trigger inbox_changed after insert or update or delete on public.conversation_reads
for each row execute function public.broadcast_inbox_change();
create trigger inbox_changed after insert or update or delete on public.contacts
for each row execute function public.broadcast_inbox_change();
create trigger inbox_changed after insert or update or delete on public.channel_accounts
for each row execute function public.broadcast_inbox_change();
create trigger inbox_changed after insert or update or delete on public.conversation_labels
for each row execute function public.broadcast_inbox_change();
