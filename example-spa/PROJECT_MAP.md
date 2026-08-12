# Spa — Mapa del proyecto

## Propósito

Atender clientes del spa por mensajería, resolver preguntas frecuentes, mostrar contenido aprobado y gestionar reservas basadas en disponibilidad real, con posibilidad de intervención humana.

## Actores

- **Cliente:** consulta servicios, recibe material y solicita, cambia o cancela una cita.
- **Agente conversacional existente:** interpreta intención y solicita casos de uso; no decide disponibilidad ni persiste reservas.
- **Recepcionista:** supervisa conversaciones, aplica etiquetas, corrige datos y toma control.
- **Administrador:** gestiona servicios, profesionales, horarios, respuestas rápidas y medios aprobados.
- **Zernio:** adapta los canales de mensajería y entrega/recibe eventos.

## Dominios centrales

### Catálogo de Servicios

- Propietario de nombre, duración, precio base, requisitos y estado de cada servicio.
- No determina disponibilidad.

### Agenda y Disponibilidad

- Propietario de horarios laborales, bloqueos, duración, recursos y capacidad.
- Decide si un intervalo puede reservarse.
- Impide solapamientos y doble reserva.

### Citas

- Propietario del ciclo de vida de una reserva y sus transiciones.
- Referencia cliente, servicio, profesional e intervalo confirmado.

### Clientes

- Propietario de identidad, datos de contacto, consentimientos y preferencias.

### Conversaciones

- Propietario del historial local, no leídos, asignación, etiquetas y escalamiento.
- No es fuente de verdad de las citas.

### Catálogo de Medios

- Propietario de imágenes y videos aprobados, asociación con servicios, tipo, URL/objeto, vigencia y compatibilidad por canal.
- No almacena URLs específicas en prompts o componentes.

### Integración Zernio

- Traduce webhooks y mensajes salientes.
- Maneja firma, deduplicación, idempotencia, timeout, estados y errores.
- No contiene reglas de reservas.

### Orquestación del Agente

- Entrega al agente herramientas limitadas para consultar servicios, disponibilidad, crear reservas y seleccionar medios.
- Valida la salida del agente antes de ejecutar efectos.

## Flujo principal de reserva

1. Zernio entrega un webhook.
2. El adaptador verifica firma y deduplica el evento.
3. Conversaciones guarda el mensaje y crea contexto seguro.
4. El agente identifica intención de reserva.
5. El caso de uso consulta Catálogo y Agenda.
6. Se muestran opciones reales al cliente.
7. El cliente selecciona una opción.
8. Citas intenta confirmar mediante una operación atómica.
9. Solo después del éxito se prepara la confirmación.
10. Integración Zernio envía la respuesta con idempotencia.
11. Si hay conflicto, se ofrecen nuevas opciones; nunca se confirma una hora perdida.
