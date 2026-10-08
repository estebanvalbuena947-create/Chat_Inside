# Especificación: gestión de reservas en Inbox

- **Estado:** implementándose
- **Responsable:** `apps/api/src/reservations`; la UI solo presenta el comando.

## Regla

Un administrador o supervisor del tenant puede aprobar, rechazar o pedir información sobre una
pre-reserva. La transición, actualización del comprobante e histórico se aplican juntos en el
proyecto SPA; repetir el mismo comando no puede volver a aplicarla.

## Contrato y seguridad

- `POST /v1/tenants/:tenantId/reservations/drafts/:draftId/decision` recibe acción, nota opcional y
  una UUID de idempotencia.
- El navegador usa exclusivamente el BFF; no recibe una clave del proyecto SPA.
- La API autentica sesión y rol antes de remitir el comando; el RPC externo solo acepta `service_role`
  y registra el correo de la identidad de Inbox.

## Migración, compatibilidad y rollback

La migración aditiva está en `integrations/reservations/20261008_chat_reservation_decisions.sql` y
debe ejecutarse en el proyecto SPA antes de habilitar botones de decisión. El dashboard anterior sigue
operando. Para rollback se retira `EXECUTE` al RPC nuevo y se ocultan los controles; no se borran
datos ni decisiones.
