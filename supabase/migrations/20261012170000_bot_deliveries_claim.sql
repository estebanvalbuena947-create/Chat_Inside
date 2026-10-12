-- La cola de avisos al bot aprende a reclamar, igual que la de salida.
--
-- Sintoma que lo destapo: un audio disparo DOS veces el webhook de n8n. La entrega del aviso tarda
-- segundos (lee los adjuntos, firma enlaces y espera a n8n), y la fila no se marcaba como enviada
-- hasta el final; con el bucle llamando cada cinco segundos sin esperar al anterior, un segundo ciclo
-- volvia a ver la misma fila como pendiente y la entregaba otra vez. En la base no se nota: los dos
-- ciclos leen `attempts = 0` y escriben `1`.
--
-- Con `processing_started_at` la fila sale de la cola en cuanto alguien la toma, asi que ni dos
-- ciclos solapados ni dos procesos pueden entregar el mismo aviso. Y si el proceso muere a mitad, el
-- reclamo abandonado se devuelve a la cola: la entrega es "al menos una vez", que es lo que ya era.

alter table public.bot_deliveries
  add column if not exists processing_started_at timestamptz;

alter table public.bot_deliveries
  drop constraint if exists bot_deliveries_status_check;

alter table public.bot_deliveries
  add constraint bot_deliveries_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped'));

comment on column public.bot_deliveries.processing_started_at is
  'Instante en que un ciclo tomo la fila. Mientras no sea nulo, ningun otro ciclo la entrega.';

-- La cola busca pendientes libres; el indice parcial ya existia para `pending` y ahora tambien sirve
-- para encontrar los reclamos abandonados.
create index if not exists bot_deliveries_processing_idx
  on public.bot_deliveries (processing_started_at)
  where status = 'processing';

-- Reversion: volver a la restriccion sin 'processing', quitar el indice y la columna. Las filas que
-- quedaran en 'processing' hay que devolverlas a 'pending' antes, o la restriccion no se puede crear.
