# Plan 007 — Ingreso seguro de webhooks de Zernio

- **Estado:** implementado
- **Fecha:** 2026-08-13
- **Autorización:** el administrador autorizó la fase de integración y habilitó un túnel temporal para pruebas.

## Regla

Un evento de Zernio solo puede entrar al sistema si su cuerpo original tiene una firma HMAC válida y si la cuenta del proveedor está asociada explícitamente a un tenant. Un reintento del mismo evento no crea una segunda entrada durable.

## Alcance

1. Añadir `channel_accounts` para enlazar, sin ambigüedad, una cuenta de Zernio con un tenant local.
2. Implementar `POST /v1/webhooks/zernio` con cuerpo crudo, límite de tamaño, HMAC-SHA256 y comparación en tiempo constante.
3. Persistir eventos firmados de cuentas conocidas en `webhook_events`, deduplicados por `(tenant_id, provider_event_id)`.
4. Aceptar `webhook.test` firmado sin requerir una cuenta, para comprobar la conectividad antes de habilitar tráfico real.
5. Incluir pruebas de firma, cuenta desconocida, duplicados y error de persistencia.

## Fuera de alcance

- No se envían mensajes ni se utiliza `ZERNIO_API_KEY`.
- No se procesan los cuerpos recibidos como contactos, conversaciones o mensajes hasta contar con la cuenta real asociada y un worker de normalización dedicado.
- No se habilitan Storage, Redis, n8n, SSE ni políticas Data API.

## Riesgos y rollback

- Un enlace temporal de Cloudflare cambia al detener el proceso; se usa exclusivamente en desarrollo.
- Un evento de una cuenta no registrada responde con error visible y no se almacena bajo otro tenant.
- El rollback consiste en desactivar/eliminar el webhook en Zernio; la migración solo agrega una tabla y no modifica datos existentes.

## Resultado de onboarding

- Se asoció una cuenta de Zernio proporcionada por el administrador al tenant `inside-spa` mediante una inserción idempotente.
- La comprobación posterior confirmó que la cuenta pertenece a Inside Spa. El identificador externo no se conserva en esta documentación.
