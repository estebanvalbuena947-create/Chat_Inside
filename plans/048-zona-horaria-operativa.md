# Plan 048 — Zona horaria operativa única

- **Estado:** implementado
- **Especificación:** `specs/038-zona-horaria-operativa.md`

## Clasificación

- Tipo: central.
- Motivo: la misma política temporal cruza las superficies operativas y debe ser idéntica para cada
  persona autorizada.

## Diseño aprobado

- Propietario: presentación compartida en `apps/web/lib/operational-time.ts`.
- La persistencia mantiene UTC; no hay migración, contrato nuevo ni efecto externo.
- La utilidad fija `America/Mexico_City` y `es-MX`, y proporciona hora, fecha, fecha-hora y llave de
  día para no duplicar conversiones locales.
- Riesgo: borde de medianoche y cambios históricos de zona; se usa el identificador IANA y se cubre
  con pruebas. Rollback: revertir los consumidores sin alterar datos.

## Cortes

1. Crear utilidad y pruebas del instante que cruza medianoche entre México y Colombia.
2. Sustituir formateos de Bandeja, multimedia, canales, Reservas y Reseñas.
3. Documentar la regla y revisar controles de tipos, lint, formato y pruebas.
