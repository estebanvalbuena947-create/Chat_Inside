# Plan 012 — Correlación de ciclo de vida por identificador de plataforma

- **Estado:** aprobado para implementación
- **Fecha:** 2026-08-14
- **Autorización:** el administrador autorizó corregir que un mensaje leído no cambiara de estado.

## Regla

Cuando Zernio publica un evento de ciclo de vida con `message.platformMessageId`, esa es la identidad de plataforma que debe correlacionarse con la referencia almacenada tras el envío. `message.id` se usa únicamente como respaldo si el proveedor no publica una identidad de plataforma.

## Diseño

1. El normalizador prioriza `platformMessageId` y conserva el mismo prefijo de cuenta de canal; no compara texto, contacto ni horario.
2. El worker conserva la comprobación de tenant, cuenta de canal y dirección saliente antes de avanzar el estado monotónico.
3. Se incorpora una reconciliación manual, acotada e idempotente de eventos de ciclo de vida ya procesados. Solo vuelve a aplicar la correlación exacta; no reenvía mensajes ni cambia el estado de los eventos originales.

## Riesgos y rollback

- No requiere migración: las referencias externas existentes ya contienen el identificador retornado por el envío.
- Un evento sin `platformMessageId` mantiene el respaldo compatible por `message.id`.
- La reconciliación puede repetirse sin retroceder estados ni crear efectos externos. El rollback operativo es no volver a ejecutarla.

## Pruebas

- `platformMessageId` tiene prioridad sobre `message.id`.
- Un payload sin `platformMessageId` mantiene la compatibilidad existente.
- Tenant, cuenta y transición monotónica se siguen aplicando en el worker.
