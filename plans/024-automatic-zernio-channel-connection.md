# Plan 024 - Conexión automática de canales Zernio

- **Estado:** implementado; pendiente de configuración externa
- **Fecha:** 2026-08-14

1. Añadir el vínculo único y aditivo de perfil Zernio al tenant y migrarlo en Supabase.
2. Implementar adaptador HTTP de Zernio con timeout, validación de respuesta e idempotencia para crear perfil e iniciar OAuth.
3. Añadir caso de uso y rutas API/BFF de inicio/listado de canales, limitadas a administradores.
4. Extender el webhook firmado para registrar `account.connected` únicamente cuando su perfil corresponde a un tenant local.
5. Incorporar controles de configuración de canales en la interfaz, sin exponer IDs ni secretos.
6. Probar autorización, idempotencia, conflicto horizontal, errores de proveedor y contratos; documentar configuración y rollback. **Completado localmente; falta configurar las dos variables de API y habilitar `account.connected` en Zernio.**
