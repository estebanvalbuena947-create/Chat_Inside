# Chat Zernio

Plataforma web multiusuario para atender conversaciones de los canales conectados a Zernio. Centraliza conversaciones, mensajes, adjuntos, asignaciones, etiquetas, respuestas rápidas y colaboración entre agentes humanos, con automatización controlada mediante un agente existente en n8n.

## Alcance

El producto es una plataforma de atención por chat. No incluye reservas, citas, calendario, disponibilidad, pagos, catálogo de servicios ni lógica operativa de un spa. El directorio `example-spa/` es material de referencia fuera de alcance y no define requisitos funcionales.

## Estado

La plataforma está construida y en producción. La API, la web y el trabajador funcionan contra el proyecto real de Supabase y los canales de Zernio: `/health` responde `"supabase":"configured"`, la bandeja se sirve en `chat.insidespa.com.mx` y el trabajador procesa la cola en modo `zernio_inbox_outbox`.

## Documentación

- [Contrato de desarrollo](docs/AI_CONTRACT.md)
- [Mapa del proyecto](docs/PROJECT_MAP.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Seguridad](docs/SECURITY.md)
- [Especificación maestra](docs/ZERNIO_CHAT_MASTER_SPEC.md)
- [Decisiones](docs/DECISIONS.md)
- [Especificación de la plataforma](specs/001-zernio-chat-platform.md)
- [Plan de documentación](plans/001-documentation-baseline.md)
- [Contrato de las herramientas](docs/TOOLS_CONTRACT.md)
- [Controles de calidad](docs/QUALITY_GATES.md)
- [Operación](docs/OPERATIONS.md)
- [Despliegue en servidor](docs/DEPLOY-SERVIDOR.md)

## Restricciones operativas

- La UI se comunica únicamente con la API propia.
- Las credenciales de Zernio, Supabase privilegiadas y n8n solo existen en backend o workers.
- Zernio se consume mediante un adaptador de servidor; los webhooks se validan, persisten y deduplican.
- Todo dato operativo pertenece a un tenant y se autoriza por usuario, rol y recurso.
- Los archivos se almacenan privados y se sirven con enlaces firmados de corta duración. **No hay flujo de aprobación de activos**: lo que se sube, se sirve.
- El agente n8n opera detrás de un Agent Gateway; no accede directamente a Zernio, Supabase ni secretos.

El despliegue está hecho en servidor propio, con su manual en `docs/DEPLOY-SERVIDOR.md`. El trabajo pendiente es de operación, no de construcción: las migraciones sin aplicar, la carga de fotos y la activación de los flujos nuevos.

## Desarrollo local

Requiere Node.js 22 y Corepack. En Windows, usar explícitamente `corepack pnpm` si el shim global de pnpm no está disponible.

```text
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Controles: `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm format:check` y `corepack pnpm build`.

Estos cinco se ejecutan solos en cada cambio mediante `.github/workflows/control.yml`. Las otras puertas de `docs/QUALITY_GATES.md` -- integracion, migraciones, escaneo de secretos y auditoria de dependencias -- siguen siendo manuales porque necesitan una base de datos o son comandos aparte.
