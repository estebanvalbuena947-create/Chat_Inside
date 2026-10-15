# Plan: métricas por asesor y Bot

1. Crear una auditoría aditiva de cierres que la base inserta atómicamente al pasar a `resolved`.
2. Extender el resumen con participación por asesor/Bot, primera respuesta, cierres atendidos,
   cierres ejecutados y conversaciones ganadas.
3. Resolver nombres sólo en la API, mostrar una tabla de actividad comparable y probar atribución,
   reapertura, idempotencia y handoff.
4. Aplicar la migración, verificar seguridad e índices, y desplegar compatible con la interfaz actual.
