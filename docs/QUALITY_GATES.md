# Controles de calidad

Una tarea no está terminada hasta superar los controles aplicables.

## Controles automáticos

- Instalación reproducible.
- Formato.
- Lint.
- Comprobación de tipos.
- Pruebas unitarias.
- Pruebas de integración.
- Build de producción.
- Escaneo de secretos.
- Auditoría de dependencias según la política del proyecto.
- Migraciones verificadas en una base temporal cuando apliquen.

Las cinco primeras de esta lista -- instalacion, formato, lint, tipos, pruebas unitarias y build -- se ejecutan solas en cada cambio mediante `.github/workflows/control.yml`. Las demas siguen siendo manuales: la integracion y las migraciones necesitan una base de datos, y el escaneo de secretos y la auditoria de dependencias son comandos aparte.

## Controles de comportamiento

- Criterios de aceptación demostrados.
- Casos límite cubiertos.
- Autorización probada por rol y recurso.
- Duplicados, reintentos y concurrencia probados cuando existen efectos externos.
- Errores externos convertidos a estados operables.
- No hay regresiones en flujos críticos.

## Pruebas antiatajo

Para cada regla relevante incluir:

1. caso normal;
2. múltiples variantes de la misma clase;
3. límite inferior y superior;
4. estado inválido;
5. repetición o concurrencia cuando aplique;
6. evidencia de que una condición específica no sustituye la regla general.

## Revisión del diff

- ¿Cada archivo modificado pertenece al cambio?
- ¿La regla vive en el propietario correcto?
- ¿Existe lógica duplicada?
- ¿Se agregó una excepción por un valor concreto?
- ¿Cambió un contrato público?
- ¿Se introdujo una dependencia o permiso nuevo?
- ¿Los logs exponen datos sensibles?
- ¿La documentación sigue siendo verdadera?

## Evidencia de cierre

El informe final debe incluir comandos ejecutados y resultado. No usar frases genéricas como “todo funciona” sin evidencia.
