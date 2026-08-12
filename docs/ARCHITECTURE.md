# Arquitectura

## Estilo

`[MONOLITO MODULAR / SERVICIOS / EVENTOS / OTRO]`

## Capas y responsabilidades

### Presentación

- Renderiza estado y captura intención del usuario.
- No decide reglas de negocio.
- No accede directamente a persistencia ni secretos.

### Aplicación

- Implementa casos de uso.
- Coordina dominio, repositorios e integraciones.
- Define límites transaccionales e idempotencia de la operación.

### Dominio

- Contiene entidades, valores, políticas e invariantes.
- No depende de frameworks, HTTP, UI ni proveedores externos.

### Infraestructura y adaptadores

- Implementa persistencia, colas, archivos y APIs externas.
- Traduce contratos externos a modelos internos.
- Maneja timeouts, reintentos, errores y telemetría.

## Regla de dependencias

Las dependencias apuntan hacia el dominio. Los módulos externos conocen contratos internos; el dominio no conoce detalles de proveedores.

## Datos

- Fuente de verdad por entidad: `[DEFINIR]`
- Consistencia: `[FUERTE/EVENTUAL SEGÚN FLUJO]`
- Migraciones: `[HERRAMIENTA Y PROCESO]`
- Retención y borrado: `[POLÍTICA]`

## Integraciones

Para cada integración registrar:

- autenticación;
- contrato y versión;
- timeout;
- política de reintentos;
- idempotencia;
- deduplicación;
- trazabilidad;
- reconciliación;
- comportamiento ante caída.

## Estados imposibles

Enumerar combinaciones que no deben existir y dónde se impiden.

## Despliegue y rollback

- Estrategia de despliegue: `[DEFINIR]`
- Compatibilidad de esquema: `[DEFINIR]`
- Feature flags: `[DEFINIR]`
- Rollback: `[DEFINIR]`
