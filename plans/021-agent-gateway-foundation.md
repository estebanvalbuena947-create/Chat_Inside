# Plan 021 - Base segura del Agent Gateway

- **Estado:** implementado
- **Fecha:** 2026-08-14
- **Cierre:** implementado y validado; la conexion n8n real requiere contrato y autenticacion del workflow existente.

1. Definir contrato minimo de invocacion sin notas privadas ni secretos.
2. Centralizar en dominio la elegibilidad por modo de automatizacion.
3. Implementar puerto del gateway en worker con validacion de salida, sin transporte real configurado.
4. Probar auto, modos bloqueados y salida invalida; documentar la frontera para n8n.

## Riesgos y limite

- No se asume URL, autenticacion ni payload real de n8n hasta que el workflow existente aporte su contrato.
- No se conecta este gateway al procesamiento de mensajes ni a Zernio en este corte.
