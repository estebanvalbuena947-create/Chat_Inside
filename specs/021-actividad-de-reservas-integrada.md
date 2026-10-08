# Especificación: actividad de reservas integrada

- **Estado:** implementada
- **Responsable:** reservas y presentación
- **Fecha:** 2026-10-08

## Problema

El tablero de reservas y su BFF ya existen, pero viven en una ruta aislada (`/reservas`) sin
entrada desde la bandeja. El equipo no puede descubrirlo ni operarlo como parte de su flujo diario.

## Resultado esperado

Administradores y supervisores ven **Reservas** en la navegación del inbox y abren el tablero dentro
del mismo espacio de trabajo. La interfaz consume únicamente `/api/reservations/board`.

## No objetivos

- No se crean ni cambian reservas desde esta entrega.
- No se expone la base SPA ni sus credenciales al navegador.
- No se retira todavía la ruta directa `/reservas`.

## Reglas e invariantes

1. La API es la única autoridad para decidir si el rol puede ver datos de reservas.
2. La UI solo ofrece el acceso a `admin` y `supervisor`; un agente no recibe un atajo visible.
3. La vista integrada y la ruta directa reutilizan el mismo panel y BFF, para no duplicar reglas ni
   lecturas.
4. Un tablero sin configurar, sin permiso o con fallo externo conserva el error operable devuelto por
   el BFF.

## Seguridad y rollback

No hay migración ni nuevos secretos. El rollback consiste en retirar el botón de navegación; la ruta,
la API y los datos no se modifican.

## Criterios de aceptación

- [x] Admin y supervisor pueden abrir Reservas desde el inbox.
- [x] Agente no ve el acceso.
- [x] La vista usa el BFF existente y conserva sus estados de error.
- [x] La ruta directa sigue disponible.
