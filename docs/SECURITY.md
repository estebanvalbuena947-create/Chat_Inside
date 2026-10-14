# Seguridad y privacidad

## Principios

- Mínimo privilegio, validación en límites y defensa en profundidad.
- Datos y acciones se aíslan por `tenant_id`, sesión, capacidad y recurso.
- Los secretos no se guardan en Git, navegador, logs, pruebas ni mensajes.
- **No se usan datos reales de clientes en desarrollo, y hoy no se cumple.** La base de desarrollo tiene contactos reales mientras se trabaja en la migración. Es una norma a restablecer antes de abrir el producto a más gente, no una descripción de lo que hay.

## Autenticación y autorización

- Sesión de servidor en cookies `HttpOnly`, `Secure` y `SameSite`; nunca tokens de sesión en `localStorage`.
- MFA obligatorio para administradores y recomendado para supervisores.
- Cada acción verifica autenticación, capacidad de rol y pertenencia del recurso al tenant/alcance del usuario.
- RLS en PostgreSQL funciona como segunda barrera y se prueba contra acceso horizontal.
- CSRF, CORS de orígenes exactos, CSP estricta, escape de contenido y protección contra XSS son obligatorios.

## Webhooks y efectos externos

- Validar bytes crudos, tamaño máximo, firma autenticada y comparación en tiempo constante antes de procesar.
- Persistir y deduplicar por identificador de evento antes de responder; no ejecutar agente, descargas ni envíos dentro del webhook.
- Aplicar timeout, reintentos limitados con jitter, circuit breaker, backpressure y DLQ.
- No inventar firmas, encabezados, eventos ni límites de Zernio: **REQUIERE VERIFICACIÓN OFICIAL**.

## Archivos y multimedia

- Buckets privados, nombres internos aleatorios, cuotas por tenant y URLs firmadas de corta duración.
- Comprobar extensión permitida, tamaño, MIME declarado y real, firma binaria y SHA-256; analizar con antivirus antes de aprobar.
- Bloquear ejecutables disfrazados, SVG/HTML en MVP, acceso entre tenants y envío de archivos no aprobados.
- Al obtener medios externos, limitar hosts, DNS/IP privados, redirecciones, bytes y tiempo para prevenir SSRF.

## Agente n8n

- El Agent Gateway autentica el workflow con identidad de servicio o HMAC; el mecanismo concreto queda pendiente de validación.
- Envía contexto mínimo, sin claves, conexiones, conversaciones de otros tenants ni instrucciones privilegiadas.
- Valida estrictamente la salida; el agente devuelve IDs internos aprobados, nunca URLs arbitrarias.
- Cada herramienta se autoriza y valida por tenant; se limitan pasos, tiempo, costes y duplicados.
- Mensajes y adjuntos se tratan como entrada no confiable, incluso ante prompt injection.

## Secretos, privacidad y auditoría

- `service_role`, API keys y secretos de webhook solo existen en API, workers o gestor de secretos.
- Logs estructurados usan identificadores pseudonimizados y códigos seguros; no incluyen cuerpos completos, PII innecesaria, tokens, secretos ni URLs firmadas.
- Auditoría registra actor, tenant, recurso, acción, resultado y correlación, sin secretos.
- La retención, exportación y eliminación por tenant son decisiones pendientes antes de producción.

### La credencial de máquina de las tools

n8n llama a la API con una credencial de máquina (`tool_tokens`). La tabla guarda **solo su SHA-256**,
así que quien lea la base no puede usarla; el token existe en dos sitios y en ninguno más: la variable
`WEPLASH_TOOL_TOKEN` de n8n y la cabeza de quien lo generó.

**Si un token se expone** —pegado en un chat, en un ticket, en una captura—, se rota. Rotar es crear el
nuevo, ponerlo en n8n, probar y **después** revocar el viejo, en ese orden: revocar antes deja al bot sin
voz, porque todos los flujos leen la misma variable.

```powershell
.\tools\rotar-token-tool.ps1 -Listar          # qué credenciales hay y cuándo se usó cada una
.\tools\rotar-token-tool.ps1                  # crea una y muestra el token UNA vez
.\tools\rotar-token-tool.ps1 -RevocarId <id>  # cuando n8n ya trabaja con la nueva
```

El script genera el token con el generador criptográfico del sistema, calcula su huella y **no escribe
el token en ningún archivo**. Si Windows lo bloquea por la política de ejecución, se ejecuta con
`powershell -ExecutionPolicy Bypass -File`, sin cambiar la política del equipo.

La rotación no es solo por higiene: un token filtrado permite enviar mensajes, transferir y cerrar
conversaciones en nombre del bot, y la API no distingue quién está detrás. Vale la pena rotarlo también
cuando alguien deja el equipo.

## Operación segura

- Rate limiting por IP, usuario, tenant, conversación, carga y ejecución de agente.
- Escaneo de secretos, SAST, auditoría de dependencias, imágenes mínimas no-root, SBOM y backups/restauraciones probadas.
- Alertar por firmas inválidas, fallos de envío, colas envejecidas, 401/403/429, errores de aislamiento, antivirus no disponible y degradación del agente.
