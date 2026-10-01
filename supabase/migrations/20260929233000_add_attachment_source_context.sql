-- Las publicaciones compartidas traen su medio y su texto: se guardan ambos.

alter table public.message_attachments
  add column source_title text,
  add column source_kind text;

alter table public.message_attachments
  add constraint message_attachments_source_title_length_check
    check (source_title is null or char_length(source_title) between 1 and 4000),
  add constraint message_attachments_source_kind_length_check
    check (source_kind is null or char_length(source_kind) between 1 and 64);

comment on column public.message_attachments.source_title is
  'Texto que acompanaba la publicacion compartida, tal como lo entrego el proveedor. Es el contexto que el equipo necesita para responder.';
comment on column public.message_attachments.source_kind is
  'Tipo original del proveedor, por ejemplo ig_post. Distingue una publicacion compartida de un archivo enviado.';
