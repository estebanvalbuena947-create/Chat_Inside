# Especificación: transferencia rotativa a asesores activos

Cuando el bot solicita una transferencia sin indicar una persona concreta, la conversación se asigna
a la siguiente persona del tenant cuya bandeja esté abierta y visible. La asignación pausa el bot y
se audita igual que una transferencia nominativa.

La presencia no se deduce de una invitación, un rol o una sesión de Supabase: la bandeja envía un
pulso autenticado cada minuto mientras la pestaña está visible. Una presencia vence tras dos minutos
sin pulso.

**La presencia ordena, no descarta.** Primero se entrega a quien tiene la bandeja abierta en ese
momento; si no hay nadie, la conversación se entrega igual al siguiente agente del turno, que la
encontrará al abrir la bandeja. Es preferible que la conversación tenga dueño y espere a que la
transferencia falle y el cliente se quede sin respuesta. Solo cuando el espacio no tiene **ninguna**
persona con el rol que atiende, la transferencia falla con `422` y la conversación permanece sin
cambios.

El orden es round-robin por tenant y se decide atómicamente en PostgreSQL para que dos solicitudes
simultáneas no seleccionen a la misma persona por accidente. Participan las membresías **con rol
`agent`**: un administrador o un supervisor puede mirar la bandeja —y su pulso se registra igual—,
pero no entra en el reparto, porque su papel no es atender conversaciones; y tampoco entra en el
respaldo de quienes no tienen presencia. Los roles que participan viven en un solo sitio (`v_roles`,
dentro de la función SQL): sumar un rol no obliga a tocar la API ni los flujos.

Los flujos de n8n deben enviar `conversationId` y `turnBotOff`, sin `userId`, para pedir la rotación.
Un `userId` explícito conserva la asignación nominativa existente.
