# Plan de ejecución: fundaciones sin integraciones reales

## Clasificación

- **Tipo:** central.
- **Autorización:** `AUTORIZO LA FASE DE FUNDACIONES SIN INTEGRACIONES REALES`.

## Regla y propietarios

Las reglas de conversación, mensaje y automatización se implementan una vez en `packages/domain`; las validaciones de contrato viven en `packages/contracts`; API, worker y UI no replican esas decisiones.

## Corte

1. Monorepo `pnpm` con Node 22, lockfile, lint, formato, tipos y pruebas.
2. Contratos Zod y políticas de estado sin dependencias de proveedores.
3. API Nest/Fastify, worker Node y UI Next mínimos con health check y presentación estática.
4. Configuración tipada y `.env.example` con nombres de variables, sin valores reales.

## Exclusiones

- Sin SDK, cliente, SQL, migración, bucket, cola Redis, webhook ni llamada a Supabase, Zernio o n8n.
- Sin autenticación de producción, datos de cliente ni secretos.

## Riesgos y rollback

Dependencias nuevas requieren lockfile y auditoría. El rollback consiste en revertir los archivos de esta fase; no hay datos ni infraestructura que revertir.

## Verificación

- Pruebas de reapertura, handoff y estados monotónicos.
- Lint, formato, typecheck y build del workspace.
- Auditoría de dependencias y escaneo de secretos tras la instalación.
