# Especificación: métricas por asesor, Bot y transferencias

- **Estado:** diseñada
- **Propietario:** `apps/api/src/metrics`

Las métricas atribuyen cada primera respuesta posterior a un mensaje entrante a quien la envió: un
asesor identificado por `sender_user_id` o el Bot para mensajes `automation`. Cuando el Bot deriva
una conversación se registra una transferencia con fecha y asesor receptor; el Bot conserva su
atención anterior y el asesor empieza a medirse con su propia primera respuesta.

La auditoría de transferencias será aditiva y sólo permitirá al servidor escribir. Los datos históricos
empiezan después de aplicar la migración; no se inferirán transferencias antiguas.
