# Plan 016 — Etiquetas internas privadas

- **Estado:** implementado y validado localmente
- **Fecha:** 2026-08-14

## Clasificación y propietario

- Tipo: central; cambia datos, permisos, contratos y varios módulos.
- Propietario: organización de atención. La API concentra autorización, idempotencia y concurrencia; la UI solo representa la biblioteca y solicita comandos.

## Diseño

1. Una migración aditiva crea `labels` y `conversation_labels`, con RLS, sin privilegios directos para navegador, restricciones e índices. Las FK compuestas mantienen tenant, conversación y etiqueta alineados.
2. Los contratos incorporan etiquetas, comandos de administración y las etiquetas resumidas en la conversación. El servicio de organización gestiona biblioteca y vínculos idempotentes; `TenantAccessService` sigue siendo la fuente de autorización de membresía/rol.
3. NestJS y los BFF de Next.js validan entradas, mantienen el token en servidor y devuelven errores operables. La bandeja muestra las etiquetas y permite aplicar o retirar; los controles de biblioteca aparecen solo para administración.
4. Se prueban permisos, aislamiento, reintentos y concurrencia. Se verifica la migración en el proyecto Supabase limitado, RLS, privilegios, asesores y controles del repositorio.

## Riesgos y compatibilidad

- La migración es expandir-sin-contracción y no toca mensajes, estados ni envío.
- La eliminación de una etiqueta usa cascada solo sobre sus vínculos internos, nunca sobre conversaciones.
- La biblioteca utiliza versión para evitar sobrescrituras silenciosas. Aplicar/retirar son comandos de estado idempotente.
- Si la nueva UI falla, se puede ocultar sin afectar la bandeja actual. No se hace rollback destructivo de registros creados por usuarios.

## Cortes

1. Crear migración y contratos, aplicar y verificar seguridad de base de datos.
2. Implementar servicio/controlador/BFF y pruebas de autorización, aislamiento e idempotencia.
3. Incorporar etiquetas a la bandeja y administrar la biblioteca.
4. Ejecutar controles, registrar decisión y validación, y revisar el diff.

## Condición de detención

Detener antes de aplicar si una tabla no queda con RLS y sin acceso directo de navegador, si la FK no impide vínculos entre tenants, o si el cambio exige un contrato externo o una dependencia nueva.
