# Plan 025 - Perfiles visuales de contactos Zernio

- **Estado:** implementado y verificado en vivo
- **Fecha:** 2026-08-14

1. Añadir columnas aditivas para usuario y avatar privado, crear el bucket sin acceso público y verificarlo en Supabase.
2. Extender el normalizador firmado para extraer nombre de usuario y URL de foto HTTPS sin convertir una foto inválida en fallo del mensaje.
3. Descargar y validar la foto en el worker con límites y guardar el objeto privado de forma aislada por tenant.
4. Exponer usuario y disponibilidad de avatar en el contrato de conversaciones; emitir avatar firmado desde una ruta API autorizada y su BFF.
5. Actualizar la lista de contactos con usuario real, avatar temporal y fallback de iniciales.
6. Cubrir validación, aislamiento de tenant, imagen inválida, ausencia de foto y accesos no autorizados; completar documentación y controles. **Completado localmente y verificado en Supabase.**
