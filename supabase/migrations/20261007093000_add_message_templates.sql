-- Plantillas de mensaje del espacio.
--
-- Contexto: seis de los nodos que hoy lanzan flujos de ManyChat se llaman "Enviar plantilla
-- confirmacion", y el contrato del repositorio (docs/TOOLS_CONTRACT.md) ya pide en el envio un
-- campo `templateName`: "plantilla guardada en nuestra base".
--
-- Traer esos textos a una tabla tiene el mismo efecto que traer los precios: cambiar una
-- confirmacion pasa a ser editar una fila, no abrir un flujo de doscientos nodos.
--
-- Los huecos del texto van entre llaves: {fecha}, {hora}, {sede}, {servicio}, {nombre}. Quien envia
-- rellena esos valores con los datos reales de la cita. La tabla guarda el texto, no el mensaje
-- final: asi el mismo texto sirve para cualquier cita.
--
-- El canal no es decorativo: las plantillas de confirmacion existen por separado para Instagram y
-- para TikTok porque el enlace y el tono cambian.
--
-- Aditivo e idempotente.

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  body text not null,
  channel text not null default 'any',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_body_check check (length(body) between 1 and 4000),
  constraint message_templates_channel_check
    check (channel in ('any', 'instagram', 'tiktok', 'facebook', 'whatsapp')),
  constraint message_templates_code_check check (code ~ '^[a-z0-9_]{2,60}$')
);

comment on table public.message_templates is
  'Textos que el bot manda tal cual. Cambiar una confirmacion es editar una fila, no un flujo.';
comment on column public.message_templates.body is
  'El texto con huecos entre llaves ({fecha}, {hora}, {sede}, {servicio}, {nombre}). Quien envia los rellena.';
comment on column public.message_templates.channel is
  'any, o el canal concreto cuando el texto cambia segun donde se mande.';

-- Una clave por espacio: los flujos piden 'confirmacion_ig', no un texto largo.
create unique index if not exists message_templates_tenant_code_idx
  on public.message_templates (tenant_id, code);

create index if not exists message_templates_tenant_active_idx
  on public.message_templates (tenant_id, channel)
  where is_active;

-- Reversion: la tabla es nueva y esta vacia hasta que se siembren las plantillas. Revertir es
-- quitarla; los textos siguen en los flujos de ManyChat mientras no se activen los nuevos.
--
--   drop table if exists public.message_templates;
