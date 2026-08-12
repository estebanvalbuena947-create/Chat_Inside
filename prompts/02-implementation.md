# Prompt de implementación

Implementa únicamente el corte `[NÚMERO/NOMBRE]` del plan `[RUTA]` y cumple la especificación `[RUTA]`.

Antes de editar:

- confirma qué regla se implementará;
- enumera los archivos previstos;
- explica por qué cada archivo pertenece a esa capa.

Durante la implementación:

- evita cambios no relacionados;
- no introduzcas excepciones por valores concretos;
- conserva compatibilidad salvo instrucción contraria;
- agrega pruebas de la regla general;
- registra cualquier decisión nueva.

Al terminar:

1. ejecuta los controles aplicables;
2. muestra un resumen del diff;
3. relaciona cada cambio con una sección de la especificación;
4. reporta pruebas, riesgos restantes y pasos manuales;
5. no declares la tarea completa si algún control falla.
