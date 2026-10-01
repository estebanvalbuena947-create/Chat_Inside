# Especificación: perfil de quien inicia sesión

- **Estado:** implementada
- **Responsable:** acceso e identidad
- **Fecha:** 2026-09-28
- **Cierre:** implementada el 2026-09-28 sin migración: el nombre vive en los metadatos de la cuenta.

## Resultado

Cada persona que entra a la interfaz define su nombre visible una sola vez y con él aparece ante sus compañeros: en las notas privadas, en las asignaciones, en la lista del equipo y en su propio avatar de la barra lateral. Ya no se muestra el correo como identidad.

## Reglas

1. El nombre visible pertenece a la **cuenta**, no al tenant: la misma persona conserva su nombre si pertenece a varios espacios, y no hay que repetirlo por cada uno.
2. Cada persona edita únicamente su propio perfil. La identidad de la sesión es la que decide qué cuenta se modifica; no se acepta un identificador de cuenta en la petición.
3. El nombre es presentación: nunca participa en una decisión de autorización. Los permisos siguen dependiendo del rol vigente en la pertenencia.
4. Guardar el nombre **no reemplaza** los demás metadatos de la cuenta: se envía la unión explícita para no depender de si el proveedor combina o reemplaza.
5. Un nombre ausente o vacío es un estado válido: la interfaz muestra el correo como respaldo y no inventa un nombre.
6. El correo se muestra en el propio perfil, en modo lectura, porque identifica la cuenta; no se expone el de otras personas fuera de la lista del equipo, que ya lo mostraba.
7. El nombre visible se refleja donde el equipo se reconoce entre sí: notas, asignación, lista de integrantes y avatar propio.

## Contrato

- `GET /v1/me` devuelve `{ item: { displayName, email, userId } }` de la sesión autenticada.
- `PATCH /v1/me` con `{ displayName }` de 1 a 80 caracteres devuelve el mismo perfil ya guardado.
- `GET /v1/tenants/:tenantId/members` incorpora `displayName` para que la interfaz no tenga que resolverlo.
- Sin sesión `401`; entrada inválida `400`.

## Datos, seguridad y rollback

- Sin migración: el nombre se guarda en los metadatos de la cuenta, que el propio usuario puede editar y que no se usan para autorizar.
- El correo y el nombre de otras personas solo se entregan a integrantes del mismo tenant.
- Rollback: dejar de exponer los comandos del perfil propio. Los nombres guardados permanecen y la interfaz vuelve a mostrar el correo como identidad.
