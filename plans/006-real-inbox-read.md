# Plan de ejecución: bandeja real de solo lectura

## Autorización

- **Tipo:** central: autorización por tenant, contrato HTTP y visualización de datos.
- **Autorización humana:** 2026-08-13, continuación explícita tras iniciar sesión como administrador.
- **Entorno:** desarrollo de Inside Spa; no se crean contactos, conversaciones ni integraciones externas.

## Regla y diseño

Una sesión solo puede conocer los tenants donde posee membresía y solo puede consultar conversaciones dentro del tenant seleccionado. La API es propietaria de la autorización. La web nunca consulta tablas de Supabase: llama a un BFF interno de Next.js, que valida los claims de la sesión y transmite el JWT únicamente al API propio.

1. `GET /v1/tenants` devuelve exclusivamente las membresías del usuario autenticado.
2. `GET /v1/tenants/:tenantId/conversations` reutiliza el mismo servicio de acceso para verificar pertenencia antes de consultar.
3. El BFF de web resuelve automáticamente un tenant solo cuando hay exactamente uno. Con cero o más de uno, devuelve un estado explícito; nunca elige un tenant arbitrario.
4. La interfaz reemplaza datos ficticios por estados reales: cargando, sin tenant, selección requerida, bandeja vacía o error. No muestra mensajes/contactos inventados.
5. Este corte no escribe datos, no modifica RLS, no crea migraciones y no incorpora historial de mensajes, envíos, SSE ni Zernio.

## Riesgos y rollback

- El proyecto no tiene conversaciones; el resultado esperado es una bandeja vacía real, no una demostración.
- El BFF usa el JWT de sesión solo en el servidor para invocar la API; la API vuelve a validarlo, de modo que la web no autoriza por sí misma.
- Ante varias membresías se requerirá un selector de tenant en un corte posterior.
- El rollback consiste en retirar las rutas y restaurar la vista estática; no hay cambios de datos ni esquema.

## Pruebas

- Usuario sin credencial, sin membresía y con membresía.
- Tenant válido y tenant fuera del alcance.
- Cero, uno y más de un tenant en la resolución de la web.
- Respuesta vacía sin datos ficticios.
