# Plan de ejecución: aviso del enlace de invitación que no concede sesión

## Contexto leído

- `AGENTS.md`
- `specs/036-aviso-de-enlace-de-invitacion.md`
- `specs/015-perfiles-acceso-e-invitaciones.md` y `plans/028-perfiles-acceso-e-invitaciones.md`
- `docs/PROJECT_MAP.md` (identidad y acceso), `docs/SECURITY.md` (secretos y registros),
  `docs/AI_CONTRACT.md` (fallos visibles), `docs/QUALITY_GATES.md`
- Código relevante: `apps/web/app/auth/callback/page.tsx`, `apps/web/app/login/page.tsx`,
  `apps/api/src/tenants/tenant-access.service.ts`, `apps/web/lib/supabase/client.ts`

## Clasificación

- Tipo: central
- Motivo: toca el camino de autenticación (retorno de Auth y pantalla de acceso) y la clase de
  fallo que deja a una persona fuera del producto; no cambia quién entra, pero sí lo que el sistema
  afirma cuando no entra.

## Diseño propuesto

- Propietario de la regla: la clasificación del retorno de Auth vive en la presentación
  (`apps/web/lib/auth`), porque es la traducción de un resultado ya decidido por Auth; la decisión de
  acceso sigue en Auth y en `memberships`.
- Módulos afectados: `apps/web` (callback y acceso). No se toca `apps/api`, el trabajador, el
  dominio, los contratos ni la base.
- Contratos que cambian: ninguno público. Se añade un parámetro propio de navegación
  (`/login?error=invite&motivo=<identificador>`), que ningún consumidor externo usa.
- Datos/migraciones: ninguna.
- Riesgos: mostrar la causa equivocada (se evita traduciendo solo el código conocido y usando un
  rechazo genérico para el resto); exponer el secreto (se evita enviando solo el identificador del
  motivo); introducir contenido por la dirección (se evita traduciendo el valor a un texto propio).
- Rollback: revertir las dos pantallas y sus pruebas; sin estado que deshacer.

## Cortes de implementación

### Corte 1 — Regla de clasificación y sus pruebas

- Archivos previstos: `apps/web/lib/auth/invitation-callback.ts` (nuevo),
  `apps/web/lib/auth/invitation-callback.test.ts` (nuevo).
- Resultado verificable: una función pura traduce la dirección del retorno en sesión, código o
  motivo, y un mapa traduce el motivo en texto; nada de eso toca React, Next ni la red.
- Pruebas: 14 casos unitarios, incluida la familia de códigos desconocidos, los motivos inventados y
  la dirección que transporta solo el motivo.

### Corte 2 — Pantallas

- Archivos previstos: `apps/web/app/auth/callback/page.tsx`,
  `apps/web/app/login/page.tsx`.
- Resultado verificable: el callback guarda la sesión o manda al acceso con el motivo; el acceso
  explica el motivo cuando existe y no muestra nada cuando no existe.
- Pruebas: cubiertas por el corte 1 (la regla) y por `typecheck`; la comprobación en navegador con un
  enlace real queda como paso manual (§12 de la especificación).

### Corte 3 — Suite del repositorio

- Archivos previstos: `apps/web/vitest.config.ts` (nuevo), `apps/web/package.json`, `package.json`.
- Resultado verificable: `corepack pnpm test` incluye las pruebas de la web.
- Pruebas: la suite completa.

### Corte 4 — Documentación y revisión

- Documentos: `specs/036-...`, `plans/046-...`, `docs/DECISIONS.md` (ADR-056) y la nota de cierre de
  `specs/015` y `plans/028`.
- Controles: `corepack pnpm test`, `typecheck`, `lint`, `format:check`.

## Condición de detención

Detener y reportar antes de continuar si aparece una contradicción con la especificación, una
migración destructiva, una dependencia nueva, un riesgo de seguridad o un contrato externo no
verificado. No se alcanzó ninguna de esas condiciones en este corte.
