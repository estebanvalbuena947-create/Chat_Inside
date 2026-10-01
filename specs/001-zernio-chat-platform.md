# Especificación: plataforma de atención por chat Zernio

- **Estado:** aprobada; historial local y envío de texto autorizados
- **Responsable:** producto y arquitectura
- **Fecha:** 2026-08-13

## 1. Problema

Los equipos de atención necesitan operar de forma segura y trazable conversaciones de canales externos sin depender de una UI de proveedor ni dar acceso directo al agente conversacional a datos o secretos.

## 2. Resultado esperado

Una plataforma multi-tenant que presente una bandeja de conversación actualizada en tiempo real, permita responder texto e imágenes/videos aprobados, y coordine un agente n8n según modo y permisos.

## 3. No objetivos

- Reservas, citas, agenda, disponibilidad, pagos, pedidos y catálogos comerciales.
- Crear, cambiar o reconstruir el workflow n8n.
- Integrar o configurar proveedores reales durante la documentación.

## 4. Actores y permisos

| Actor         | Puede                                                                | No puede                                     |
| ------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| Administrador | Gestionar usuarios, etiquetas, respuestas, integraciones y auditoría | Acceder fuera de su tenant                   |
| Supervisor    | Ver equipo, asignar, cambiar modo y revisar fallos                   | Administrar configuración global sin permiso |
| Agente        | Operar conversaciones autorizadas y solicitar ayuda                  | Administrar usuarios o ver otros tenants     |
| n8n           | Devolver respuesta, sugerencia o handoff validable                   | Llamar Zernio/Supabase o recibir secretos    |

## 5. Reglas e invariantes

1. Cada recurso y consulta operativa pertenece a un tenant verificable.
2. Un evento o comando repetido produce como máximo un efecto externo.
3. Los estados de mensaje no retroceden por eventos tardíos.
4. Solo medios aprobados, del tenant y compatibles con el canal se envían.
5. Handoff pausa n8n en la conversación salvo política aprobada.

## 6. Flujo principal

1. Zernio entrega un evento auténtico.
2. La API lo valida y persiste como inbox deduplicado.
3. El worker lo procesa, actualiza el modelo local y comunica el cambio por SSE.
4. Cuando proceda, el worker consulta al Agent Gateway.
5. Una respuesta humana autorizada se registra con outbox y el worker gestiona el envío idempotente. El primer corte de envío admite texto; los adjuntos permanecen sujetos a su flujo de aprobación.

## 7. Flujos alternos y errores

- Firma inválida → rechazo sin procesar y métrica de seguridad.
- Evento duplicado → respuesta exitosa sin repetir efectos.
- Timeout de proveedor → reintento limitado con la misma clave.
- Archivo no aprobado → no se crea envío.
- n8n inválido, pausado o con circuit breaker abierto → error/sugerencia operable sin envío automático.

## 8. Datos y contratos

Entidades mínimas: tenants, users, memberships, channel_accounts, contacts, conversations, messages, message_attachments, labels, canned_responses, assignments, webhook_events, outbox_events, agent_runs, media_assets, audit_logs y sync_checkpoints.

Los contratos externos de Zernio y n8n se congelarán después de evidencia oficial y pruebas de staging. La salida n8n de la especificación maestra es preliminar.

## 9. Seguridad y privacidad

Aplicar autenticación de sesión segura, MFA administrativa, autorización de tres capas, RLS, webhook autenticado, Storage privado, escaneo de archivos, control SSRF, secretos fuera de Git, trazabilidad sin PII innecesaria y límites de abuso.

## 10. Migración y rollback

No existen datos ni esquema actual. Las migraciones futuras deberán expandir antes de contraer, ser versionadas, comprobadas contra una base temporal y acompañarse de rollback y reconciliación.

## 11. Plan de pruebas

- Unitarias: máquinas de estados, permisos, HMAC, idempotencia y elegibilidad de medios.
- Integración: RLS, inbox/outbox, PostgreSQL/Redis, archivos y adaptadores simulados.
- E2E: inbox, envío, etiquetas, asignación, modos, reintentos y accesibilidad.
- Contrato: Zernio y n8n reales en staging.

## 12. Criterios de aceptación

- [ ] El alcance no contiene dominios de reservas, agenda, pagos ni spa operativo.
- [ ] El diseño separa UI, API, worker, proveedor y n8n.
- [ ] Todo flujo externo contempla autenticidad, idempotencia, errores y trazabilidad.
- [ ] La seguridad multi-tenant y de archivos está documentada.
- [ ] Las decisiones y pendientes humanos están registrados.
