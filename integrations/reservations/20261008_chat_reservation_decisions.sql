-- Aplicar UNA VEZ en el SQL Editor del proyecto SPA (ncutewymydclypuqlbfk).
-- Es aditiva y reversible: retirar el permiso EXECUTE deshabilita el comando del Inbox.
alter table public.dashboard_reservation_decisions
  add column if not exists idempotency_key uuid;

create unique index if not exists dashboard_reservation_decisions_idempotency_key_unique
  on public.dashboard_reservation_decisions (idempotency_key)
  where idempotency_key is not null;

create or replace function public.process_chat_reservation_decision(
  p_reservation_draft_id bigint,
  p_action text,
  p_note text,
  p_actor_email text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
  v_resulting text;
  v_new_state text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_existing public.dashboard_reservation_decisions%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Only the application service may decide reservations'; end if;
  if lower(btrim(coalesce(p_actor_email, ''))) = '' then raise exception 'Actor email is required'; end if;
  if p_action not in ('approved', 'rejected', 'needs_info') then raise exception 'Invalid action'; end if;

  select * into v_existing from public.dashboard_reservation_decisions
   where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('action', v_existing.action, 'decided_by_email', v_existing.decided_by_email,
      'duplicate', true, 'previous_status', v_existing.previous_status, 'resulting_status', v_existing.resulting_status);
  end if;

  select estado_reserva into v_previous from public.reservas_draft
   where id = p_reservation_draft_id for update;
  if not found then raise exception 'Reservation draft % does not exist', p_reservation_draft_id; end if;

  if p_action = 'approved' then v_new_state := 'confirmado'; v_resulting := 'confirmado';
  elsif p_action = 'rejected' then v_new_state := 'rechazado'; v_resulting := 'rechazado';
  else v_new_state := case when v_previous in ('requiere_revision', 'requiere_revision_pago') then v_previous else 'requiere_revision' end; v_resulting := 'requiere_revision';
  end if;

  update public.reservas_draft set estado_reserva = v_new_state,
    reserva_confirmada = case when p_action = 'approved' then true when p_action = 'rejected' then false else reserva_confirmada end,
    pago_recibido = case when p_action = 'approved' then true else pago_recibido end,
    fecha_pago = case when p_action = 'approved' then current_date::text else fecha_pago end,
    comprobante_revision_at = now(),
    comprobante_revision_datos = coalesce(comprobante_revision_datos, '{}'::jsonb) || jsonb_build_object(
      'decision_dashboard', p_action, 'decision_dashboard_at', now(), 'decision_dashboard_por', lower(btrim(p_actor_email)),
      'comprobante_estado', case p_action when 'approved' then 'aprobado' when 'rejected' then 'rechazado' else 'revision_manual' end,
      'decision_nota', v_note)
    where id = p_reservation_draft_id;
  update public.spa_comprobantes_pago set estado = case p_action when 'approved' then 'aprobado' when 'rejected' then 'rechazado' else 'revision' end,
    actualizado_at = now() where reserva_draft_id = p_reservation_draft_id;
  insert into public.dashboard_reservation_decisions
    (reservation_draft_id, action, note, previous_status, resulting_status, decided_by_email, idempotency_key)
  values (p_reservation_draft_id, p_action, v_note, v_previous, v_resulting, lower(btrim(p_actor_email)), p_idempotency_key);
  return jsonb_build_object('action', p_action, 'decided_by_email', lower(btrim(p_actor_email)),
    'duplicate', false, 'previous_status', v_previous, 'resulting_status', v_resulting);
end $$;

revoke all on function public.process_chat_reservation_decision(bigint, text, text, text, uuid) from public;
grant execute on function public.process_chat_reservation_decision(bigint, text, text, text, uuid) to service_role;
