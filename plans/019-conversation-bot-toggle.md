# Plan 019 - Interruptor de bot por conversacion

- **Estado:** implementado
- **Fecha:** 2026-08-14
- **Cierre:** interruptor implementado y validado; refuerzo del encolado y transporte preparado el 2026-10-19, pendiente de despliegue de API y trabajador.

## Diseno aprobado

- Cambio central del dominio de conversaciones.
- Se reutiliza `automation_mode`; `auto` habilita la futura automatizacion y `paused` la bloquea. La version independiente evita conflictos con estado y asignacion.
- La API propia concentra autenticacion, membresia, aislamiento tenant y concurrencia. La UI solo solicita la accion mediante BFF.
- No se integra n8n en este corte: su contrato y credenciales siguen pendientes de evidencia y aprobacion especifica.

## Cortes

### Refuerzo del transporte aprobado por el usuario (2026-10-19)

1. Reutilizar `getAgentInvocationEligibility` del dominio para valores persistidos no confiables.
2. Rechazar nuevos mensajes automaticos en `TenantMessageService`, conservando la idempotencia.
3. Consultar el modo vigente antes de los efectos de `ZernioOutboundWorker` y del notificador n8n.
4. Probar modos, remitentes, formatos, fallos de lectura, pausa durante preparacion y reintentos.
5. Registrar la decision y ejecutar tipos, lint, formato, pruebas y build antes de desplegar.

Sin migracion ni dependencias. Los rechazos son visibles y terminales; los fallos de lectura se
reintentan sin enviar. API y trabajador se despliegan juntos. El rollback revierte codigo, no
reactiva envios descartados, y devuelve el riesgo de responder con el bot pausado.

1. Migracion aditiva, contrato y verificacion remota de RLS/privilegios.
2. Comando API/BFF y pruebas de autorizacion, repeticion y conflicto.
3. Boton Activar/Desactivar bot en la conversacion y controles completos.

## Riesgos y detencion

- Detener si la tabla queda expuesta a la Data API, si una persona sin membresia puede operar, o si se requiere llamar a n8n/Zernio.
- El modo `suggest` historico no se convierte automaticamente; se considera no apto para envio automatico hasta una decision futura.
