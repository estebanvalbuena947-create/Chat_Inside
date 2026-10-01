# Plan 018 â€” AsignaciÃ³n segura de conversaciones

- **Estado:** en implementaciÃ³n
- **Fecha:** 2026-08-14
- **Estado de cierre:** implementado y validado localmente

## DiseÃ±o aprobado

- Cambio central. OrganizaciÃ³n de atenciÃ³n es dueÃ±a de la regla; `TenantAccessService` conserva la consulta de membresÃ­as y la API de conversaciones coordina el comando.
- Una migraciÃ³n aditiva incorpora `assignment_version`. La asignaciÃ³n actual usa la FK compuesta existente `(tenant_id, assigned_user_id)` a `memberships`.
- El comando verifica identidad, rol actor, existencia de la conversaciÃ³n y pertenencia del destinatario antes de realizar una actualizaciÃ³n condicionada por versiÃ³n.
- La API lista integrantes con el cliente privilegiado exclusivamente en servidor; BFF y UI no reciben secretos ni consultan Supabase.

## Cortes

1. Contratos, migraciÃ³n, seguridad de base y tipos remotos.
2. Servicio/controladores/BFF con permisos, aislamiento, repeticiÃ³n y conflicto.
3. Selector de asignaciÃ³n en la bandeja y pruebas de los casos de autorizaciÃ³n y concurrencia.
4. Controles del repositorio, asesores, revisiÃ³n de diff y documentaciÃ³n.

## Riesgos y detenciÃ³n

- No continuar si la migraciÃ³n no es aditiva, si `anon`/`authenticated` obtienen privilegios sobre tablas operativas, o si un destinatario de otro tenant puede asignarse.
- El correo de miembros es dato personal de baja sensibilidad: se muestra solo a miembros autenticados del mismo tenant y no entra en logs o SSE.
