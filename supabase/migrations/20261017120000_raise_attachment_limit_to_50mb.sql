-- El tope de un adjunto sale a 50 MB.
--
-- La regla del tamaño vive en el contrato (`maxOutboundMediaBytes`) y de ahí la toman el lector
-- multipart y la comprobación de la API. Aquí viven las dos copias que no pueden leer TypeScript: la
-- política del bucket privado y la restricción de la fila del adjunto.
--
-- Con 23 MB reales el límite de 25 MB se quedaba corto para un comprobante escaneado, y el rechazo
-- llegaba después de haber leído el archivo entero. Subir un tope no invalida nada de lo ya escrito:
-- es aditivo e idempotente, y se puede volver a ejecutar sin efecto.
--
-- Ojo: el tope del proxy (Traefik) no se toca aquí. Un archivo de decenas de megas necesita que el
-- entrypoint deje de cortar la petición a los 60 s; eso es configuración del servidor, no del
-- esquema.

update storage.buckets
set file_size_limit = 52428800
where id = 'conversation-media';

alter table public.message_attachments
  drop constraint if exists message_attachments_byte_size_check;

alter table public.message_attachments
  add constraint message_attachments_byte_size_check
  check (byte_size is null or byte_size between 1 and 52428800);

comment on constraint message_attachments_byte_size_check on public.message_attachments is
  'El mismo tope que el contrato y el bucket privado: 50 MB.';

-- Reversion: volver a 26214400 en los dos sitios. Los archivos de mas de 25 MB que ya esten escritos
-- NO se borran -- el tope solo impide escribir nuevos --, pero volver a ejecutar esta migracion con
-- el valor anterior fallaria si alguna fila ya declara un byte_size mayor; en ese caso hay que
-- limpiar esas filas o dejar el tope como esta.
--
--   update storage.buckets set file_size_limit = 26214400 where id = 'conversation-media';
--   alter table public.message_attachments
--     drop constraint if exists message_attachments_byte_size_check;
--   alter table public.message_attachments
--     add constraint message_attachments_byte_size_check
--     check (byte_size is null or byte_size between 1 and 26214400);
