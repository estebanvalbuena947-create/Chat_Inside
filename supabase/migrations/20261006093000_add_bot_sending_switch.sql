-- Interruptor de envio del bot.
--
-- Contexto: el bot ya puede LEER conversaciones y RECIBIR cada mensaje entrante, pero no debe
-- escribirle a nadie hasta que se habilite expresamente.
--
-- Ese limite no puede depender de que n8n se acuerde de no llamar: si manana alguien importa un flujo
-- con el nodo de envio activo, los mensajes saldrian. Por eso el interruptor vive aqui, en la
-- plataforma, y el extremo de envio lo comprueba antes de encolar nada.
--
-- Nace APAGADO. Encenderlo es una decision explicita y se puede revertir en el mismo sitio.
--
-- Aditivo e idempotente.

alter table public.bot_integrations
  add column if not exists sending_enabled boolean not null default false;

comment on column public.bot_integrations.sending_enabled is
  'Interruptor de envio del bot. Apagado: puede leer y recibir, pero no escribir al cliente.';

-- Reversion: quitar la columna. Ojo con dos cosas: si alguien habia ENCENDIDO el interruptor, ese
-- estado se pierde (la columna nace apagada, asi que volver a crearla deja el bot sin enviar). Y
-- mientras no exista, el extremo de envio no puede comprobar nada: fallara en vez de enviar, que
-- es el lado seguro, pero conviene saber por que.
--
--   alter table public.bot_integrations drop column if exists sending_enabled;
