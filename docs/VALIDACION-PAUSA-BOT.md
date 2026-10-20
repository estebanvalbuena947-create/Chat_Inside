# Validacion del bloqueo de respuestas con el bot pausado

## Alcance autorizado

El usuario aprobo corregir la pausa y llevarla a produccion. Se prepara una rama aislada desde
`origin/main`, sin los cambios locales ajenos de tiempo real o del limite de adjuntos. El servidor
rechazo el acceso SSH automatizado; no se declara desplegado por haber integrado codigo en Git.

## Regla y capas

- `packages/domain/src/conversations.ts`: la politica existente solo autoriza `auto`, tambien
  frente a valores persistidos desconocidos o ausentes.
- `apps/api/src/conversations/tenant-message.service.ts`: el encolado compartido rechaza nuevos
  mensajes de automatizacion y devuelve resultados idempotentes sin duplicar escrituras.
- `apps/worker/src/zernio-outbound-worker.ts`: consulta el modo por tenant y conversacion tras
  preparar archivos; un bloqueo queda fallido sin reintento. Reconcilia mensajes confirmados sin
  reenviar y filtra los fallos para no degradar acuses concurrentes.
- `apps/worker/src/bot-notifier.ts`: omite avisos entrantes pendientes cuando el modo no es `auto`.
- Las pruebas de cada archivo cubren modos, formatos, humanos, idempotencia, reintentos, fallos de
  lectura, pausa durante firma, mensajes confirmados y acuse de lectura durante un fallo HTTP.
- Especificacion 006, plan 019, contrato de tools, invariante de arquitectura y ADR-068 documentan
  el alcance. `docs/DEPLOY-PAUSA-BOT.md` describe despliegue y rollback.

## Evidencia previa

En el workspace original pasaron tipos, lint, formato y build; 1090 casos en la suite completa y,
tras agregar la prueba de lectura concurrente, 184/184 del worker (1091 casos distintos en total).
La primera corrida agoto el timeout de una prueba HTTP de resenas; la repeticion completa paso sin
modificar esa prueba ni ampliar su timeout. Se revalidara el corte aislado y el control de GitHub
antes de integrar en `main`.

## Limites operativos

Sin migracion, dependencias nuevas ni cambios de permisos. Se deben actualizar API y trabajador
juntos y verificar la operacion con un contacto interno, sin enviar mensajes de prueba a clientes.
No se cancela una peticion HTTP ya iniciada ni se observa necesariamente una pausa y reactivacion
completas entre dos lecturas. El rollback restaura el defecto; no rearma descartes. Los avisos
operativos de botones de WhatsApp no cambian; sus respuestas por la API si quedan protegidas.
