# Contrato de desarrollo asistido por IA

## 1. Autoridad

El agente propone y ejecuta; la especificación, las reglas de dominio, la arquitectura y los controles externos determinan la corrección.

## 2. Principios no negociables

### 2.1 Resolver reglas, no ejemplos

Una incidencia concreta debe traducirse a una regla general. Está prohibido hardcodear nombres, identificadores, fechas, contactos, canales o estados para hacer pasar un caso aislado.

### 2.2 Propiedad clara de la lógica

Cada regla tiene un único propietario. La UI presenta decisiones; los adaptadores traducen protocolos; los servicios de aplicación coordinan; el dominio decide; la persistencia almacena.

### 2.3 Cambios pequeños y revisables

Evitar diffs amplios sin necesidad. No mezclar funcionalidad, refactorización, formato y migraciones no relacionadas en un mismo corte.

### 2.4 Compatibilidad y migraciones

Los cambios de esquema, contratos API y eventos deben declarar compatibilidad, migración, despliegue y rollback.

### 2.5 Fallos visibles

No ocultar estados inválidos. Los errores deben clasificarse, registrarse con contexto seguro y convertirse en respuestas operables.

### 2.6 Seguridad y privacidad por defecto

Aplicar mínimo privilegio, validación de entradas, control de acceso, protección de secretos, minimización de datos y registros sin información sensible.

### 2.7 Efectos externos confiables

Mensajes, archivos, webhooks, integraciones y trabajos asíncronos deben considerar duplicados, reintentos, timeouts, orden de eventos y reconciliación.

### 2.8 Pruebas contra atajos

Las pruebas deben validar invariantes y familias de casos, no únicamente el ejemplo que originó la solicitud.

### 2.9 Documentación viva

Cuando una tarea cambia responsabilidades, reglas, contratos o decisiones, también debe actualizar el mapa, la arquitectura o el registro de decisiones.

## 3. Prohibiciones

- Condiciones por nombres concretos para simular reglas de dominio.
- Consultas directas a la base de datos desde componentes visuales.
- Acceso de la UI a credenciales o APIs privadas.
- Dependencias circulares entre dominios.
- Capturas generales de excepciones sin tratamiento.
- Reintentos infinitos o sin idempotencia.
- Cambios de esquema destructivos sin migración.
- Desactivar pruebas, lint o tipos para completar una tarea.
- Inventar contratos de APIs externas sin consultar su fuente autorizada.

## 4. Informe final obligatorio

El agente debe informar:

1. Qué regla se implementó.
2. Qué archivos se modificaron y por qué pertenecen a esa capa.
3. Qué pruebas y controles ejecutó.
4. Qué casos límite cubrió.
5. Qué riesgos o pasos manuales permanecen.
6. Qué documentación o decisión actualizó.
