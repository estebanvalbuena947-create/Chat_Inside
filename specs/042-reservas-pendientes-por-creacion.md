# Reservas de UI Chat Zernio: pendientes por creación

- Diseño funcional aprobado por el usuario; destino corregido a UI Chat Zernio → Reservas.
- Fecha: 2026-10-20. Plan: `plans/052-reservas-pendientes-por-creacion.md`.

## Regla

Una prereserva por gestionar es pending, review, info o processing. La cancelación automática
`cancelando_expirada` queda fuera y se presenta como Cancelación por vencimiento. Confirmaciones
y decisiones mantienen su prioridad actual. No se infiere estado por fecha de vencimiento.

Creación usa únicamente created_at, creado_at o fecha_creacion. Revisión y cita nunca la sustituyen.
Hoy y la fecha elegida se interpretan en America/Mexico_City. Por defecto se muestran las creadas
en ese día; Todos los días incluye también las filas sin creación. KPI, monto pendiente y listado
de gestión se obtienen del mismo conjunto en dominio/API. Las confirmaciones conservan su fecha
propia. La API devuelve la lista porGestionar, el alcance y cuántas filas carecen de creación.

## Propietarios y contratos

Dominio decide estados y conjunto operativo; API autentica admin/supervisor y calcula listas;
BFF transmite date/draftScope; UI muestra el resultado. Contratos incorporan campos aditivos
con defaults para compatibilidad. Respuestas de filtros anteriores no reemplazan la selección.

## Datos y riesgos

SPA ya tiene created_at nullable con default now(), aplicada con autorización previa.
No se agrega otra migración ni se fechan filas históricas. Escritores que envíen NULL explícito
siguen dejando una ausencia visible. Las filas históricas se consultan con Todos los días.
El límite existente de 2000 filas de integración permanece; no se amplía en este corte.
No cambia autenticación, decisiones, workers ni otras funcionalidades pendientes del chat.

## Pruebas y rollback

Probar medianoche mexicana, navegador en otra zona, creación/revisión diferentes, fecha ausente,
lista y KPI iguales, todos los días, cancelaciones, permisos, respuestas atrasadas y ausencia de filas.
Pasar typecheck, lint, format:check, test y build antes del despliegue. No hay migración destructiva.
Rollback: imagen anterior de Swarm conservando columna y datos. No usar Docker Compose.
El acceso SSH actual rechaza la autenticación: entregar paquete aplicable y comandos comprobados
si no se restablece el acceso. No afirmar despliegue sin evidencia.
