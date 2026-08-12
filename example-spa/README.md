# Ejemplo: plataforma de atención y reservas para un spa

Este ejemplo supone un spa de bienestar/estética que ya tiene un agente conversacional. El proyecto conecta mensajería por medio de Zernio, recibe eventos por webhook, permite reservar citas, clasificar conversaciones y enviar texto, imágenes y videos aprobados.

## Alcance de ejemplo

- Recepción de mensajes desde Zernio.
- Entrega del contexto al agente existente.
- Consulta de servicios y disponibilidad real.
- Creación de reservas sin doble asignación.
- Respuesta saliente por Zernio.
- Envío de imágenes y videos del catálogo aprobado.
- Etiquetas y respuestas rápidas internas.
- Escalamiento a una persona cuando corresponda.

## Riesgo que el método evita

Un arreglo local podría impedir visualmente seleccionar una hora ya ocupada. La solución correcta debe proteger la disponibilidad en el dominio y en la transacción de persistencia, porque dos clientes pueden reservar al mismo tiempo desde canales distintos.

Otro arreglo local podría decir: “si el usuario pregunta por limpieza facial, envía esta URL”. La solución correcta es un catálogo de medios asociado a servicios, con tipo, estado de aprobación, vigencia y compatibilidad de canal.

Ver `PROJECT_MAP.md`, `ARCHITECTURE.md`, `AGENTS.md` y `specs/booking-via-messaging.md`.
