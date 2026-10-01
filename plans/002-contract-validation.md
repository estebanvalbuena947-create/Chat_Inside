# Plan de ejecución: validación contractual de proveedores

## Clasificación

- **Tipo:** central.
- **Motivo:** valida contratos externos, aislamiento de tenants, idempotencia, seguridad y persistencia antes de implementación.

## Evidencia completada

- Documentación oficial de Zernio revisada para firma, reintentos, deduplicación, envío, multimedia, backfill y multi-tenancy.
- Documentación y changelog de Supabase revisados para RLS, Storage, Realtime y cambios relevantes de plataforma.
- MCP `supabase_chat_zernio` configurado con OAuth, `project_ref` limitado y modo de solo lectura; acceso validado sin SQL ni datos.
- Decisiones resultantes registradas en `docs/DECISIONS.md` y `docs/VALIDATION_LOG.md`.

## Validación pendiente de entorno

| Prueba | Entrada requerida                                      | Resultado observable                                                      |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| n8n    | URL y mecanismo de autenticación en gestor de secretos | Contrato real validado contra JSON permitido.                             |
| Zernio | Cuenta y canal de staging                              | Webhook auténtico, texto y adjuntos de prueba, con evidencia anonimizada. |
| Escala | Volumen, SLO y retención aprobados                     | Límites de colas, archivos e índices definidos.                           |

## Condición para fundaciones

La conexión MCP quedó validada. No inicializar migraciones ni proveedores hasta aprobar el enfoque de secretos y el plan de validación de Zernio/n8n. Cualquier SQL y toda operación de escritura requieren autorización explícita adicional.
