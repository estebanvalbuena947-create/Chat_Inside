# Plan: cierre y pausa por el bot

1. Mover la regla de «cerrar sella la fecha y reabrir la limpia» al dominio, en un solo sitio.
2. Exponer `POST /v1/tools/conversations/{id}/close` y `…/automation` con la credencial de máquina.
3. Escribir de forma idempotente y sin versión del cliente, con conflicto visible si cambió.
4. Añadir las pruebas del cierre (apaga el bot, `pauseBot:false`, repetido, ajeno, conflicto) y del
   interruptor.
5. Reapuntar los dos nodos de Sara al extremo nuevo, para que dejen de depender del subflujo
   `rTomIKEa8xNx1ZH1`, que no está versionado.
6. Documentar el contrato y ejecutar los controles.
