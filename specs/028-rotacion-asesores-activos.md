# Especificación: transferencia rotativa a asesores activos

Cuando el bot solicita una transferencia sin indicar una persona concreta, la conversación se asigna
a la siguiente persona del tenant cuya bandeja esté abierta y visible. La asignación pausa el bot y
se audita igual que una transferencia nominativa.

La presencia no se deduce de una invitación, un rol o una sesión de Supabase: la bandeja envía un
pulso autenticado cada minuto mientras la pestaña está visible. Una presencia vence tras dos minutos
sin pulso. Mientras no haya nadie disponible, la transferencia falla explícitamente y la conversación
permanece sin cambios.

El orden es round-robin por tenant y se decide atómicamente en PostgreSQL para que dos solicitudes
simultáneas no seleccionen a la misma persona por accidente. Participan las membresías **con rol
`agent`** que tengan presencia: un administrador o un supervisor puede mirar la bandeja —y su pulso se
registra igual—, pero no entra en el reparto, porque su papel no es atender conversaciones. Los roles
que participan viven en un solo sitio (`v_roles`, dentro de la función SQL): sumar un rol no obliga a
tocar la API ni los flujos.

Los flujos de n8n deben enviar `conversationId` y `turnBotOff`, sin `userId`, para pedir la rotación.
Un `userId` explícito conserva la asignación nominativa existente.
