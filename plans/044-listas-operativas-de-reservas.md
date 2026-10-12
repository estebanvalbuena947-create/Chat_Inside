# Plan de ejecución: listas operativas de reservas

## Contexto leído

- `AGENTS.md`, `docs/AI_CONTRACT.md`, `docs/PROJECT_MAP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`
- `specs/021-actividad-de-reservas-integrada.md`, `specs/030-listas-operativas-de-reservas.md`
- `apps/api/src/reservations`, `packages/domain/src/reservation-board.ts`, `apps/web/app/reservas/page.tsx`

## Clasificación

- Tipo: central.
- Motivo: amplía el contrato de lectura de una integración de reservas y presenta datos operativos.

## Diseño aprobado

- La política de fecha pertenece al dominio y usa la zona del negocio.
- La API autorizada construye las listas de hoy; la UI no recalcula reglas temporales.
- El contrato añade campos compatibles, sin migración ni nuevas credenciales.
- Riesgo: fecha sin valor o una zona local distinta. Se devuelven solo las filas con fecha válida y se
  prueba el borde de medianoche. Rollback: retirar las pestañas y dejar de consumir los campos aditivos.

## Cortes

1. Dominio y contrato: predicado de día operativo y listas aditivas.
2. API: filtro de confirmadas y creadas con la misma política.
3. UI: pestañas, conmutador Hoy/Todas y refresco de 30 segundos solo mientras la pantalla está
   visible, sin acceso directo a la integración.
4. Pruebas, controles y documentación.

## Condición de detención

Detener si la fuente no ofrece fecha de creación o confirmación, o si el contrato externo cambia su
semántica; no se infieren fechas a partir del horario de la cita.
