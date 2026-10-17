-- El adjunto saliente desde el chat: donde vive cada archivo y cuando nace el evento de envio.
--
-- Dos cambios, los dos aditivos, y una razon cada uno:
--
--   1. `message_attachments.bucket`. Hasta hoy habia DOS caminos que firmaban contra un bucket
--      escrito a mano -- el trabajador al enviar y el historial al mostrar -- y con dos procedencias
--      eso deja de ser cierto en los dos sentidos: el archivo que manda el bot desde el catalogo de
--      una sede vive en `branch-media`, y el que sube quien atiende la conversacion, en
--      `conversation-media`. El dato dice donde esta el archivo; nadie lo adivina.
--
--   2. El disparador de encolado pasa a dispararse al insertar O al quedar en cola. Es lo que permite
--      escribir primero el mensaje y su adjunto y solo despues encolarlo: mientras el mensaje no este
--      `queued` no hay evento, asi que el trabajador no puede tomar un mensaje al que todavia le
--      falta el archivo. La funcion NO cambia: sigue creando el evento solo para un mensaje saliente
--      en cola, y su `on conflict do nothing` sigue evitando el duplicado cuando el mensaje nace ya
--      en cola, que es el camino sin adjunto y no cambia.
--
-- Aditivo e idempotente.

alter table public.message_attachments
  add column if not exists bucket text not null default 'conversation-media';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'message_attachments_bucket_length_check'
  ) then
    alter table public.message_attachments
      add constraint message_attachments_bucket_length_check
      check (char_length(bucket) between 1 and 64);
  end if;
end $$;

-- Relleno: las filas que ya existen y salieron del catalogo de una sede apuntan a `branch-media`.
-- Se filtra por la procedencia -- que ese camino escribe desde que existe, asi que ninguna fila suya
-- se queda sin declararla -- y no por la forma de la ruta: la ruta es opaca y adivinar el bucket por
-- su texto volveria a ser lo que esta columna viene a quitar. Se excluye lo que ya esta bien para que
-- volver a ejecutar la migracion no cambie nada.
update public.message_attachments
set bucket = 'branch-media'
where source_kind = 'branch_media'
  and bucket <> 'branch-media';

comment on column public.message_attachments.bucket is
  'Bucket privado donde vive la copia. Lo declara la fila porque hay dos procedencias: el catalogo administrado de una sede y la carga de quien atiende la conversacion.';

drop trigger if exists messages_enqueue_zernio_outbound_message on public.messages;

create trigger messages_enqueue_zernio_outbound_message
after insert or update of status on public.messages
for each row
execute function private.enqueue_zernio_outbound_message();

comment on function private.enqueue_zernio_outbound_message() is
  'Crea el evento outbox cuando un mensaje humano queda en cola -- al insertarlo o al actualizarlo --, en la misma transaccion.';

-- Reversion: devolver el disparador a su forma anterior (solo `after insert`) y quitar la
-- restriccion y la columna, en ese orden. Mientras la columna exista, los adjuntos ya escritos
-- conservan su bucket; al quitarla, el trabajador y el historial vuelven a firmar todo contra
-- `conversation-media`, asi que los archivos que viven en `branch-media` se quedan sin enlace.
--
--   drop trigger if exists messages_enqueue_zernio_outbound_message on public.messages;
--   create trigger messages_enqueue_zernio_outbound_message
--   after insert on public.messages
--   for each row
--   execute function private.enqueue_zernio_outbound_message();
--   alter table public.message_attachments
--     drop constraint if exists message_attachments_bucket_length_check;
--   alter table public.message_attachments drop column if exists bucket;
