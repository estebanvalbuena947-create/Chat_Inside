# Especificación: perfiles visuales de contactos Zernio

- **Estado:** aprobada
- **Fecha:** 2026-08-14
- **Responsable:** normalización de entrada Zernio

## Resultado

La bandeja muestra el nombre de usuario y, cuando esté disponible, una foto de perfil proveniente de un evento `message.received` firmado por Zernio. La foto se almacena en un bucket privado de Supabase y solo se entrega mediante una URL firmada, temporal y autorizada para el tenant del usuario.

## Reglas

1. `contacts.external_username` y `contacts.avatar_object_path` pertenecen siempre al mismo tenant del contacto; no se exponen por la Data API.
2. Solo un webhook autenticado puede actualizar estos atributos. Un nombre de usuario faltante conserva el último valor conocido.
3. La foto debe ser HTTPS, sin credenciales, sin redirecciones, de tipo JPEG, PNG o WebP y de un máximo de 2 MiB. Una foto inválida no invalida ni retrasa el mensaje entrante.
4. El worker guarda bytes aceptados en el bucket privado `contact-avatars`, bajo una ruta interna tenant/contact; nunca conserva ni devuelve la URL original del proveedor.
5. La API emite una URL firmada de corta vida solo tras validar sesión, membresía y pertenencia del contacto al tenant solicitado.
6. La UI usa el endpoint autenticado propio; si no hay avatar disponible o falla su carga, muestra iniciales. Ningún componente consulta Supabase ni Zernio directamente.

## Compatibilidad, riesgos y rollback

- Migración únicamente aditiva para atributos del contacto y bucket privado. Los contactos existentes conservan iniciales hasta recibir un evento posterior.
- La descarga es eventual y tolerante a fallos: no bloquea mensajes ni crea reintentos de envío.
- La imagen puede dejar un objeto huérfano si falla la actualización de su referencia; no expone información y puede depurarse posteriormente.
- Rollback: ocultar foto/usuario en UI y detener la descarga. Las columnas y objetos privados existentes no afectan mensajes ni conversaciones.
