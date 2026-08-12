# Prompt de diseño para Codex — Reserva del spa

Lee `AGENTS.md`, `PROJECT_MAP.md`, `ARCHITECTURE.md` y `specs/booking-via-messaging.md`. No escribas código todavía.

Necesitamos implementar la reserva de citas iniciada desde una conversación recibida por Zernio y procesada por un agente ya existente.

Analiza el repositorio y entrega:

1. dónde debe vivir la regla de disponibilidad;
2. cómo impedir doble reserva ante concurrencia;
3. contrato de las herramientas que puede invocar el agente;
4. cambios de datos y estrategia de migración;
5. deduplicación del webhook e idempotencia de la respuesta;
6. máquina de estados de la cita;
7. cortes de implementación pequeños;
8. pruebas antiatajo, incluyendo dos confirmaciones simultáneas;
9. riesgos y rollback.

Está prohibido resolver la disponibilidad deshabilitando únicamente botones, guardando el horario en memoria o agregando condiciones por nombre de servicio.
