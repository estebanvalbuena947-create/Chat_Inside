# Especificación: listas operativas de reservas

- **Estado:** implementada
- **Responsable:** reservas y presentación
- **Fecha:** 2026-10-12

## Problema

El tablero mostraba los indicadores de confirmaciones, pero no daba una lista separada de reservas
confirmadas ni de pre-reservas creadas. El equipo no podía inspeccionar la operación del día sin
inferirla desde los indicadores o abrir registros no relacionados.

## Resultado esperado

Los administradores y supervisores pueden abrir las vistas **Confirmadas** y **Creadas** en Reservas,
ver por defecto las filas operativas de hoy, seleccionar otra fecha mediante un calendario y alternar a todas las disponibles. Mientras la pantalla
está visible, se actualiza cada 30 segundos y conserva el botón de actualización manual.

## No objetivos

- No se crea, edita ni elimina una reserva.
- No se copia la base externa ni se exponen sus credenciales al navegador.

## Actores y permisos

| Actor                      | Puede                                            | No puede                               |
| -------------------------- | ------------------------------------------------ | -------------------------------------- |
| Administrador o supervisor | Consultar las listas y gestionar una pre-reserva | Acceder a la base externa directamente |
| Agente                     | No recibe acceso a Reservas                      | Ver importes o datos de reservas       |

## Reglas e invariantes

1. «Hoy» y cualquier fecha elegida se calculan en `America/Mexico_City`, la zona operativa del negocio, en el servidor.
2. Una confirmada se clasifica por su fecha de confirmación; una creada, por la entrada de la
   pre-reserva. Las citas agendadas se clasifican por su horario programado.
3. La UI solo consume el BFF existente y presenta las listas que calcula la API autorizada.

## Datos, seguridad y rollback

La respuesta del tablero incorpora listas aditivas `confirmadasHoy` y `creadasHoy`; no hay migración
ni secreto nuevo. Se conserva `confirmadas` y `preReservas` para la opción «Todas». El rollback
retira las dos pestañas y los campos aditivos permanecen compatibles con lectores actualizados.

## Plan de pruebas

- Unitarias: comparación de día en la zona operativa, incluidos borde de medianoche y fecha ausente.
- Tipos: contratos, servicio y UI con las listas nuevas.

## Criterios de aceptación

- [x] Se pueden ver reservas confirmadas y pre-reservas creadas desde Reservas.
- [x] Ambas vistas abren en «Hoy» y permiten ver todas las filas.
- [x] La clasificación temporal se ejecuta en la API y respeta la zona del negocio.
- [ ] Controles de calidad completos superados.
