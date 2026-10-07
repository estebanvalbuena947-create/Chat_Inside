# Especificación: conversiones Meta mediante Zernio

- **Estado:** implementada en su infraestructura; **pendiente la decision de negocio** sobre que hecho cuenta como conversion.
- **Responsable:** integración y observabilidad
- **Fecha:** 2026-10-01

**Cierre:** construida y revisada el 2026-10-06. Existen la configuracion por espacio con su validacion
contra Zernio, la cola de eventos con `event_id` idempotente, el cliente contra
`POST /v1/ads/conversions` y el entregador del trabajador (`apps/worker/src/conversion-sender.ts`, con
sus pruebas). **Lo que falta no es codigo**: es la fuente de negocio -que hecho cuenta como
conversion-, que esta especificacion declara como decision pendiente en su ultima seccion. Sin esa
decision no hay nada que enviar, y por eso no se envia nada.

## 1. Problema

El equipo necesita atribuir a campañas de Meta conversiones que ocurren después de una interacción atendida en Chat Zernio, sin otorgar a la aplicación un token de Conversions API de Meta ni exponer credenciales o datos de contacto en el navegador.

Zernio ya ofrece un relay de conversiones hacia la API nativa de Meta. La integración debe usar esa frontera: la aplicación decide y registra una conversión de negocio; Zernio autentica y entrega el evento a Meta.

## 2. Resultado esperado

Un administrador autorizado puede habilitar una configuración de conversiones por tenant para una cuenta de anuncios Meta ya conectada a Zernio y un destino (Pixel/Dataset) válido. Cuando una fuente de negocio explícitamente aprobada produzca una conversión, el worker la enviará una única vez de forma efectiva mediante Zernio y la UI mostrará su estado operativo sin revelar PII ni secretos.

## 3. No objetivos

- No crear, administrar ni extraer tokens de Meta, Pixels/Datasets, campañas o permisos de Meta Business.
- No considerar cada mensaje entrante, etiqueta, apertura de conversación o cambio de estado como conversión por defecto.
- No incorporar reglas de reservas, pagos, catálogo o agenda al dominio de Chat Zernio.
- No enviar conversiones hasta que exista una fuente de negocio y su mapeo de eventos aprobados.
- No mostrar nombres, correos, teléfonos, cuerpos de mensajes, API keys ni valores hasheados en la UI, auditoría o logs.

## 4. Actores y permisos

| Actor                    | Puede                                                                                                 | No puede                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Administrador del tenant | Configurar, validar, activar o pausar la integración; consultar estado agregado y fallos seguros.     | Ver secretos o operar configuraciones de otro tenant.                    |
| Supervisor y agente      | Consultar el estado de una conversión asociada a una conversación si su alcance ya les permite verla. | Configurar la integración, reenviar o crear conversiones manualmente.    |
| Worker                   | Entregar eventos pendientes autorizados y actualizar su resultado.                                    | Decidir que un mensaje es una conversión o usar recursos de otro tenant. |
| Zernio                   | Autenticar la solicitud con su API key y retransmitir a Meta.                                         | Convertirse en fuente de verdad del evento operativo local.              |

## 5. Reglas e invariantes

1. Una conversión se crea únicamente desde un hecho de negocio explícito, tipado y autorizado por su propio módulo; la UI de conversaciones no contiene la regla que la decide.
2. Toda configuración y conversión pertenece a un único `tenant_id`. La cuenta Meta Ads y el Pixel/Dataset se validan contra la configuración de Zernio del mismo tenant antes de activarse.
3. La aplicación usa el endpoint oficial de Zernio `POST /v1/ads/conversions`; el `accountId` es una cuenta Zernio de plataforma `metaads` y `destinationId` es el Pixel/Dataset de Meta. No se usa una cuenta de página o de mensajería como sustituto sin validación del proveedor.
4. Cada evento conserva un `event_id` estable, único por configuración, fuente y tipo de conversión. Un reintento reutiliza el mismo identificador y el mismo cuerpo semántico.
5. El evento local y su outbox se escriben en la misma transacción. Ningún webhook, petición de UI ni transacción de negocio espera a Meta.
6. Los datos de coincidencia se minimizan. Cuando una fuente autorizada aporte PII, se transmite solamente a Zernio por conexión servidor a servidor; Zernio realiza el hash conforme a su contrato documentado. La aplicación no guarda hashes adicionales salvo que una futura especificación lo justifique.
7. Un resultado fallido es visible y operable. Los errores transitorios tienen timeout, reintentos limitados con jitter y DLQ; los definitivos no se reintentan indefinidamente.
8. La UI muestra estado, tipo, fecha y correlación segura; nunca permite editar el cuerpo de un evento ni forzar un reenvío sin una operación autorizada e idempotente.

## 6. Flujo principal

1. Un módulo de negocio aprobado emite una intención `conversion.requested` con tenant, fuente estable, tipo de evento, instante y datos mínimos de coincidencia permitidos.
2. El servicio de conversiones autoriza la configuración activa, valida la fuente y persiste una conversión local junto con un evento outbox idempotente.
3. El worker reclama el outbox, crea el cuerpo para `POST /v1/ads/conversions` y usa la API key de Zernio exclusivamente desde servidor.
4. Zernio recibe `accountId`, `destinationId` y los eventos; la aplicación registra el resultado, incluyendo `traceId`, cantidades aceptadas/fallidas y códigos seguros por evento.
5. La API publica el cambio a la UI mediante los mecanismos internos existentes. La UI consulta el detalle autorizado por REST y no llama a Zernio.

## 7. Flujos alternos y errores

- Configuración inactiva o inexistente -> la intención no crea un envío externo y queda rechazada con un código operable.
- Cuenta no `metaads`, Pixel/Dataset no disponible o configuración de Zernio inválida -> no se activa la configuración; el administrador ve el motivo seguro.
- `401`/`403` de Zernio -> marcar fallo de credencial o permiso, pausar entregas posteriores de esa configuración y alertar a administradores.
- `429`, timeout o `5xx` -> reintentar con backoff limitado, conservando exactamente el mismo `event_id`; al agotarse, enviar a DLQ.
- Evento inválido o rechazo de Meta informado por Zernio -> fallo definitivo por evento; no repetir sin corregir la fuente o configuración.
- Respuesta parcial -> registrar cada resultado por evento y reintentar solo los que Zernio clasifique como transitorios.
- Duplicado local o entrega incierta -> conservar el mismo `event_id`; Meta y Zernio realizan la deduplicación prevista por contrato.

## 8. Casos límite

- Dos workers reclaman el mismo outbox: solo uno obtiene el lease; el otro no envía.
- El worker cae después de entregar a Zernio pero antes de persistir la respuesta: el nuevo intento reutiliza el `event_id`.
- El contacto no aporta datos de coincidencia suficientes: la fuente puede crear el evento solo si la política del tipo lo permite; de lo contrario queda rechazado sin envío.
- La cuenta de anuncios se desconecta tras la activación: los nuevos envíos se pausan, no se redirigen a otra cuenta y se conserva el historial.
- Un administrador cambia el Pixel/Dataset: la configuración nueva se versiona; eventos ya creados conservan el destino con que fueron autorizados.
- Un usuario intenta consultar conversiones de otro tenant: `403`, sin filtrar existencia ni detalles.

## 9. Datos y contratos

### Persistencia propuesta

- `conversion_integrations`: configuración versionada por tenant, referencia de cuenta Zernio, destino Pixel/Dataset, estado (`draft`, `active`, `paused`, `invalid`), fecha de validación y auditoría. No almacena API keys.
- `conversion_events`: intención de negocio inmutable con fuente, tipo de evento, instante, `event_id`, versión de integración, estado (`pending`, `sending`, `accepted`, `failed`, `dead_letter`) y correlaciones seguras.
- `conversion_delivery_attempts`: intentos, tiempos, resultado, código seguro y `trace_id`; sin PII ni cuerpo HTTP completo.
- Un outbox de conversión con clave de idempotencia, lease y reintentos, integrado con la infraestructura existente.

### Contrato externo validado

- Zernio: `POST https://zernio.com/api/v1/ads/conversions` con `Authorization: Bearer <ZERNIO_API_KEY>`.
- Cuerpo: `accountId`, `destinationId`, `events[]`; para Meta, `destinationId` es el Pixel/Dataset. Cada evento incluye como mínimo `eventName`, `eventTime`, `eventId` y los datos de usuario permitidos.
- Zernio infiere la plataforma desde `accountId`, retransmite a Meta Graph API, hashea PII del evento en servidor, admite lotes y devuelve `eventsReceived`, `eventsFailed`, `failures[]` y `traceId`.
- Límite documentado de Meta mediante Zernio: hasta 1.000 eventos por solicitud; un evento malformado puede rechazar el lote completo. El worker agrupa solo eventos compatibles y aísla/reclasifica fallos antes de reintentar.

Fuentes: [enviar eventos de conversión](https://docs.zernio.com/conversions/send-conversions) y [listar destinos de conversión](https://docs.zernio.com/conversions/list-conversion-destinations).

## 10. Seguridad y privacidad

- `ZERNIO_API_KEY` existe solo en API/worker y el gestor de secretos; nunca en `apps/web`, migraciones, pruebas, logs o respuestas HTTP.
- Antes de activar, el backend consulta destinos permitidos de Zernio y verifica que cuenta y destino correspondan al tenant. La UI nunca acepta como verdad un ID que no haya sido validado.
- Se requiere autorización de administrador para toda mutación de configuración; el resto de las lecturas se limita por tenant, rol y recurso.
- La minimización de datos es obligatoria. La base conserva identificadores internos y resultados operativos; no duplica PII para analítica publicitaria.
- Se registra consentimiento cuando la fuente de negocio lo aporte. Si el consentimiento es denegado, el adaptador envía la semántica de procesamiento limitado indicada por Zernio/Meta o rechaza el envío cuando la política lo exija.
- Rate limits por tenant y configuración, límite de tamaño de lote, validación estricta de tipos/fechas y protección contra SSRF (no se admiten URLs arbitrarias) son obligatorios.

## 11. Observabilidad

- Logs estructurados: `tenant_id` pseudonimizado, `conversion_event_id`, versión de integración, estado, código seguro, número de intento y `trace_id`; sin PII, hashes, tokens ni cuerpo de mensaje.
- Métricas: creados, enviados, aceptados, fallidos por código, antigüedad de outbox, reintentos, DLQ y calidad de coincidencia si Zernio la provee.
- Alertas: credencial/permisos inválidos, incremento de fallos definitivos, `429`, DLQ no vacía y cola envejecida.
- Auditoría: actor administrativo, tenant, cambio de configuración, transición de estado y correlación; no conserva secretos.

## 12. Migración y rollback

- Migración aditiva de tablas, índices, RLS y tipos de estado. No cambia conversaciones, mensajes ni canales existentes.
- Despliegue por fases: esquema y lectura -> configuración en borrador -> validación de destino -> activación por tenant -> primera prueba controlada con código de prueba de Meta cuando esté disponible.
- Rollback: pausar la configuración para detener nuevos envíos y workers; el historial permanece para auditoría. Las tablas aditivas no se eliminan durante el rollback.
- Si Zernio deja de soportar el contrato, se pausa la integración; no se cambia automáticamente a Meta directo ni a otro proveedor.

## 13. Plan de pruebas

- Unitarias: validación de configuración, fuente autorizada, construcción de `event_id`, transiciones de estado, clasificación de errores y minimización de datos.
- Integración: transacción conversión/outbox, RLS por tenant, lease concurrente, timeout, reintentos, `401/403/429/5xx`, respuesta parcial y DLQ.
- Contrato: cliente Zernio contra fixtures de `POST /v1/ads/conversions`, límite de 1.000, `traceId`, fallos por evento y consentimientos.
- E2E: administrador valida y activa una integración; la UI refleja envío/fallo seguro; usuario sin rol no puede configurarla ni consultar otro tenant.
- Antiatajo: múltiples canales Meta, destinos inválidos, reintentos posteriores a caída, mismo hecho emitido dos veces, evento sin PII suficiente y evidencia de que un mensaje entrante aislado no crea una conversión.

## 14. Criterios de aceptación

- [ ] Una configuración solo puede activarse si Zernio valida una cuenta `metaads` y el Pixel/Dataset para el tenant correspondiente.
- [ ] Todo envío a Meta sale únicamente desde el worker a través de Zernio, con `event_id` estable e idempotencia ante reintentos y caídas.
- [ ] La UI permite a administradores observar y pausar la integración sin revelar secretos ni PII.
- [ ] No existe regla que convierta automáticamente un mensaje o una interacción de UI en `Lead`, `Purchase` u otro evento.
- [ ] Errores, límites, respuesta parcial y desconexión de cuenta se convierten en estados operables y trazables.
- [ ] Todos los controles de calidad aplicables pasan.
- [ ] La documentación y las decisiones de implementación quedan actualizadas.
