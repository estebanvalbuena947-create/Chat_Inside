# Plan: métricas operativas del Dashboard

1. Extender el contrato de resumen con conteos de mensajes entrantes, Bot y asesores.
2. Calcularlos en `MetricsService` a partir de las filas ya leídas y probar variantes de dirección y actor.
3. Añadir el período de hoy y las tarjetas al Dashboard.
4. Agrupar pre-reservas por día en la presentación de Reservas usando el contrato ya autorizado.

No hay migración ni cambios de escritura. Rollback: la interfaz puede ignorar los campos aditivos.
