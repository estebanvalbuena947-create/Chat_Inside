# Spa — Arquitectura

## Vista de alto nivel

```text
Canales de mensajería
        │
        ▼
      Zernio
        │ webhook firmado
        ▼
Adaptador de entrada ──► Registro de eventos/deduplicación
        │
        ▼
Servicio de Conversaciones
        │ contexto permitido
        ▼
Orquestador del Agente
   ┌────┼──────────────┐
   ▼    ▼              ▼
Catálogo Agenda       Medios
        │              │
        ▼              │
      Citas            │
        └──────┬───────┘
               ▼
      Adaptador de salida Zernio
               │
               ▼
             Cliente
```

## Límites

### Adaptador Zernio

- Verifica autenticidad.
- Normaliza identificadores, canal, texto y adjuntos.
- Registra `event_id` con restricción única.
- Responde rápido y delega procesamiento.
- Traduce errores del proveedor a estados internos.

### Orquestador del agente

El agente no recibe acceso directo a base de datos ni credenciales. Usa herramientas de aplicación con contratos explícitos:

- `list_services(criteria)`
- `find_available_slots(service_id, date_range, professional_preference)`
- `create_appointment(customer_id, service_id, slot_token)`
- `get_approved_media(service_id, media_type, channel)`
- `escalate_conversation(reason)`

Cada herramienta valida autorización, entrada y estado actual.

### Reserva atómica

`create_appointment` debe validar nuevamente el horario dentro de la misma transacción que crea la cita. Un token de horario expira y no garantiza disponibilidad por sí solo.

La base de datos debe impedir solapamientos mediante una estrategia adecuada al modelo: restricción de exclusión por intervalo, bloqueo transaccional, recurso de capacidad o equivalente probado.

### Multimedia

El agente solicita medios por intención; el servicio de Medios selecciona un recurso aprobado. Antes de enviar se valida:

- estado activo y aprobado;
- tipo permitido;
- disponibilidad del archivo;
- compatibilidad del canal;
- tamaño y formato según configuración vigente;
- URL pública temporal o carga segura, según el proveedor.

No se realiza transcodificación implícita dentro del flujo de conversación.

### Consistencia

- Citas y disponibilidad: consistencia fuerte en la confirmación.
- Mensajería y estados de entrega: consistencia eventual con reconciliación.
- Etiquetas y respuestas rápidas: almacenamiento local; no alteran la reserva.
