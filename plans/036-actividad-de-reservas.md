# Plan de ejecución: Actividad de Reservas dentro de la aplicación

## Contexto leído

- `AGENTS.md`, `docs/ARCHITECTURE.md`, `specs/013-inbox-attention-and-continuation.md` (regla 10: la
  interfaz habla solo con su BFF)
- `D:\Documents\JEYSON\CAESPY\WEPLASH\Dashboard Reservas`: `README.md`, `js/core.js`, `js/domain.js`
- `apps/api/src/metrics` y `apps/web/app/page.tsx` (el patrón de un apartado nuevo)

## Qué es hoy

Un producto aparte, desplegado en `https://inside-spa-dashboard.vercel.app`, con su propio
repositorio. Son ficheros estáticos que leen y **escriben** el proyecto Supabase **SPA**
(`ncutewymymydclypuqlbfk`), que no es el nuestro. Tiene su propio inicio de sesión con una lista de
correos autorizados y usa la clave pública en el navegador.

## Clasificación

- Tipo: **central**
- Motivo: fuente de datos externa nueva, **escrituras** sobre otra base, permisos por rol y un
  apartado nuevo en la interfaz.

## Lo que se comprobó leyendo el dashboard (y cambió el diseño)

1. **Las decisiones se aplican por RPC**, no escribiendo tablas. Lo dice su propio código: las
   acciones permitidas «deben coincidir con el SQL del RPC». Nuestro API llamará a ese RPC y la base
   seguirá validando las transiciones: no duplicamos esa regla.
2. **La autoría ya existe**: la tabla de decisiones guarda `decided_by_email`. No hay que inventar
   quién decidió; hay que mostrarlo.
3. **El comprobante puede no tener fila.** El dashboard lo reconstruye desde la evidencia guardada en
   la pre-reserva; sin eso, el equipo vería reservas sin comprobante. Ya está mudado al dominio.
4. **Los KPIs tienen reglas propias**: «hoy» se mide por la fecha de **confirmación**, no por la de la
   cita; el aviso urgente son las retenciones de Pabau que expiran **en la próxima hora**; el monto
   pendiente se resuelve por prioridad (reserva → comprobante → evidencia → esperado) y se informa de
   dónde salió.
5. **El vocabulario pertenece a `packages/contracts`**, como `AutomationMode` y `ConversationStatus`:
   el dominio los importa. Hoy están en el dominio y hay que moverlos antes de escribir el contrato,
   o quedarían dos definiciones del mismo vocabulario.

## Diseño

- **Propietario de la regla:** `apps/api/src/reservations`. Las reglas del dashboard viven ya en el
  paquete de dominio, en TypeScript y con pruebas; la interfaz solo pinta.
- **Acceso a los datos:** la API lee y escribe el proyecto SPA desde el servidor, con sus dos
  variables (`SPA_SUPABASE_URL`, `SPA_SUPABASE_SECRET_KEY`) declaradas **solo** en el servicio `api`
  del stack. El navegador nunca las ve: ésa es la mejora de fondo frente a hoy.
- **Permisos:** cada extremo exige membresía y rol `admin` o `supervisor`.
- **Contratos:** uno de lectura para el tablero (KPIs y filas con filtros) y uno de escritura para la
  decisión. Las fechas viajan en texto ISO; los tipos del dominio usan `Date` y el mapeo ocurre en el
  servicio.
- **Sin copia de datos:** se lee en vivo del proyecto SPA. Una copia sería una segunda verdad que
  puede quedarse vieja justo en una decisión de pago.
- **Riesgos:** (1) escribir en una base ajena → un único camino de escritura, por RPC, con pruebas e
  idempotencia; (2) el estado crudo de esa base es tolerante (varios nombres para el mismo hecho) → se
  conserva tal cual, ya mudado; (3) los comprobantes son datos de pago → enlaces firmados, no
  direcciones públicas; (4) durante la transición conviven el dashboard viejo y el apartado nuevo →
  hay que acordar cuándo se retira el viejo para que no haya dos caminos decidiendo lo mismo.
- **Rollback:** el apartado se oculta por rol y los extremos quedan sin uso; no hay migración en
  nuestra base.

## Cortes

### Corte 1 — Reglas y lectura

- Hecho: vocabulario, ayudantes de valores y los cuatro normalizadores en `packages/domain`, con sus
  pruebas; y la lectura de las dos variables en `packages/config` (con «sin configurar» si faltan).
- Falta: mover el vocabulario a contratos, escribir el contrato del tablero y el extremo de lectura
  con rol.

### Corte 2 — El apartado

- `apps/web/app/page.tsx`, `globals.css` y la ruta interna del BFF: «Actividad de Reservas» en el
  menú, solo para admin y supervisor, con los KPIs, la lista y los filtros.

### Corte 3 — Decidir

- Contrato y extremo de decisión llamando al RPC, con autoría registrada y el mismo efecto que hoy
  (los flujos de n8n siguen funcionando). Pruebas: transición válida, imposible, decisión repetida.

### Corte 4 — Retirar el viejo y documentar

- Acordar con el equipo cuándo se apaga `inside-spa-dashboard.vercel.app` y anotarlo en
  `docs/DECISIONS.md`.

## Condición de detención

Detener y reportar si el RPC exigiera credenciales que no tenemos, si apareciera un dato personal en
claro que hoy viaje al navegador, o si el vocabulario no pudiera unificarse sin romper el contrato
existente.
