# Especificación: envío de imágenes y videos aprobados

## Problema

El cliente puede pedir ver instalaciones, cabinas, tratamientos o resultados ilustrativos. El sistema debe enviar contenido correcto y aprobado sin URLs hardcodeadas, archivos inexistentes ni medios incompatibles con el canal.

## Reglas

1. Todo medio pertenece al Catálogo de Medios.
2. Cada medio tiene `type`, `status`, `service_ids`, `channel_compatibility`, `storage_reference`, `valid_from` y `valid_until` opcional.
3. Solo medios `approved` y `active` pueden enviarse.
4. El agente solicita una categoría o servicio; no elige una URL arbitraria.
5. La compatibilidad, tipo y tamaño se validan al enviar.
6. Un fallo de multimedia no debe perder la conversación: se ofrece texto, otro medio o escalamiento.
7. Reintentos usan la misma clave idempotente.

## Casos límite

- Archivo eliminado o URL vencida.
- Video demasiado grande para el canal.
- Formato no compatible.
- Medio desactivado después de que el agente lo selecciona.
- Solicitud ambigua o contenido no aprobado.
- Reenvío del mismo comando por un webhook duplicado.

## Pruebas antiatajo

- Cambiar el nombre del servicio no cambia la selección si conserva el identificador.
- Varios servicios pueden compartir un medio sin duplicar URLs en código.
- Un medio no aprobado se rechaza incluso si el agente entrega su identificador.
- Un reintento no envía dos veces el archivo.
