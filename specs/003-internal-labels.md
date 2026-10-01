# Especificación: etiquetas internas por conversación

- **Estado:** implementada y validada localmente
- **Responsable:** organización de atención
- **Fecha:** 2026-08-14

## Problema

El equipo necesita clasificar conversaciones para operar la bandeja sin depender de etiquetas del proveedor ni mezclar información entre clientes.

## Resultado esperado

Cada tenant mantiene una biblioteca privada de etiquetas. Todo integrante puede ver y aplicar o retirar esas etiquetas en conversaciones de su tenant; solo un administrador puede crear, editar o eliminar la biblioteca.

## No objetivos

- No se crean etiquetas ni acciones en Zernio.
- No se automatiza n8n ni se modifica el contenido, estado o asignación de una conversación.
- No se exponen las tablas mediante la Data API ni se consultan desde el navegador.

## Actores y permisos

| Actor         | Puede                                            | No puede             |
| ------------- | ------------------------------------------------ | -------------------- |
| Administrador | Gestionar biblioteca y aplicar/retirar etiquetas | Operar otro tenant   |
| Supervisor    | Ver, aplicar y retirar etiquetas                 | Gestionar biblioteca |
| Agente        | Ver, aplicar y retirar etiquetas                 | Gestionar biblioteca |

## Reglas e invariantes

1. Una etiqueta y cada aplicación pertenecen exactamente a un tenant.
2. Una aplicación solo puede enlazar una conversación y una etiqueta del mismo tenant.
3. Aplicar o retirar una etiqueta repetidamente produce el mismo estado, sin duplicados ni efecto externo.
4. Crear es idempotente por tenant y clave; editar y eliminar exigen la versión vigente.
5. La eliminación de una etiqueta retira sus aplicaciones internas mediante la relación de base de datos; no modifica la conversación ni contacta a Zernio.

## Flujos y errores

- Un integrante lista la biblioteca y etiquetas de las conversaciones visibles en su tenant.
- Un integrante aplica o retira una etiqueta; la API comprueba la membresía, tenant, conversación y etiqueta antes de cambiar el vínculo.
- Un administrador crea, edita o elimina una etiqueta con validación de nombre (1 a 64 caracteres).
- Sin sesión: `401`; sin membresía o rol: `403`; recurso horizontal/inexistente: `404`; versión desactualizada: `409`; entrada inválida: `400`.

## Datos y contratos

- `labels`: `tenant_id`, nombre, clave idempotente, versión y fechas.
- `conversation_labels`: vínculo compuesto de tenant, conversación y etiqueta.
- Biblioteca: `GET/POST/PATCH/DELETE /v1/tenants/:tenantId/labels`.
- Aplicación: `PUT/DELETE /v1/tenants/:tenantId/conversations/:conversationId/labels/:labelId`.
- La lista de conversaciones devuelve las etiquetas mínimas para renderizarlas. La web usa BFF autenticado.

## Seguridad, migración y rollback

- Ambas tablas usan RLS y revocan privilegios de `anon` y `authenticated`; la API propia aplica la autorización de aplicación con clave de servidor.
- La migración es aditiva y contiene claves foráneas compuestas para impedir vínculos entre tenants. Incluye índices para consultas por tenant y conversación.
- Rollback operativo: ocultar los controles y no ejecutar los comandos. No se borran automáticamente etiquetas creadas por el usuario. La migración no altera conversaciones ni mensajes existentes.

## Plan de pruebas y aceptación

- Cubrir membresía, roles, aislamiento horizontal, límites, creación repetida, edición obsoleta y aplicación/retiro repetido.
- Verificar que la operación no crea outbox ni llama a Zernio.
- Confirmar RLS, privilegios cerrados, migración, tipos, lint, formato, build de API y pruebas existentes.
