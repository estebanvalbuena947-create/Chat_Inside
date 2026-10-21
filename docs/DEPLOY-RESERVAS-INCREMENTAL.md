# Reservas: ajuste incremental sobre el servidor

Se conserva el diseño aprobado de la especificación 042 y el plan 052. Este paquete
se integra sobre main d5fe22e con los cambios locales de horarios, métricas y adjuntos.
Los cinco archivos de producción se verificaron por SHA-256 con el servidor.

## Decisión de integración

El parche se calcula contra el contenido local pendiente del servidor y no contra main limpio.
El instalador comprueba todos los archivos afectados antes de escribir, respalda las fuentes y
las imágenes y usa el despliegue Swarm existente. No modifica secretos ni aplica migraciones.
Se conserva useOperationalToday y la validación estricta de fechas z.iso.date.
La regla vive en dominio; API entrega KPI y lista desde el mismo conjunto; BFF transmite alcance.

## Alcance y límites

Por gestionar incluye pending, review, info y processing por fecha de creación mexicana.
Todos los días incorpora históricos sin fecha. cancelando_expirada se excluye del conjunto.
No se inventan fechas ni se modifica el circuito de decisiones. La columna SPA created_at ya existe.
El RPC process_chat_reservation_decision falta en SPA: aprobar/rechazar/pedir información
requiere una corrección separada con identidad del actor y pruebas de integración.
La integración conserva el límite previo de 2000 filas por tabla.

## Rollback y comprobación manual

El respaldo conserva la fuente previa y las imágenes de cada servicio. Para volver a la imagen
anterior usar docker service update --image IMAGEN_PREVIA SERVICIO para api, web y worker.
No restaurar fuentes sobre cambios posteriores. No usar git reset, git clean ni Docker Compose.
Tras desplegar comprobar Hoy, una fecha elegida, Todos los días, KPI igual al listado,
registros sin fecha, cancelaciones excluidas y las tres réplicas sanas.
Un healthcheck correcto no demuestra que los botones de decisión funcionen.

## Validacion local del conjunto integrado

Instalacion congelada, format:check, lint, typecheck, test y build: salida 0.
Interfaz React comprobada en Chromium: Hoy, Todos los dias, fecha desconocida,
respuestas atrasadas, error y reintento, cancelacion, zona Tokio, movil y escritorio.
Parche comprobado sobre la base exacta: aplicacion, hashes y reversibilidad.
No se ejecuto este despliegue en el servidor; los botones de decision requieren
resolver por separado el RPC SPA ausente.
