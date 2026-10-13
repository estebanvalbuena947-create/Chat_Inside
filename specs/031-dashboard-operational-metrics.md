# Especificación: métricas operativas del Dashboard

- **Estado:** aprobada
- **Propietario:** `apps/api/src/metrics` y `apps/api/src/reservations`

## Regla

El Dashboard cuenta mensajes por dirección y por actor durante el período solicitado. El período
admite un día, siete, treinta o noventa días. Los mensajes entrantes son solo los de dirección
`inbound`; los enviados por Bot son `outbound` con `sender_type = automation`; los enviados por
asesor son `outbound` con `sender_type = agent`.

Las reservas se agrupan por su fecha de creación normalizada para la gráfica diaria. Las citas
agendadas son reservas confirmadas con horario programado; se muestran solo desde el tablero de
reservas, cuya autorización ya protege la API.
