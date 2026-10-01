# Plan 015 — Respuestas rápidas privadas por tenant

- **Estado:** implementado y validado localmente
- **Fecha:** 2026-08-14

## Regla y propietario

La organización de atención es propietaria de las respuestas rápidas. La API aplica autorización, aislamiento por tenant, idempotencia de creación y concurrencia de edición; la interfaz solo las presenta y rellena el borrador. Zernio, el worker y el dominio de mensajes no participan hasta que la persona pulsa el envío manual existente.

## Diseño

1. Una migración aditiva crea `public.canned_responses`, con FK compuesta hacia la membresía creadora, validaciones de longitud, `version`, clave de idempotencia, índice por tenant y RLS. Se revoca el acceso directo de `anon` y `authenticated`.
2. Los contratos validan los cuatro comandos y sus límites. El servicio de acceso obtiene una regla reutilizable para comprobar el rol de una membresía, sin llevar permisos a los controladores o a la UI.
3. Un servicio de aplicación tenant-scoped implementa listado, creación idempotente y actualización/eliminación condicionadas por versión. Una respuesta ausente u horizontal se expresa como `404`; una versión desactualizada como `409`.
4. NestJS publica las rutas protegidas. Next.js añade rutas BFF que mantienen el token en el servidor y resuelven el tenant accesible antes de reenviar el comando.
5. En el compositor, una persona puede elegir una respuesta y editar el texto antes de enviar. El administrador cuenta además con un panel para crear, editar y eliminar respuestas; los demás roles no reciben controles de administración.

## Riesgos, compatibilidad y rollback

- La migración solo agrega una tabla, por lo que es compatible con la bandeja actual y no modifica conversaciones, mensajes ni eventos.
- La tabla queda cerrada a la Data API; el uso mediante la API con `service_role` sigue la autorización de aplicación y no expone secretos al navegador.
- La creación se hace idempotente por tenant y clave. Las ediciones y borrados no hacen "last write wins": usan `version`.
- El rollback operativo consiste en ocultar el panel y las acciones; no hay efecto externo ni datos existentes transformados. No se debe borrar datos creados por usuarios como parte de un rollback automático.
- Las migraciones se aplicaron por el MCP limitado al proyecto y sus archivos locales quedaron alineados con el historial remoto. El desfase histórico previo de `status_version` sigue requiriendo revisión antes de un futuro `supabase db push`.

## Pruebas y detención

- Cubrir membresía, roles, aislamiento por tenant, límites, creación idempotente, conflicto concurrente y ausencia.
- Verificar que ninguna operación llama a Zernio ni crea outbox.
- Ejecutar pruebas, tipos, lint, formato, build de API, consulta de verificación y asesores cuando estén disponibles.
- Detener antes de aplicar si la tabla no queda con RLS y sin privilegios directos para cliente, o si se requiere una política de asignación no aprobada.
