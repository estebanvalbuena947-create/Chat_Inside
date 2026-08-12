# Prompt de revisión posterior

Revisa el diff actual sin modificarlo inicialmente. Contrástalo con:

- `AGENTS.md`;
- `docs/AI_CONTRACT.md`;
- `docs/PROJECT_MAP.md`;
- `docs/ARCHITECTURE.md`;
- `docs/SECURITY.md`;
- la especificación y el plan de la tarea.

Busca especialmente:

1. arreglos específicos en lugar de reglas generales;
2. lógica en la capa equivocada;
3. duplicación de reglas;
4. estados imposibles o carreras;
5. autorización insuficiente;
6. falta de idempotencia o deduplicación;
7. errores externos mal tratados;
8. pruebas que no cubren la familia de casos;
9. cambios de contrato o esquema no documentados;
10. archivos modificados sin relación con la tarea.

Clasifica hallazgos por severidad, cita archivo y línea, explica el riesgo y propone la corrección mínima sistémica. Si no hay hallazgos, enumera la evidencia revisada y los riesgos residuales.
