# Plan 019 - Interruptor de bot por conversacion

- **Estado:** implementado
- **Fecha:** 2026-08-14
- **Cierre:** implementado y validado; n8n/Zernio quedan fuera de este corte.

## Diseno aprobado

- Cambio central del dominio de conversaciones.
- Se reutiliza `automation_mode`; `auto` habilita la futura automatizacion y `paused` la bloquea. La version independiente evita conflictos con estado y asignacion.
- La API propia concentra autenticacion, membresia, aislamiento tenant y concurrencia. La UI solo solicita la accion mediante BFF.
- No se integra n8n en este corte: su contrato y credenciales siguen pendientes de evidencia y aprobacion especifica.

## Cortes

1. Migracion aditiva, contrato y verificacion remota de RLS/privilegios.
2. Comando API/BFF y pruebas de autorizacion, repeticion y conflicto.
3. Boton Activar/Desactivar bot en la conversacion y controles completos.

## Riesgos y detencion

- Detener si la tabla queda expuesta a la Data API, si una persona sin membresia puede operar, o si se requiere llamar a n8n/Zernio.
- El modo `suggest` historico no se convierte automaticamente; se considera no apto para envio automatico hasta una decision futura.
