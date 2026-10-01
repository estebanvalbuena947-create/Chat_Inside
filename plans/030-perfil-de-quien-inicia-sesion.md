# Plan 030 - Perfil de quien inicia sesión

- **Estado:** implementado
- **Fecha:** 2026-09-28
- **Especificación:** `specs/017-perfil-de-quien-inicia-sesion.md`

1. Contratos: perfil propio con nombre, correo e identificador, y comando de edición acotado al nombre.
2. API: lectura y escritura del perfil de la sesión, sin aceptar un identificador de cuenta en la petición, con unión explícita de metadatos para no perder los existentes.
3. Lista de integrantes: incorpora el nombre visible para que notas, asignaciones y equipo lo muestren sin consultas adicionales.
4. BFF: ruta propia sobre la sesión del servidor, sin exponer credenciales al navegador.
5. Interfaz: avatar con iniciales en la barra lateral que abre el perfil, formulario con el correo en lectura y el nombre editable, y refresco inmediato de la lista del equipo al guardar.
6. Pruebas: nombre ausente sin invención, lectura solo de la cuenta de la sesión, unión de metadatos, y fallo visible cuando la lectura o la escritura fallan.
7. Documentación: decisión registrada y fase en el registro de validación.

## Riesgos

- El nombre es libre: dos personas pueden elegir el mismo. No es un identificador y la interfaz nunca lo usa para decidir permisos.
- Si la lectura del perfil falla al abrir la bandeja, el avatar queda sin iniciales y el modal informa el error; operar la bandeja no depende de este dato.
- Los metadatos de la cuenta son editables por su dueño: se acepta porque solo afectan a la presentación. Cualquier dato que llegue a influir en una autorización debe vivir en la pertenencia, no aquí.
