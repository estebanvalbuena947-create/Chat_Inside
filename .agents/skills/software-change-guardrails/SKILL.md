---
name: software-change-guardrails
description: Analiza, diseña, implementa y revisa cambios de software sin introducir arreglos específicos ni degradar la arquitectura. Usar para funciones centrales, bugs de dominio, integraciones, datos, seguridad, concurrencia o cambios que afecten varios módulos.
---

# Flujo seguro de cambio de software

## 1. Cargar reglas

Lee el `AGENTS.md` aplicable y los documentos que este indique. Localiza la especificación de la tarea. Si falta una especificación para un cambio central, créala antes de implementar.

## 2. Clasificar

Clasifica el cambio como local o central. Trata como central cualquier cambio relacionado con reglas de negocio, autenticación, permisos, pagos, reservas, datos, integraciones, eventos, seguridad, concurrencia o contratos públicos.

## 3. Traducir síntoma a regla

Explica la clase completa del problema. Rechaza soluciones basadas en nombres, identificadores, horas, clientes o ejemplos concretos cuando la regla pueda modelarse en el dominio.

## 4. Diseñar antes de editar

Identifica:

- propietario de la regla;
- módulos y contratos afectados;
- datos y migraciones;
- amenazas y riesgos;
- compatibilidad y rollback;
- pruebas antiatajo.

No edites hasta presentar un plan para cambios centrales.

## 5. Implementar por cortes

Orden recomendado:

1. dominio y modelo;
2. servicio de aplicación y validación;
3. persistencia y adaptadores;
4. API y UI;
5. pruebas;
6. documentación.

Mantén cada corte pequeño, ejecutable y revisable.

## 6. Verificar

Ejecuta los comandos definidos por el repositorio para pruebas, lint, tipos y build. Agrega pruebas para invariantes, variantes, límites, errores, duplicados y concurrencia cuando aplique.

## 7. Revisar

Contrasta el diff con contrato, arquitectura, especificación y riesgos. Busca reglas duplicadas, lógica en capas incorrectas, excepciones por valores específicos, falta de autorización, idempotencia, deduplicación, observabilidad o migración.

## 8. Cerrar con evidencia

Informa:

- regla implementada;
- archivos modificados y motivo;
- controles ejecutados y resultados;
- casos límite cubiertos;
- riesgos restantes;
- pasos manuales;
- documentación actualizada.

No declares terminado un cambio con controles fallidos o evidencia incompleta.
