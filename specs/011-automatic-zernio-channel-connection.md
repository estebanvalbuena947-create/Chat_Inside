# Especificación: conexión automática de canales Zernio

- **Estado:** implementada

**Cierre:** implementada y registrada en `docs/DECISIONS.md` como ADR-034: un perfil Zernio por tenant, OAuth solo para administradores y el webhook `account.connected` como unica fuente que crea o actualiza `channel_accounts`. Revisado el 2026-10-06.

- **Fecha:** 2026-08-14
- **Responsable:** integración Zernio

## Resultado

Un administrador inicia la conexión de Instagram, Facebook/Messenger, WhatsApp o TikTok desde Chat Zernio. Zernio gestiona la autorización de la red social y el webhook firmado `account.connected` vincula automáticamente la cuenta resultante con el tenant iniciado, sin introducir `accountId` manualmente.

## Reglas

1. Cada tenant tiene como máximo un perfil Zernio localmente registrado. El perfil se crea de manera idempotente con un nombre derivado solo del UUID del tenant.
2. Solo un administrador del tenant puede iniciar una conexión; agentes y supervisores no pueden crear perfiles ni enlaces OAuth.
3. La API genera la URL de autorización mediante el endpoint oficial de Zernio, usando el perfil del tenant y una URL pública de retorno configurada por servidor. La clave de Zernio no llega al navegador.
4. Se usa el flujo estándar de Zernio, no el modo headless: Zernio presenta cualquier selector adicional de página/cuenta.
5. El webhook firmado `account.connected` es la fuente de verdad para registrar `channel_accounts`. Debe coincidir con el `zernio_profile_id` del tenant; una cuenta asociada a otro tenant se rechaza y no se reasigna.
6. El webhook de mensajes permanece bloqueado para cuentas no vinculadas. `account.disconnected` se registra como cambio de estado operativo en un corte posterior; no se implementa desconexión automática aquí.
7. La interfaz muestra los canales vinculados y permite iniciar una conexión, pero no muestra claves ni IDs de proveedor.

## Datos y compatibilidad

- Migración aditiva: `tenants.zernio_profile_id` nullable, único cuando exista.
- `channel_accounts` existente conserva su restricción global proveedor/cuenta; el alta desde `account.connected` es idempotente si vuelve la misma cuenta del mismo tenant.
- No se alteran conversaciones, mensajes, outbox ni permisos de Data API.

## Riesgos, despliegue y rollback

- La API necesita `ZERNIO_API_KEY` y `ZERNIO_CONNECT_REDIRECT_URL` exclusivamente en su entorno. La URL debe ser HTTPS pública y apuntar al retorno de la web.
- En Zernio debe habilitarse `account.connected` hacia el webhook ya firmado. Sin ese evento, la autorización termina pero el canal no aparecerá localmente.
- Rollback: ocultar la acción de conectar y detener el inicio OAuth; las cuentas ya vinculadas siguen operativas. La columna aditiva puede permanecer sin impacto.
