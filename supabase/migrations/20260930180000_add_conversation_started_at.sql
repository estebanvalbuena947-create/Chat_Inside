-- Inicio real de la conversacion, tal como lo informa el proveedor.

alter table public.conversations
  add column started_at timestamptz;

-- Relleno para lo que ya existe: el mensaje mas antiguo que tengamos de cada conversacion.
update public.conversations as conversacion
set started_at = (
  select min(mensaje.created_at)
  from public.messages as mensaje
  where mensaje.conversation_id = conversacion.id
);

create index conversations_tenant_started_at_idx
  on public.conversations (tenant_id, started_at desc);

comment on column public.conversations.started_at is
  'Inicio de la conversacion segun el proveedor. Se conserva el valor mas antiguo conocido.';
