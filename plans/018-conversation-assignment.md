# Plan 018 â€” Asignación segura de conversaciones

- **Estado:** implementado
- **Fecha:** 2026-08-14
- **Estado de cierre:** implementado y validado localmente

## Diseño aprobado

- Cambio central. Organización de atención es dueña de la regla; `TenantAccessService` conserva la consulta de membresías y la API de conversaciones coordina el comando.
- Una migración aditiva incorpora `assignment_version`. La asignación actual usa la FK compuesta existente `(tenant_id, assigned_user_id)` a `memberships`.
- El comando verifica identidad, rol actor, existencia de la conversación y pertenencia del destinatario antes de realizar una actualización condicionada por versión.
- La API lista integrantes con el cliente privilegiado exclusivamente en servidor; BFF y UI no reciben secretos ni consultan Supabase.

## Cortes

1. Contratos, migración, seguridad de base y tipos remotos.
2. Servicio/controladores/BFF con permisos, aislamiento, repetición y conflicto.
3. Selector de asignación en la bandeja y pruebas de los casos de autorización y concurrencia.
4. Controles del repositorio, asesores, revisión de diff y documentación.

## Riesgos y detención

- No continuar si la migración no es aditiva, si `anon`/`authenticated` obtienen privilegios sobre tablas operativas, o si un destinatario de otro tenant puede asignarse.
- El correo de miembros es dato personal de baja sensibilidad: se muestra solo a miembros autenticados del mismo tenant y no entra en logs o SSE.
