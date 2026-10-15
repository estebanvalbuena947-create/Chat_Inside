# Plan de ejecución: invitaciones resistentes a previsualizaciones

## Contexto leído

- `AGENTS.md`, `docs/AI_CONTRACT.md`, `docs/PROJECT_MAP.md`, `docs/ARCHITECTURE.md`,
  `docs/SECURITY.md`, `docs/QUALITY_GATES.md`
- `specs/015-perfiles-acceso-e-invitaciones.md`, `specs/036-aviso-de-enlace-de-invitacion.md`,
  `specs/037-invitaciones-resistentes-a-previsualizaciones.md`
- `apps/api/src/tenants/tenant-access.service.ts` y sus pruebas
- `apps/web/app/auth/callback/page.tsx`, `apps/web/lib/auth/invitation-callback.ts`, cliente Supabase
- API tipada de Auth instalada: `GenerateLinkResponse.properties.hashed_token` y
  `verifyOtp({ token_hash, type })`

## Clasificación

- Tipo: central
- Motivo: cambia la entrega y el canje de una credencial de acceso de un solo uso, entre API, Auth y
  navegador.

## Diseño aprobado

- Propietario: identidad y acceso. La API emite un enlace seguro; la web valida explícitamente con el
  cliente de Auth; Auth conserva la decisión de sesión.
- Módulos: `apps/api/src/tenants`, `apps/web/app/auth`, `apps/web/lib/auth`, pruebas y documentación.
- Contrato: sin cambio de esquema; solo cambia el formato interno de `inviteLink`.
- Datos/migraciones: ninguna.
- Riesgos: que un token llegue al servidor o se canjee sin interacción; se mitiga con fragmento URL,
  página pasiva y `history.replaceState` antes de `verifyOtp`. Que se altere el destino; se mitiga
  derivándolo de `type`, que Auth valida.
- Rollback: enlaces antiguos siguen en `/auth/callback`; revertir solo la emisión de la nueva forma.

## Cortes de implementación

### Corte 1 — Emisión segura y pruebas de API

- Archivos: `tenant-access.service.ts`, `tenant-access.service.test.ts`.
- Resultado: la API usa `hashed_token`, nunca `action_link`, y devuelve `/auth/invite#...`.
- Pruebas: nueva cuenta, cuenta existente, fragmento sin query, ausencia de hash y no exposición del
  `action_link`.

### Corte 2 — Confirmación explícita de navegador

- Archivos: módulo de lectura de invitación, nueva ruta `apps/web/app/auth/invite/page.tsx`, pruebas.
- Resultado: abrir la página no llama a Auth; pulsar el botón canjea con `verifyOtp`, borra el
  fragmento y navega según el tipo.
- Pruebas: tipos válidos, fragmentos inválidos, tipos ajenos y errores del proveedor.

### Corte 3 — Compatibilidad, documentación y verificación

- Archivos: especificación 015, plan 028, spec 037, plan 047 y ADR-057.
- Resultado: callback antiguo permanece; la documentación deja de exigir la redirección Auth para
  enlaces nuevos.
- Controles: `format:check`, `lint`, `typecheck`, `test`, `build`.

## Condición de detención

Detener si `hashed_token` no está presente en la respuesta real de la versión instalada de Auth, si
`verifyOtp` no establece sesión con tipo `invite` o `magiclink`, o si una revisión de seguridad revela
que el fragmento se envía fuera del navegador. La API tipada instalada confirma los dos primeros
contratos; la semántica del fragmento forma parte del estándar URL y se prueba en el diseño de ruta.
