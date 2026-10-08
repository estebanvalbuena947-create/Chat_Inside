# Plan de ejecución: Actividad de Reservas dentro de la aplicación

## Contexto leído

- `AGENTS.md`, `docs/ARCHITECTURE.md`, `specs/013-inbox-attention-and-continuation.md` (regla 10: la
  interfaz habla solo con su BFF)
- `D:\Documents\JEYSON\CAESPY\WEPLASH\Dashboard Reservas`: `README.md`, `js/domain.js`, `js/data.js`
- `apps/api/src/metrics` y `apps/web/app/page.tsx` (el patrón de un apartado nuevo)

## Qué es hoy

Un producto aparte, desplegado en `https://inside-spa-dashboard.vercel.app`, con su propio
repositorio. Son ficheros estáticos que leen y **escriben** el proyecto Supabase **SPA**
(`ncutewymymydclypuqlbfk`), que no es el nuestro: pre-reservas, comprobantes de pago, clientes,
histórico y decisiones. Tiene su propio inicio de sesión con una lista de correos autorizados y usa
la clave pública en el navegador.

Sus reglas ya están escritas y probadas en `js/domain.js`: decisiones (`approved`, `rejected`,
`needs_info`), estados (`pending`, `review`, `info`, `processing`, `confirmed`, `rejected`), KPIs,
filtros y construcción de clientes y comprobantes. **No hay que inventarlas: hay que mudarlas.**

## Clasificación

- Tipo: **central**
- Motivo: fuente de datos externa nueva, **escrituras** sobre otra base, permisos por rol y un
  apartado nuevo en la interfaz.

## Diseño propuesto

- **Propietario de la regla:** un módulo nuevo `apps/api/src/reservations`. Las reglas del dashboard
  se mudan al paquete de dominio en TypeScript, con sus pruebas; la interfaz solo pinta.
- **Acceso a los datos:** la API lee y escribe el proyecto SPA **desde el servidor**, con su clave en
  el `.env` del servidor. El navegador **nunca** la ve: esa es la mejora de fondo frente a hoy.
- **Permisos:** cada extremo exige membresía y rol `admin` o `supervisor`. Un agente no ve el
  apartado ni puede llamar a los extremos.
- **Contratos:** uno de lectura para el tablero (KPIs y filas con sus filtros) y uno de escritura para
  la decisión. El comprobante se sirve con enlace que caduca, no con una dirección pública.
- **Sin copia de datos:** se lee en vivo del proyecto SPA. Copiar sería una segunda verdad que puede
  quedarse vieja justo en una decisión de pago.
- **Autoría:** la decisión registra **quién** la tomó, dato que hoy no existe porque el dashboard
  autentica por lista de correos.
- **Riesgos:** (1) escribir en una base ajena → un único camino de escritura, con pruebas y
  idempotencia; (2) la forma del esquema tolerante del dashboard (varios nombres para el mismo
  estado) → se muda tal cual, no se «limpia» a la ligera; (3) los comprobantes son datos de pago →
  enlaces firmados; (4) durante la transición pueden convivir el dashboard viejo y el nuevo apartado
  → hay que decidir cuándo se retira el viejo para que no haya dos caminos decidiendo lo mismo.
- **Rollback:** el apartado se oculta por rol y los extremos quedan sin uso; no hay migración en
  nuestra base.

## Cortes

### Corte 1 — Lectura y reglas

- Archivos: `packages/domain` (reglas mudadas + pruebas), `apps/api/src/reservations` (servicio de
  lectura con rol), contrato del tablero, clave del proyecto SPA en el `.env` del servidor.
- Resultado verificable: el tablero responde con KPIs y filas reales, y un agente recibe 403.
- Pruebas: reglas de estado y KPIs del dashboard, tolerancia de esquema, permisos y caso sin datos.

### Corte 2 — El apartado

- Archivos: `apps/web/app/page.tsx`, `globals.css`, ruta interna del BFF.
- Resultado verificable: «Actividad de Reservas» aparece en el menú solo para admin y supervisor, y
  muestra el mismo tablero.
- Pruebas: tipos y contrato; la pantalla, como el resto del cliente, queda cubierta por tipos.

### Corte 3 — Decidir

- Archivos: contrato y extremo de decisión, servicio de escritura, dominio de la decisión, interfaz.
- Resultado verificable: aprobar, rechazar o pedir información desde nuestro apartado surte el mismo
  efecto que hoy en el dashboard (los flujos de n8n siguen funcionando) y queda registrada la autoría.
- Pruebas: transición válida, transición imposible, decisión repetida (idempotencia) y autoría.

### Corte 4 — Retirar el viejo y documentar

- Decidir con el equipo cuándo se apaga `inside-spa-dashboard.vercel.app`, y anotarlo en
  `docs/DECISIONS.md`.

## Condición de detención

Detener y reportar si la escritura exigiera otra vía (RPC o disparadores), si no se puede disponer de
la clave del proyecto SPA en el servidor, o si aparece un dato personal en claro que hoy viaje al
navegador.
