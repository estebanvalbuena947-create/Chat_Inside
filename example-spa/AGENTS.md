# AGENTS.md — Spa

## Lectura obligatoria

Para reservas, disponibilidad, clientes, mensajería, medios o webhooks, leer:

- `PROJECT_MAP.md`
- `ARCHITECTURE.md`
- `specs/booking-via-messaging.md`
- los contratos y controles del kit general

## Reglas del dominio

- La disponibilidad solo puede decidirla el dominio de Agenda.
- Una cita no se confirma sin reservar el horario de forma atómica.
- El agente puede proponer horarios, pero no inventarlos ni confirmar por texto antes de la persistencia.
- Las etiquetas de conversación no representan el estado real de una cita.
- Los eventos de webhook se procesan de forma deduplicada.
- Los mensajes salientes usan una clave idempotente estable.
- Las imágenes y videos solo se envían desde el Catálogo de Medios aprobado.
- La UI y el agente no contienen URLs multimedia hardcodeadas por servicio.
- Toda fecha y hora se normaliza en `America/Bogota` y se persiste con zona inequívoca.
- Datos de salud o notas sensibles no se incluyen en logs ni prompts salvo necesidad explícita y autorización.

## Estados permitidos de una cita

`pending`, `confirmed`, `cancelled`, `completed`, `no_show`.

Transiciones fuera de la máquina de estados deben rechazarse en el dominio.

## Controles críticos

- Prueba de dos solicitudes concurrentes para el mismo profesional y horario.
- Repetición del mismo webhook no crea dos mensajes ni dos citas.
- Reintento del envío no entrega dos veces la respuesta.
- Un medio inactivo o no aprobado no puede enviarse.
- El agente escala cuando no puede verificar disponibilidad o intención.
