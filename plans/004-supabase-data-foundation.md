# Plan de ejecución: conexión Supabase y datos iniciales

## Autorización

- **Tipo:** central.
- **Autorización humana:** 2026-08-13, confirmación explícita de la fase de datos y conexión Supabase.
- **Proyecto:** `jidefunczooxxppqmkra`, entorno de desarrollo de Inside Spa.

## Regla y propietarios

PostgreSQL es la fuente de verdad local. Todo recurso operativo lleva `tenant_id`; la API propia autoriza operaciones y RLS/Data API bloquean acceso público hasta que existan sesiones y políticas de producto.

## Diseño aprobado

1. Migración versionada con tenants, membresías, contactos, conversaciones, mensajes, inbox (`webhook_events`) y outbox (`outbox_events`).
2. Claves foráneas compuestas fuerzan que un contacto, conversación, emisor o asignado pertenezcan al mismo tenant.
3. RLS se activa en todas las tablas y se revocan privilegios a `anon` y `authenticated`; la UI continúa consumiendo la API propia, no Data API.
4. No se crean datos de clientes, usuarios, canales, buckets, webhooks, Zernio, Redis ni n8n en este corte.

## Riesgos, compatibilidad y rollback

- El proyecto remoto está vacío; la migración solo agrega estructura.
- No hay rollback automático destructivo: si se decide abandonarla, se restaura el proyecto de desarrollo o se aplica una migración revisada explícita. Nunca se eliminan tablas con datos como atajo.
- La API obtiene su secreto de servidor y lee datos de Supabase desde hace tiempo: `/health` responde `"supabase":"configured"` contra el proyecto real, comprobado en vivo el 2026-10-06.

## Verificación

- Inspección previa de tablas, migraciones y asesores de seguridad.
- Aplicación de migración única en el proyecto de desarrollo.
- Tipos TypeScript generados desde el esquema remoto.
- Asesores de seguridad y rendimiento posteriores, más controles locales de formato, lint, tipos, pruebas y build.

## Hallazgos posteriores a la migración

- `rls_enabled_no_policy` es esperado en esta fase: las tablas están cerradas por RLS y sin privilegios para `anon` o `authenticated`; no se agregan políticas permisivas antes de implementar sesiones y autorización por tenant.
- Se agrega una segunda migración no destructiva de índices para las claves foráneas que el asesor de rendimiento señaló. Los avisos de índices sin uso son esperados mientras el proyecto no tenga datos ni tráfico.

## Resultado

- Aplicadas en el proyecto de desarrollo: `20260813174236_inside_spa_chat_foundation` y `20260813174403_add_tenant_foreign_key_indexes`.
- Las tablas están vacías y cerradas para roles públicos. La conexión de runtime queda fuera de este corte hasta construir Auth y los casos de uso de API.
