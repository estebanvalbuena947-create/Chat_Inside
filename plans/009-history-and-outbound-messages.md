# Plan 009 — Historial local y envíos salientes de Zernio

- **Estado:** aprobado para implementación
- **Fecha:** 2026-08-13
- **Autorización:** el administrador confirmó que `ZERNIO_API_KEY` ya está configurada y autorizó continuar con historial y envío real desde la bandeja.

## Regla

Un agente con membresía del tenant puede leer únicamente los mensajes de una conversación de ese tenant y solicitar un texto saliente. Cada solicitud crea una sola fila local y un solo evento outbox atómico. El worker es el único componente que conoce la clave de Zernio y realiza el efecto externo con la misma clave de idempotencia. Un error o confirmación tardía no puede producir un segundo envío ni exponer datos a otro tenant.

## Diseño

1. La API propia entrega el historial local, paginado y validado, tras autenticar la sesión y comprobar pertenencia al tenant.
2. La creación de un mensaje saliente valida texto, conversación, cuenta de canal y clave UUID. La tabla `messages` conserva una restricción única completa por tenant y clave; un trigger privado crea el evento outbox dentro de la misma transacción.
3. El worker reclama de forma condicional cada evento pendiente. Resuelve la cuenta y la conversación por sus referencias externas propias; no deduce identificadores desde nombres o contenido. Solo entonces llama a `POST /v1/inbox/conversations/{conversationId}/messages` con Bearer e `Idempotency-Key`.
4. Una respuesta HTTP exitosa marca el mensaje como `sent` y completa el outbox. Fallos transitorios se reprograman con retraso acotado; errores definitivos o tres intentos fallidos dejan el mensaje y outbox como `failed` con un código seguro.
5. La interfaz consume solo rutas BFF internas, muestra el historial local y permite enviar texto explícitamente. No contiene secretos ni llama a Zernio/Supabase operativo.

## Compatibilidad, riesgos y rollback

- La migración solo expande: añade metadatos al outbox, sustituye un índice parcial por una restricción equivalente que también permite `NULL`, y añade un trigger para nuevas filas salientes. No modifica mensajes existentes.
- Un reinicio antes de completar un evento deja la fila `processing`; la recuperación de reclamaciones abandonadas sigue pendiente para producción. Los reintentos de esta entrega se limitan a tres antes de hacerlo visible como fallo.
- El rollback operativo es detener el worker de salida; los mensajes quedan guardados como `queued`/`pending` y no se pierde el historial. La reversión de esquema requiere retirar el trigger antes de retirar sus columnas.
- El primer corte solo admite texto. Adjuntos, sincronización de historial remoto y conciliación de estados `delivered/read` quedan fuera de este corte, para no inventar correlaciones del proveedor.

## Pruebas

- Aislamiento por tenant para historial y creación.
- Idempotencia: misma clave y mismo comando devuelve el mismo mensaje; clave reutilizada con otro contenido falla.
- Trigger/outbox: un mensaje `queued` origina un único evento.
- Adaptador: URL, cuenta y clave se forman sin inspeccionar IDs opacos; 2xx completa y los fallos siguen la política limitada.
- UI: carga del historial, estados de error y envío explícito.

## Corrección posterior

- Los mensajes entrantes persistidos usan el estado `received`. El contrato público de historial debe reconocer también los estados de entrada; la progresión monotónica de transporte aplica únicamente a estados salientes. Se cubre con prueba de contrato y de dominio.
