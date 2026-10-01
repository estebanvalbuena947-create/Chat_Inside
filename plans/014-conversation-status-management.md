# Plan 014 — Gestión segura de estado de conversaciones

- **Estado:** implementado y validado localmente
- **Fecha:** 2026-08-14

## Regla

Una persona con membresía en el tenant puede establecer de forma explícita una conversación en `open`, `pending` o `resolved`. La operación es idempotente: repetir el mismo estado no produce efectos externos. Una actualización concurrente no puede sobrescribir silenciosamente una decisión más reciente.

El mensaje entrante conserva la regla existente: solo reabre una conversación que estuviera `resolved`; no cambia una conversación `pending` por inferencia.

## Diseño

1. La migración aditiva incorpora `status_version` a `conversations`, iniciada en `1`. No elimina ni transforma estados existentes.
2. El contrato recibe un comando que contiene el estado objetivo y la versión que el usuario visualiza. La API valida sesión, membresía, identificadores y cuerpo antes de actualizar.
3. La actualización se condiciona por `tenant_id`, `conversation_id` y `status_version`. Si otra persona cambió el registro antes, la API responde un conflicto operable y la web vuelve a cargar los datos; nunca elige entre dos decisiones por el nombre de un usuario o por el orden local de pantallas.
4. Next.js ofrece un BFF autenticado; la interfaz muestra acciones según el estado actual y confirma el resultado con la conversación devuelta por la API. La UI no decide permisos ni escribe en Supabase directamente.
5. El cursor SSE incluye la actividad de conversaciones, para informar el cambio a otras sesiones del mismo tenant. No contiene el estado ni datos de contacto en el stream.

## Permisos y alcance

- Administrador, supervisor y agente pueden cambiar el estado de conversaciones del tenant al que pertenecen, conforme al mapa de proyecto.
- Un usuario sin membresía recibe `403`; una conversación inexistente dentro del tenant recibe `404`; un `status_version` obsoleto recibe `409` sin modificar datos.
- Esta fase no agrega asignación de agentes, etiquetas, automatización, n8n, archivos ni envío de mensajes.

## Riesgos, compatibilidad y rollback

- La migración es expandir-antes-de-contraer y compatible con las filas existentes.
- El único efecto es local en PostgreSQL; no se envía ningún evento a Zernio.
- El rollback operativo es ocultar las acciones de estado. La columna adicional y los estados ya existentes no interfieren con la bandeja ni el worker.
- El sondeo/SSE actual notificará la nueva marca de actividad sin exponer valores de la conversación.

## Pruebas

- Validación de estado, sesión, tenant, conversación y versión.
- Cambio válido, repetición idempotente, conflicto concurrente y conversación fuera de tenant.
- La entrada de un nuevo mensaje mantiene `pending` y reabre únicamente `resolved`.
- BFF sin sesión, interfaz ante éxito/conflicto y señal SSE opaca.
- Pruebas completas, tipos, lint, formato, build de API, migración y asesores de Supabase.

## Condición de detención

Detener antes de aplicar si la migración no es aditiva, si se requiere una política de asignación no definida o si los asesores de Supabase revelan un problema de seguridad nuevo.
