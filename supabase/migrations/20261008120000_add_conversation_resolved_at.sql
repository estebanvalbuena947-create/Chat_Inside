-- Fecha de cierre de la conversacion.
--
-- Se contaban las cerradas con `status = 'resolved'`, que dice cuantas estan cerradas HOY y no
-- cuantas se cerraron en los ultimos N dias: una conversacion resuelta hace un mes seguia sumando en
-- el periodo de esta semana. La fecha se escribe en el mismo `update` que ya cambia el estado, y se
-- limpia al reabrir, para que no quede una fecha de cierre en una conversacion abierta.
--
-- No hace falta rellenar nada: al aplicar esto no habia ninguna conversacion resuelta (0 de 422).

alter table public.conversations
  add column if not exists resolved_at timestamptz;

comment on column public.conversations.resolved_at is
  'Cuando la conversacion paso a resuelta. Nulo mientras no lo este.';

-- El resumen filtra por periodo sobre las resueltas: indice parcial, que solo cubre las cerradas.
create index if not exists conversations_tenant_resolved_at_idx
  on public.conversations (tenant_id, resolved_at)
  where status = 'resolved';

-- Reversa:
--   drop index if exists public.conversations_tenant_resolved_at_idx;
--   alter table public.conversations drop column if exists resolved_at;
