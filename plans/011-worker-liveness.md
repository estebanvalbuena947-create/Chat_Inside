# Plan 011 — Worker persistente de inbox y outbox

- **Estado:** aprobado para implementación
- **Fecha:** 2026-08-14
- **Autorización:** el administrador autorizó corregir el mensaje que permanecía en cola.

## Regla

Mientras el comando de desarrollo o producción del worker esté en ejecución, el proceso de trabajo debe mantenerse activo para reclamar eventos pendientes de inbox y outbox. Una cola pendiente no depende de una acción manual ni de que la interfaz esté abierta.

## Diseño

1. El worker drena al iniciar y programa el siguiente drenaje cada dos segundos.
2. El temporizador conserva la referencia del proceso; no se marca como `unref`, porque eso permite que Node termine una vez concluido el arranque.
3. Los workers simultáneos siguen siendo seguros: cada evento se reclama condicionalmente y el envío conserva su clave idempotente.

## Riesgos y rollback

- No requiere migración ni contrato público nuevo.
- El proceso ocupa recursos mínimos mientras está activo; es necesario para procesar colas de forma asíncrona.
- El rollback técnico sería restituir el temporizador no referenciado, pero reintroduciría el riesgo de que la cola se detenga y no es un rollback operativo recomendado.

## Pruebas

- El ciclo ejecuta un drenaje inicial.
- Programa el intervalo esperado y no invoca `unref` sobre su referencia.
- Las pruebas, tipos, lint, formato y build del worker siguen pasando.
