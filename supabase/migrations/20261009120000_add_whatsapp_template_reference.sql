-- Referencia de la plantilla aprobada de Meta con la que salio un mensaje.
--
-- Se guarda el par nombre + idioma porque es lo que el proveedor resuelve antes de enviar: el texto
-- visible del mensaje es solo una copia para el historial y no sirve para reconstruir la referencia.
-- Aditiva y anulable: los mensajes de texto libre no llevan ninguna de las dos columnas.
alter table public.messages
  add column whatsapp_template_name text,
  add column whatsapp_template_language text,
  add constraint messages_whatsapp_template_reference_check
    check (
      (whatsapp_template_name is null) = (whatsapp_template_language is null)
      and (
        whatsapp_template_name is null
        or char_length(trim(whatsapp_template_name)) between 1 and 200
      )
      and (
        whatsapp_template_language is null
        or char_length(trim(whatsapp_template_language)) between 1 and 20
      )
    );

comment on column public.messages.whatsapp_template_name is
  'Nombre exacto de la plantilla aprobada de Meta; nulo cuando el mensaje es texto libre.';

comment on column public.messages.whatsapp_template_language is
  'Idioma exacto de la plantilla aprobada de Meta; nulo cuando el mensaje es texto libre.';
