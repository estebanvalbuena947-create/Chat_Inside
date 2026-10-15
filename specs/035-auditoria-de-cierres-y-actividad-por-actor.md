# Especificación: auditoría de cierres y actividad por actor

- **Estado:** aprobada
- **Propietario:** `apps/api/src/metrics` (lectura) y `conversations` (escritura)

## Regla

Un cierre, una atención y una conversación ganada son hechos diferentes y se muestran por separado.

1. **Cierre ejecutado:** quién cambió una conversación a `resolved`: `bot` o `asesor`.
   Cada transición a `resolved` produce exactamente un evento inmutable, dentro de la misma
   transacción de base de datos. Reintentar un cierre que ya está resuelto no produce otro evento.
2. **Cierre atendido:** para la métrica de atención, una conversación cerrada pertenece al último
   asesor que respondió antes del cierre; si no hay respuesta humana, pertenece al Bot. Esto impide
   contar la misma conversación para dos asesores.
3. **Ganada:** es el resultado comercial existente `outcome = ganado`; no se suma a cierres. La
   gráfica atribuye una ganada a quien la registró (`outcome_set_by`), porque ese hecho ya contiene
   actor y fecha auditables.

Los cierres anteriores a la migración no pueden reconstruir de forma fiable quién ejecutó la acción.
Siguen apareciendo en el total histórico por atención, pero la interfaz identifica que los cierres
ejecutados se registran desde la migración.

## Contrato

El resumen añade por participante `closedConversations`, `executedClosures` y
`wonConversations`, y añade un desglose global `closureActions`. Son campos aditivos.

## Seguridad y consistencia

- El cliente no escribe la auditoría ni el actor: los dos caminos autorizados del servidor lo fijan.
- La tabla queda protegida por RLS y sin permisos de Data API.
- El trigger solo acepta una transición real hacia `resolved` con actor válido; la inserción y el
  cambio de estado fallan juntos.
