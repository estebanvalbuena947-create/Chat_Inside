# Seguridad y privacidad

## Reglas generales

- Nunca guardar secretos en el repositorio.
- Nunca enviar claves privadas al navegador.
- Aplicar autorización en servidor, no solo ocultar botones.
- Validar tipo, tamaño, formato y permisos de cada entrada.
- Verificar firmas de webhooks antes de procesar eventos.
- Usar comparación segura para firmas y tokens.
- Minimizar datos personales y definir retención.
- Censurar tokens, mensajes sensibles y PII en logs.
- Usar URLs firmadas o almacenamiento privado para archivos cuando corresponda.
- Limitar alcance y duración de credenciales.

## Amenazas por funcionalidad

Cada especificación central debe considerar:

- suplantación de identidad;
- acceso horizontal entre clientes o cuentas;
- repetición de eventos;
- manipulación de parámetros;
- carga de archivos maliciosos;
- fuga por logs o mensajes de error;
- abuso de recursos;
- dependencia externa comprometida;
- eliminación o modificación no autorizada.

## Respuesta a incidentes

- Responsable: `[ROL]`
- Canal: `[CANAL]`
- Revocación de credenciales: `[PROCESO]`
- Preservación de evidencia: `[PROCESO]`
- Notificación: `[POLÍTICA]`
