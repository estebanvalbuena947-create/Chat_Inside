# AGENTS.md

## Propósito

Este archivo define cómo debe trabajar cualquier agente de programación en este repositorio. Debe leerse antes de analizar o modificar código.

## Lectura obligatoria

Antes de una modificación de dominio, arquitectura, seguridad, datos o integración externa, leer:

1. `docs/AI_CONTRACT.md`
2. `docs/PROJECT_MAP.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SECURITY.md`
5. La especificación correspondiente en `specs/`
6. El plan correspondiente en `plans/`, cuando exista

## Clasificación de cambios

- **Local:** texto, estilos, ajustes visuales aislados o correcciones sin impacto en reglas de negocio.
- **Central:** autenticación, pagos, reservas, disponibilidad, datos, permisos, integraciones, procesos asíncronos, seguridad o cambios que afecten más de un módulo.

Los cambios centrales requieren especificación, diseño previo, pruebas y actualización documental.

## Reglas obligatorias

- No implementar reglas de negocio en componentes visuales.
- No crear excepciones para valores concretos cuando existe una regla general.
- No duplicar lógica de dominio en controladores, rutas, jobs o integraciones.
- Validar entradas en los límites del sistema.
- Tratar efectos externos como operaciones idempotentes cuando puedan repetirse.
- No exponer secretos, tokens, datos personales o credenciales en cliente, logs o pruebas.
- No agregar dependencias de producción sin justificar necesidad, mantenimiento y riesgo.
- No modificar archivos no relacionados con la tarea.
- No silenciar errores con valores por defecto que oculten inconsistencias.
- Toda modificación de comportamiento debe incluir o actualizar pruebas.
- Toda decisión no obvia debe registrarse en `docs/DECISIONS.md`.

## Flujo obligatorio para cambios centrales

1. Explicar el problema como regla, no solo como síntoma.
2. Identificar módulos afectados y propietario de cada regla.
3. Proponer diseño sin modificar código.
4. Enumerar riesgos, migraciones, compatibilidad y rollback.
5. Esperar aprobación del diseño o seguir el plan aprobado.
6. Implementar en cortes pequeños: dominio → servicios → persistencia/integraciones → API/UI → pruebas → documentación.
7. Ejecutar todos los controles definidos en `docs/QUALITY_GATES.md`.
8. Revisar el diff contra contrato, arquitectura, especificación y riesgos.

## Definición de terminado

Una tarea termina únicamente cuando:

- cumple los criterios de aceptación;
- las pruebas nuevas y existentes pasan;
- lint, formato y tipos pasan;
- no introduce patrones prohibidos;
- se validaron errores y casos límite;
- la documentación quedó actualizada;
- el informe final indica archivos modificados, motivo, pruebas ejecutadas, riesgos restantes y pasos manuales.

## Comandos del proyecto

- Instalar: `corepack pnpm install --frozen-lockfile`
- Desarrollo: `corepack pnpm dev`
- Pruebas: `corepack pnpm test`
- Lint: `corepack pnpm lint`
- Formato: `corepack pnpm format:check`
- Tipos: `corepack pnpm typecheck`
- Build: `corepack pnpm build`

Los cuatro controles que hay que pasar en cada corte son `typecheck`, `lint`, `format:check` y `test`.
`build` se ejecuta antes de desplegar. El detalle de todos ellos está en `docs/QUALITY_GATES.md`.

## Reglas de revisión de código

- Señalar cambios que solucionen solo un ejemplo y no la clase completa del problema.
- Señalar lógica de negocio en UI, rutas, adaptadores o controladores.
- Señalar duplicación de reglas, condiciones por nombres concretos y estados imposibles.
- Señalar operaciones externas sin idempotencia, timeout, reintento controlado o trazabilidad.
- Señalar pruebas que solo replican la implementación y no validan comportamiento observable.
