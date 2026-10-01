# Plan 029 - Biblioteca compartida y permisos por rol

- **Estado:** implementado
- **Fecha:** 2026-09-28
- **Especificación:** `specs/015-perfiles-acceso-e-invitaciones.md`

1. Permisos: la biblioteca de etiquetas pasa de solo administradores a administradores y supervisores, porque el supervisor es quien organiza la operación.
2. Respuestas rápidas: cualquier integrante crea y administra las que creó; supervisores y administradores administran todas. La regla evita que dos personas reescriban a la vez el texto que la otra está usando.
3. Contrato: la respuesta rápida expone `canManage` para que la interfaz muestre solo lo que cada persona puede hacer, sin que la regla viva en el componente visual.
4. API: la autoría se resuelve en el servicio, comparando el rol vigente del solicitante con el autor guardado; la interfaz solo refleja la decisión.
5. Interfaz: los controles de administración de etiquetas aparecen para administradores y supervisores, y los de respuestas rápidas según `canManage`.
6. Documentación: matriz de capacidades publicada y decisión registrada.

## Riesgos

- Cambiar un rol afecta los siguientes comandos, no los que ya están en vuelo: la API decide en cada petición.
- Un agente puede sentirse limitado al no poder corregir una respuesta de otra persona; el camino previsto es pedírselo a un supervisor, y la interfaz lo explica en lugar de ocultar el botón sin motivo.
