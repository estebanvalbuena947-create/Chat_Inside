# 033 — Administración de sedes

**Estado:** implementada; la primera sede nueva se crea desde Configuración.

## Regla

Un administrador puede crear sedes dentro de su tenant. Una sede nueva queda activa, disponible en
la selección de multimedia y en las tools que listan sedes; ningún nombre particular vive como regla
en la interfaz, la API ni los flujos.

## Contrato

`POST /v1/tenants/:tenantId/branches` recibe `{ name }` y devuelve la sede creada. La API exige rol
`admin`, genera un slug normalizado a partir del nombre y rechaza nombres inválidos o repetidos dentro
del mismo tenant. La restricción única de la base resuelve carreras de creación.

## Compatibilidad y rollback

No hay migración: `branches` ya soporta nuevas filas. El endpoint es aditivo. Revertir la interfaz y
el endpoint no elimina las sedes creadas; se conservan como configuración operativa.

## Criterios de aceptación

- Configuración presenta una tarjeta Sedes para administradores.
- Crear «Roma» la hace elegible en Multimedia por sede.
- Un supervisor o agente no puede crear sedes mediante la API.
- Nombres sin letras o números y duplicados devuelven un error visible.
