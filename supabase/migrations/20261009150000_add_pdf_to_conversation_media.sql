-- Los comprobantes de pago llegan muchas veces en PDF, y el bucket de la copia propia no lo
-- admitia: la descarga se completaba y la escritura se rechazaba, asi que la validacion del pago se
-- quedaba sin su prueba. Se anade el tipo sin tocar el resto de la lista.
--
-- Es idempotente: se puede volver a ejecutar sin romper nada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'conversation-media',
  'conversation-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/ogg',
    'application/pdf'
  ]
)
on conflict (id) do update
set allowed_mime_types = excluded.allowed_mime_types;

-- Reversion: repetir el mismo insert sin 'application/pdf' en la lista. Los archivos ya copiados no
-- se borran; dejan de poder escribirse PDF nuevos.
