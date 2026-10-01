# Plan de ejecución: autenticación Supabase y frontera de API

## Autorización

- **Tipo:** central: identidad, autorización, secretos y contrato HTTP.
- **Autorización humana:** 2026-08-13, confirmación explícita para crear el siguiente corte de autenticación y API segura.
- **Entorno:** proyecto de desarrollo `jidefunczooxxppqmkra` de Inside Spa; sin datos de clientes ni producción.

## Regla y propietarios

Una identidad autenticada solo puede consultar recursos del tenant donde posee una membresía vigente. La web gestiona exclusivamente la sesión con una clave publicable y cookies; `apps/api` es el propietario de autorización por tenant y de todo acceso a datos con una clave secreta de servidor.

## Diseño

1. La web usa `@supabase/ssr` con cookies para iniciar y cerrar sesión. No guarda tokens en `localStorage` ni consulta tablas operativas de Supabase.
2. La API recibe `Authorization: Bearer <JWT>`, valida el token contra Auth y rechaza cabeceras ausentes o inválidas.
3. Cada endpoint de datos recibe el tenant objetivo en la ruta, valida su UUID y comprueba la fila `memberships(tenant_id, user_id)` antes de consultar.
4. El cliente privilegiado se crea solo en `apps/api` con `SUPABASE_SECRET_KEY` (o `SUPABASE_SERVICE_ROLE_KEY` heredada), nunca en `NEXT_PUBLIC_*`, UI, registros o pruebas. Sin esa configuración, la API responde un `503` explícito y seguro.
5. Se expone inicialmente solo lectura paginada de conversaciones. Cambios de estado, envíos y escritura quedan fuera hasta modelar sus casos de uso, transacciones e idempotencia.
6. No se modifica el esquema, sus privilegios ni sus políticas RLS en este corte. RLS continúa como segunda barrera y Data API sigue cerrada a navegador.

## Módulos y contrato

- `apps/web`: cliente de sesión en cookie, formulario de acceso y salida; no contiene autorización de tenant.
- `apps/api`: autenticación Bearer, resolución de membresía y controlador `GET /v1/tenants/:tenantId/conversations?limit=…`.
- `packages/contracts`: esquema de respuesta y límite de listado, reutilizable para la UI posterior.
- `docs`: decisión de arquitectura, configuración local y evidencia de validación.

## Riesgos, compatibilidad y rollback

- Hasta configurar `SUPABASE_SERVICE_ROLE_KEY` solo el health check estará disponible; los endpoints protegidos devuelven `503`, no resultados parciales.
- Un usuario de Auth sin membresía recibe `403`; no se crea ninguna membresía ni tenant de forma implícita.
- La clave publicable configurada en `apps/web/.env.local` es intencionalmente pública; las claves secretas permanecen en el entorno de API y fuera de Git.
- El cambio no contiene migraciones ni datos. Para revertirlo basta retirar las dependencias/rutas de la aplicación; la base existente no se altera.

## Pruebas antiatajo

- Cabecera Bearer válida, ausente, vacía y con esquema incorrecto.
- UUID de tenant válido e inválido; límites mínimo, máximo y fuera de rango.
- Usuario autenticado con membresía frente a usuario autenticado sin membresía y tenant distinto.
- API sin configuración secreta devuelve fallo operativo `503` sin filtrar variables.
- Revisión estática de que no existen claves `service_role` ni `SUPABASE_SERVICE_ROLE_KEY` en la web.

## Criterios de aceptación

- Inicio/cierre de sesión usan sesión de cookie Supabase y clave publicable únicamente.
- La API valida la identidad y membresía antes de la consulta; no confía en un tenant enviado sin comprobarlo.
- No hay acceso directo de la UI a tablas operativas ni secreto en cliente, Git o logs.
- Pruebas, formato, lint, tipos, build, auditoría y escaneo de secretos pasan.

## Onboarding aplicado

- **Fecha:** 2026-08-13.
- Se verificó que la identidad indicada por el administrador existe en Supabase Auth.
- Se creó o reutilizó de forma idempotente el tenant `inside-spa` con el nombre `Inside Spa`.
- Se creó o actualizó de forma idempotente su membresía con rol `admin`.
- La comprobación posterior confirmó que la membresía pertenece al usuario solicitado y al tenant correcto. No se almacenan UUID, correo ni otros datos personales en este plan.
