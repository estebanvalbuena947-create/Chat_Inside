# Especificación: reserva de cita desde mensajería

- **Estado:** ejemplo aprobado
- **Zona horaria del negocio:** America/Bogota

## 1. Problema

Los clientes escriben para conocer servicios y reservar. El agente debe ayudar sin inventar disponibilidad, crear dobles reservas ni confirmar una cita que no quedó persistida.

## 2. Resultado esperado

Un cliente puede consultar un servicio, recibir horarios disponibles, seleccionar uno y obtener una confirmación solo después de que el sistema haya creado una cita válida.

## 3. No objetivos

- Cobro en línea.
- Diagnóstico o recomendación médica.
- Modificación automática de horarios laborales.
- Carga libre de imágenes o videos por parte del agente.
- Garantizar una opción mostrada antes de la confirmación final.

## 4. Reglas e invariantes

1. Toda opción proviene de Agenda y referencia servicio, duración, profesional y zona horaria.
2. Una cita confirmada no puede solaparse con otra que use el mismo recurso exclusivo.
3. La disponibilidad se revalida en la operación que crea la cita.
4. La confirmación al cliente ocurre después del commit exitoso.
5. Repetir la misma solicitud idempotente devuelve la misma cita, no crea otra.
6. El agente no transforma una etiqueta como `interesado` en evidencia de una reserva.
7. Si la intención, servicio, fecha o identidad son ambiguos, se solicita aclaración o se escala.
8. Los datos sensibles se limitan a lo necesario para prestar el servicio.

## 5. Flujo principal

1. El cliente solicita una cita para un servicio.
2. El sistema resuelve el servicio o pide aclaración.
3. Agenda devuelve opciones reales con tokens de corta duración.
4. El agente presenta opciones sin afirmar que están reservadas.
5. El cliente selecciona una opción.
6. `create_appointment` revalida y crea la cita de forma atómica.
7. El sistema genera un código de reserva.
8. Zernio envía la confirmación mediante una operación idempotente.

## 6. Alternativas y errores

- **Opción ocupada al confirmar:** no crear cita; consultar alternativas y comunicar el conflicto.
- **Webhook repetido:** registrar como ya procesado y devolver éxito sin repetir efectos.
- **Timeout al enviar confirmación:** reintentar con la misma clave idempotente; la cita no se duplica.
- **Agente devuelve un servicio inexistente:** rechazar la herramienta y solicitar nueva resolución.
- **Sin disponibilidad:** ofrecer otro rango, otro profesional o escalamiento.
- **Cliente cancela:** aplicar la transición permitida y confirmar después de persistir.

## 7. Casos límite

- Dos clientes confirman el mismo horario simultáneamente.
- El cliente responde a una lista antigua de opciones.
- Cambio de duración del servicio entre consulta y confirmación.
- Profesional bloqueado después de mostrar opciones.
- Mensajes fuera de orden.
- Zona horaria o fecha ambigua.
- Cliente ya tiene una cita equivalente.
- Reintento después de una respuesta HTTP incierta.

## 8. Datos y estados

### Cita

- `id`
- `customer_id`
- `service_id`
- `professional_id`
- `starts_at`
- `ends_at`
- `timezone`
- `status`
- `source_conversation_id`
- `idempotency_key`
- `created_at`

### Estados

- `pending` → `confirmed` | `cancelled`
- `confirmed` → `cancelled` | `completed` | `no_show`
- Los estados finales no regresan a `pending`.

## 9. Seguridad y privacidad

- Autorizar herramientas del agente en servidor.
- No incluir credenciales ni historial completo innecesario en el contexto.
- Censurar teléfono, notas y contenido sensible en logs.
- Mantener trazabilidad entre conversación, llamada de herramienta y cita.

## 10. Observabilidad

Métricas mínimas:

- solicitudes de disponibilidad;
- intentos de reserva;
- reservas confirmadas;
- conflictos de concurrencia;
- reintentos y duplicados;
- escalaciones;
- errores de Zernio;
- latencia desde mensaje hasta respuesta.

## 11. Pruebas antiatajo

1. Reservar distintos servicios y duraciones, no solo un caso fijo.
2. Probar varios profesionales y bloqueos.
3. Ejecutar dos confirmaciones concurrentes para el mismo recurso.
4. Repetir el mismo `event_id` y la misma clave idempotente.
5. Verificar que UI, agente y adaptador no puedan confirmar sin el caso de uso.
6. Verificar que cambiar el nombre de un servicio no rompa la lógica.

## 12. Criterios de aceptación

- [ ] Ninguna confirmación se envía antes de persistir la cita.
- [ ] Solo una de dos solicitudes concurrentes obtiene el mismo recurso exclusivo.
- [ ] Un webhook repetido no crea mensajes ni citas duplicadas.
- [ ] Un reintento saliente no entrega dos confirmaciones.
- [ ] Los horarios se muestran y almacenan de forma inequívoca en America/Bogota.
- [ ] Los errores presentan alternativas o escalamiento.
- [ ] Pruebas, lint, tipos y build pasan.
