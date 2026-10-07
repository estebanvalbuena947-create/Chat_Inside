# Plan de ejecución: plantillas aprobadas de WhatsApp

## Contexto leído

- `AGENTS.md`, `docs/ARCHITECTURE.md`
- `specs/002-canned-responses.md` (el patrón de Respuestas rápidas, al lado del cual va el panel)
- `apps/api/src/zernio/zernio-channel.service.ts` y `zernio-api.client.ts`
- Contrato real de Zernio, comprobado contra su API (no contra su web)

## Clasificación

- Tipo: **central**
- Motivo: integración externa nueva (lectura de plantillas de Meta a través de Zernio), contrato
  público nuevo y una pantalla nueva. Afecta a API y a interfaz.

## Lo que se comprobó antes de diseñar

- `GET /v1/whatsapp/templates?accountId=<cuenta>` responde **200** con `{ success, templates: [] }`.
  Sin `accountId`: 400. Esa ruta es la única; las variantes con la cuenta en el camino dan 404.
- La cuenta `6ac58bb0314baab5979241de` todavía **no tiene ninguna plantilla** listada, aunque el
  equipo ya creó una: Meta la tiene en revisión. Por eso la lectura es tolerante.
- Para enviar, Zernio recibe el campo `template` con `{ elements: [{ name, language, components }] }`
  y **resuelve el par aprobado antes de enviar**: si no coincide, no manda nada y devuelve el motivo.

## Diseño propuesto

- **Propietario de la regla:** `apps/api/src/zernio` (la cuenta de canal y su catálogo viven ahí).
- **Contrato nuevo:** `whatsappTemplateSchema` (`name` obligatorio; `language`, `category` y `status`
  anulables) y `whatsappTemplateListResponseSchema`.
- **Ruta:** `GET /v1/tenants/:tenantId/channels/whatsapp/templates`, bajo la ruta de canales que ya
  existe, porque el catálogo es de la cuenta y no del espacio entero.
- **Sin tabla nueva.** Las plantillas son de Meta y se leen en vivo: copiarlas a nuestra base sería
  otra copia que puede quedar vieja.
- **Lectura tolerante:** se toman los cuatro campos del contrato y se ignora lo demás; una plantilla
  sin nombre se descarta, porque sin nombre no hay nada que mostrar ni que enviar. La misma plantilla
  en dos cuentas no se duplica: manda la primera que la declara.
- **Sin cuenta de WhatsApp conectada** devuelve lista vacía, no un error: es la verdad, y la pantalla
  no tiene que entender un fallo.
- **Riesgos:** (1) que el proveedor cambie los nombres de los campos → la lectura tolerante los deja
  en nulo en lugar de romper; (2) que el estado de la plantilla cambie en Meta → el panel muestra lo
  que devuelve el proveedor en el momento de abrirlo; (3) consultar en cada apertura del panel → se
  pide al abrir, no al cargar la bandeja, y es una sola petición.
- **Rollback:** la pantalla puede retirarse y el extremo quedar sin uso; no hay datos que revertir.

## Cortes

### Corte 1 — verlas (hecho)

- Contrato, método del cliente de Zernio, método de servicio, ruta del API, ruta interna de la web
  (BFF) y el panel junto a Respuestas rápidas, visible **sólo** en conversaciones de WhatsApp.
- Pruebas: 7 (lectura tolerante, descarte sin nombre, sin duplicados, motivo del proveedor conservado,
  lista vacía sin cuenta y cuenta sin identificador).

### Corte 2 — usarlas (pendiente)

- Enviar con plantilla para poder escribir fuera de la ventana de 24 horas: contrato del mensaje,
  servicio de envío y trabajador. Merece su propio diseño, porque toca todo el camino de salida.

## Condición de detención

Detener y reportar si el proveedor cambia el contrato de las plantillas, si aparece la necesidad de
guardar estado propio, o si el envío con plantilla exige credenciales de Meta que hoy no tenemos.
