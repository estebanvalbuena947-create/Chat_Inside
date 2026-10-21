# Plan aprobado: Reservas dentro de UI Chat Zernio

1. Aislar desde da4f215 para no mezclar cambios pendientes de eventos, bot, adjuntos u horarios.
2. Corregir normalización de creación y clasificar cancelaciones en dominio, con regresiones.
3. Añadir draftScope day/all y listas aditivas al contrato; API usa un solo conjunto de gestión.
4. Pasar alcance por BFF y presentar selección, fecha desconocida y etiqueta en la UI integrada.
5. Probar dominio, API y presentación. Ejecutar los cuatro gates y build de producción.
6. Empaquetar un patch aplicable sobre el código del servidor, con precheck y respaldo; no
   sobrescribir archivos remotos diferentes ni incluir secretos o cambios ajenos.
7. Ejecutar bash deploy.sh si hay acceso al servidor; de lo contrario entregar paquete y comandos.

Se conserva el mismo diseño de conteo y fechas ya autorizado. El usuario aclaró que el destino
es la pestaña Reservas del chat. No se revierte el dashboard independiente sin otra instrucción.
