# Plan 031 - Multimedia de las conversaciones

- **Estado:** implementado y verificado en vivo
- **Fecha:** 2026-09-29
- **Especificación:** `specs/018-multimedia-de-las-conversaciones.md`

1. Dominio: clasificación del tipo declarado por el proveedor y cursor opaco de la galería, con pruebas de sus límites.
2. Datos: tabla `message_attachments` con unicidad por mensaje y posición, bucket privado `conversation-media` y un índice parcial para encontrar copias pendientes.
3. Descarga común: se extrajo la descarga segura de archivos remotos (solo `https`, direcciones públicas, sin redirecciones, con tope de tamaño) y ahora la comparten el avatar y la multimedia. El tipo se reconoce por bytes.
4. Ingesta: el normalizador lee los adjuntos de forma tolerante; el trabajador registra cada uno y copia el archivo, sin que nada de esto pueda hacer fallar el mensaje. Un reintento del webhook reintenta la copia que faltaba.
5. API: `GET …/media` paginado con el nombre del contacto y enlaces firmados en lote, más los adjuntos dentro del historial de mensajes.
6. Interfaz: la imagen se ve en la conversación y existe una vista **Multimedia** en lista con miniatura, buscador por nombre de contacto, filtro por tipo, visor a pantalla completa y salto a la conversación.
7. Pruebas: clasificación y cursor, registro y copia de un adjunto, fallo de descarga sin romper el mensaje, publicación compartida sin descarga, no repetir una copia ya hecha, y la galería con pertenencia y enlaces firmados.
8. Buscador y lista: el nombre del contacto se busca en dos pasos, igual que en la bandeja, y un término sin caracteres utilizables devuelve una página vacía.
9. Documentación: decisión registrada, procedimiento de migración y fase en el registro.

## Riesgos

- La migración debe aplicarse antes de que la ingesta guarde adjuntos: sin ella el trabajador anota el fallo y el mensaje se conserva, pero la multimedia no se registra.
- El consumo de almacenamiento crece con el uso; conviene definir una retención antes de que el volumen sea grande.
- Los adjuntos del histórico ya no se pueden recuperar: sus enlaces caducaron, así que la galería empieza vacía y se llena desde ahora.
- La descarga ocurre en el trabajador, no en la petición del webhook, así que no afecta al acuse de recibo del proveedor.
