# Kit reutilizable para desarrollo de software asistido por IA

Este repositorio base sirve para iniciar o normalizar proyectos desarrollados con Codex u otros agentes de programación.

## Objetivo

Conseguir velocidad sin degradar la arquitectura. La IA puede proponer y ejecutar cambios, pero no decide por sí sola dónde debe vivir la lógica, qué significa que una función esté terminada ni qué riesgos son aceptables.

## Archivos principales

- `AGENTS.md`: instrucciones que el agente debe aplicar en cada tarea.
- `docs/AI_CONTRACT.md`: reglas no negociables.
- `docs/PROJECT_MAP.md`: propósito, dominios y propietarios de reglas.
- `docs/ARCHITECTURE.md`: capas, dependencias y flujos.
- `docs/DECISIONS.md`: decisiones técnicas relevantes.
- `docs/QUALITY_GATES.md`: controles obligatorios antes de terminar.
- `docs/SECURITY.md`: reglas de seguridad y privacidad.
- `specs/TEMPLATE.md`: plantilla de especificación funcional.
- `plans/TEMPLATE.md`: plantilla de plan de ejecución.
- `prompts/`: prompts operativos para análisis, implementación y revisión.
- `.agents/skills/software-change-guardrails/`: skill reutilizable para aplicar el flujo en Codex.
- `example-spa/`: ejemplo aplicado a un spa con atención por mensajería y reservas.

## Uso recomendado

1. Copiar la carpeta `general-template` o los archivos de la raíz al nuevo repositorio.
2. Reemplazar los campos entre corchetes.
3. Mantener `AGENTS.md` breve y exacto.
4. Crear una especificación por cada cambio de dominio o funcionalidad importante.
5. Pedir un análisis de diseño antes de autorizar código.
6. Implementar por cortes pequeños y verificables.
7. Ejecutar los controles de calidad y revisar el diff.
8. Actualizar documentación y decisiones cuando cambien las reglas.

## Principio rector

Una corrección no es válida solo porque resuelve el caso reportado. Debe resolver la regla general, vivir en la capa correcta y quedar protegida por pruebas que hagan costoso reintroducir el atajo.

## Especificación maestra del chat Zernio

Para construir la bandeja omnicanal segura, escalable, con agente existente y multimedia, consulte:

- `docs/ZERNIO_CHAT_MASTER_SPEC.md`
