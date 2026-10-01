# Plan 027 - Nombre visible de las cuentas conectadas

- **Estado:** implementado
- **Fecha:** 2026-09-28
- **Especificación:** `specs/014-channel-naming.md`

1. Contratos: esquema del comando de renombrado y su respuesta, reutilizando el resumen de canal existente.
2. API: comando de renombrado restringido a `admin`, con actualización acotada por tenant y proveedor, y `404` cuando la cuenta no pertenece al tenant.
3. Trabajador: leer el usuario de la cuenta desde los eventos entrantes y rellenar el nombre solo cuando esté vacío, con la condición aplicada en la escritura.
4. BFF: ruta de renombrado por canal.
5. Interfaz: mostrar el nombre en la lista de canales conectados y ofrecer nombrarlo o renombrarlo al administrador.
6. Pruebas: normalizador (usuario preferido sobre nombre comercial, y ausencia de ambos), trabajador (rellena vacío, no sobrescribe, no escribe sin dato) y API (rol, alcance por tenant, error visible, lista sin identificadores del proveedor).
7. Cierre documental: fase en el registro y decisión sobre la propiedad del nombre.

## Riesgos

- Un nombre puesto por el proveedor podría no ser el que el equipo quiere: por eso el rellenado ocurre una sola vez y cualquier miembro administrador puede corregirlo después.
- El nombre no es único: dos cuentas podrían llamarse igual si el equipo lo decide así. No se impone unicidad porque el nombre es una ayuda visual, no un identificador.
- Cambiar el nombre no altera la identidad de la cuenta ni sus conversaciones: la relación sigue siendo por identificador del proveedor.
