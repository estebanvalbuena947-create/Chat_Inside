# Especificacion: base segura del Agent Gateway

- **Estado:** aprobada para implementacion
- **Responsable:** integracion y automatizacion
- **Fecha:** 2026-08-14
- **Cierre:** implementada como puerto y politica sin integracion externa.

## Resultado

El worker dispone de un gateway interno que representa una solicitud minima al agente y valida estrictamente su respuesta. Esta base no configura n8n ni crea mensajes, outbox o efectos externos.

## Reglas

1. Una solicitud contiene solo IDs internos, el mensaje que originaria una respuesta y un `correlationId`; no incluye notas privadas, secretos, URLs de proveedor ni otros tenants.
2. El gateway solo puede llamar a su transporte cuando la conversacion esta en `auto`.
3. `paused` y el valor historico `suggest` no permiten invocar el transporte.
4. Toda respuesta del transporte se valida mediante `agentOutputSchema`; una salida invalida falla de forma visible y no genera comando.
5. Este corte no registra ni envia respuestas. Un corte posterior debera comprobar de nuevo `auto` justo antes de crear un comando o efecto externo.

## Compatibilidad y rollback

- El gateway no esta conectado al ciclo del worker ni requiere variables de entorno; por ello no cambia el comportamiento actual.
- Rollback: eliminar su uso futuro sin datos ni efectos que reconciliar.
