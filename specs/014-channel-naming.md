# Especificación: nombre visible de las cuentas conectadas

- **Estado:** implementada
- **Responsable:** integración Zernio y presentación
- **Fecha:** 2026-09-28
- **Cierre:** implementada el 2026-09-28 sobre la columna existente `channel_accounts.display_name`; no hubo migración.

## Resultado

Cuando un tenant conecta más de una cuenta de la misma plataforma, el equipo necesita distinguirlas en la bandeja. Cada cuenta conectada tiene un nombre visible que el equipo puede editar, y que el proveedor solo rellena cuando está vacío.

## Reglas

1. El nombre pertenece a la cuenta y al tenant. Solo un administrador puede cambiarlo, y la API propia sigue siendo la fuente de verdad.
2. El proveedor solo puede **rellenar** un nombre vacío con el usuario que envía en sus eventos. Nunca sobrescribe un nombre elegido por el equipo, porque el nombre es justamente lo que distingue dos cuentas de la misma plataforma.
3. Al editarlo, el nombre es obligatorio y de 1 a 160 caracteres tras recortar espacios extremos.
4. La lista de canales no expone identificadores del proveedor.
5. Una cuenta sin nombre se muestra como "Cuenta sin nombre" y ofrece nombrarla; el proveedor la completará con el primer mensaje que entregue.

## Contrato

- `PATCH /v1/tenants/:tenantId/channels/:channelId` con `{ displayName }` devuelve `{ item }` con la cuenta actualizada.
- Sin sesión `401`; sin rol `admin` `403`; canal inexistente en el tenant `404`; entrada inválida `400`.

## Datos, seguridad y rollback

- Se reutiliza la columna `channel_accounts.display_name`; la migración es innecesaria y ningún dato existente cambia de forma.
- La escritura del proveedor se aplica con la condición de que el nombre siga vacío, de modo que dos eventos simultáneos no puedan pisar una decisión del equipo.
- Rollback: dejar de ofrecer la edición en la interfaz y de rellenar el nombre desde el trabajador. Los nombres guardados no afectan mensajes, conversaciones ni autorizaciones.
