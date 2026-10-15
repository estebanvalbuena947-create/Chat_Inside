# Plan 028 - Perfiles, acceso por rol e invitaciones

- **Estado:** implementado
- **Fecha:** 2026-09-28
- **Especificación:** `specs/015-perfiles-acceso-e-invitaciones.md`
- **Cierre:** los siete pasos quedaron implementados. Corregido el 2026-10-08: el enlace se emite una sola vez y `/auth/callback` guarda la sesión del fragmento de Auth antes de crear contraseña. Ampliado el 2026-10-14 (`plans/046`, ADR-056): el enlace que no concede sesión llega al acceso con su motivo. Corregido el 2026-10-14 (`plans/047`, ADR-057): el enlace nuevo abre una página propia, con el token hash tras `#`; así una previsualización no lo puede gastar. Corregido el 2026-10-15 (`plans/047`, ADR-058): la invitación y la recuperación las envía Auth por el correo oficial del proyecto, el enlace se canjea al abrirlo sin pantalla intermedia y el alta exige la política de contraseñas del proyecto. Queda pendiente habilitar la protección contra contraseñas filtradas.

1. Contratos: esquemas de invitación, cambio de rol y retiro, reutilizando el resumen de integrante existente.
2. API: invitación con rol `admin` mediante la API de administración de Auth, con enlace de un solo uso y sin registrar el secreto; pertenencia idempotente que nunca cambia el rol existente por efecto secundario.
3. API: cambio de rol y retiro de integrante, ambos restringidos al tenant y con el invariante del último administrador expresado como conflicto.
4. BFF: rutas de invitación, cambio de rol y retiro, sobre la sesión del servidor.
5. Interfaz: sección de equipo visible solo para administradores, con listado de integrantes, cambio de rol, retiro, formulario de invitación y el enlace para compartir.
6. Pruebas: autorización por rol, invariante del último administrador, invitación repetida sin cambio de rol, integrante ajeno al tenant, y ausencia del enlace en los registros.
7. Documentación: matriz de capacidades publicada, fase en el registro y decisiones sobre el invariante y sobre la entrega del enlace.

## Riesgos

- El correo de Auth es el canal de entrega: depende del SMTP configurado en el proyecto y de que las plantillas apunten a `/auth/invite` con `{{ .TokenHash }}`.
- `APP_PUBLIC_URL` debe ser el dominio público del chat, tanto para la API como para la web: los enlaces antiguos siguen requiriendo que `${APP_PUBLIC_URL}/auth/callback` esté autorizado hasta que expiren.
- El enlace permite entrar a la cuenta: debe tratarse como credencial. Se envía solo al correo de la persona y no se registra.
- Un integrante retirado conserva su cuenta y podría pertenecer a otros tenants: el retiro afecta solo a la pertenencia, no a la persona.
- Cambiar el rol de alguien que está trabajando en ese momento afecta sus siguientes comandos; la API decide en cada petición, sin caché de permisos en la interfaz.
