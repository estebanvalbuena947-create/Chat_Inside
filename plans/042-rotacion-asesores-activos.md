# Plan: rotación de asesores activos

1. Añadir presencia con expiración y cursor round-robin, más una función SQL serializada.
2. Exponer un pulso autenticado desde la bandeja.
3. Permitir que la herramienta de asignación seleccione un asesor activo cuando no recibe `userId`.
4. Reapuntar los tres nodos de transferencia de Sara para no fijar una persona.
5. Corregir el envío heredado de Stripe que aún usa el contrato de ManyChat.
6. Añadir pruebas de asignación explícita, rotativa, sin asesores y concurrencia; ejecutar controles.
7. Limitar el reparto a las membresías con rol `agent`, en su propia migración porque la función ya
   estaba aplicada en el proyecto remoto.
