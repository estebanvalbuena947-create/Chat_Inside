# Plan 026 - Atención real y continuación de la bandeja

- **Estado:** implementado
- **Fecha:** 2026-09-28
- **Especificación:** `specs/013-inbox-attention-and-continuation.md`
- **Cierre:** los ocho pasos quedaron implementados y verificados en vivo. El conteo de no leídos por conversación se mantiene fuera de alcance.

1. Migración aditiva `conversation_reads` con claves compuestas por tenant, índice de consulta, RLS activa y privilegios revocados. Requiere aplicación manual autorizada.
2. Dominio: `nextReadMark` (avance monotónico), `clampReadMark` (acotar al mensaje más reciente), `needsAttention` (entrante posterior a la marca) y las utilidades puras de cursor y de saneado de búsqueda, con pruebas de invariantes, variantes y límites.
3. Contratos: campos aditivos `needsAttention`, `lastMessagePreview`, `lastMessageDirection`; parámetros `limit`, `cursor`, `search`; esquemas del comando de lectura.
4. API: listado con paginación por cursor, búsqueda en servidor, marcas de la persona solicitante y modelo de lectura de la vista previa; comando de lectura con guarda de concurrencia y sin tocar `conversations.updated_at`.
5. BFF: reenviar `cursor` y `search`; nueva ruta de lectura por conversación.
6. UI: indicador calculado por el servidor, marcar como leído al abrir y al recibir mensajes con la conversación a la vista, quitar el conjunto en memoria, botón de continuación al final de la lista y búsqueda contra el servidor con espera breve.
7. Pruebas: cursor (ida y vuelta, límites, cursor inválido), búsqueda (escapado, sin resultados, término vacío), lectura (monotonicidad, acotado, repetición, membresía, aislamiento), atención (entrante posterior, saliente que no genera atención, sin marca previa) y paginación agotada.
8. Cierre documental: estado de la especificación y del plan, fase en `docs/VALIDATION_LOG.md` y decisión en `docs/DECISIONS.md` sobre el propietario del modelo de lectura y el cursor.

## Riesgos

- La migración no se puede aplicar desde este equipo sin autorización: no hay cadena de conexión y el CLI no está autenticado.
- El cursor keyset debe ser estable con `last_message_at` nulo; se cubre con orden de nulos al final y desempate por identificador.
- Marcar al abrir genera una escritura por apertura; la guarda de concurrencia evita escrituras cuando la marca ya está adelante.
- El conteo de no leídos por conversación queda fuera de este corte: la interfaz muestra atención sí o no. Se puede agregar después mediante una función de lectura sin cambiar el contrato actual.
- La comprobación visual con la sesión real es obligatoria antes de cerrar, porque el indicador depende del recorrido completo entre abrir, leer y volver a la lista.
