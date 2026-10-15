# Especificación: invitaciones resistentes a previsualizaciones

- **Estado:** implementada; pendiente de comprobación manual en producción
- **Responsable:** identidad y acceso
- **Fecha:** 2026-10-14

## 1. Problema

El enlace que el administrador compartía era el `action_link` de Auth. Ese enlace empieza en el
endpoint de verificación del proveedor: una previsualización de WhatsApp o un escáner de enlaces lo
puede abrir por `GET` y gastar el secreto de un solo uso antes de que la persona invitada confirme su
acceso. Auth devuelve después `otp_expired`, aunque la persona nunca haya pulsado el enlace.

## 2. Resultado esperado

Una previsualización HTTP no puede canjear una invitación. El enlace compartido abre una página propia
de Chat Zernio con el secreto solo en el fragmento URL; esa página no verifica nada al cargar. La
persona invitada pulsa **Continuar con la invitación** y solo ese gesto canjea el token hash con Auth.

## 3. No objetivos

- No se permite reutilizar un token ni se cambia su vencimiento.
- No se envía correo automático ni se agrega una dependencia.
- No se cambia la autorización por tenant ni el contrato HTTP de invitaciones.
- No se borra `/auth/callback`: sigue atendiendo enlaces emitidos antes de este corte.

## 4. Actores y permisos

| Actor                     | Puede                                        | No puede                                                     |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Administrador             | Generar y compartir un enlace de un solo uso | Ver o registrar el token después de compartirlo              |
| Persona invitada nueva    | Confirmar su acceso y crear contraseña       | Entrar sin que Auth valide el token                          |
| Cuenta existente          | Confirmar su acceso y entrar a la bandeja    | Cambiar su contraseña por el mero hecho de recibir un acceso |
| Previsualizador o escáner | Pedir la página pública sin fragmento        | Recibir o canjear el token                                   |

## 5. Reglas e invariantes

1. La API nunca entrega el `action_link` del proveedor. Construye el enlace público desde
   `hashed_token` y el tipo de verificación que generó.
2. El token hash viaja exclusivamente después de `#`; los fragmentos no se envían al servidor, a
   logs de acceso ni a previsualizadores HTTP.
3. Cargar `/auth/invite` no llama a Auth ni cambia la sesión. Solo el clic explícito de la persona
   llama a `verifyOtp`.
4. Solo se aceptan los tipos `invite` y `magiclink`. Cualquier fragmento incompleto o tipo ajeno se
   trata como enlace incompleto, sin enviar nada al proveedor.
5. `invite` validado lleva a crear contraseña; `magiclink` validado lleva a la bandeja. El destino se
   deriva del mismo tipo que Auth valida; no se acepta un destino manipulable en el enlace.
6. Antes de llamar a Auth, el navegador elimina el fragmento del historial. Si Auth falla, el acceso
   recibe solamente un motivo propio, nunca el token hash ni el texto del proveedor.
7. `/auth/callback` conserva el comportamiento anterior para enlaces ya emitidos hasta que caduquen.

## 6. Flujo principal

1. Un administrador genera una invitación.
2. La API obtiene `hashed_token` de Auth y devuelve
   `https://<web>/auth/invite#token_hash=<...>&type=invite`.
3. WhatsApp puede pedir `/auth/invite`, pero no recibe el fragmento ni puede gastar el token.
4. La persona invitada pulsa **Continuar con la invitación**.
5. El navegador elimina el fragmento, llama `verifyOtp` y guarda la sesión en cookies.
6. Una invitación nueva va a contraseña; un acceso mágico de cuenta existente va a la bandeja.

## 7. Flujos alternos y errores

- Token ya usado o vencido (`otp_expired`) → acceso con el aviso existente de enlace usado.
- Otro error de Auth → acceso con rechazo genérico, sin texto del proveedor.
- Fragmento sin token, sin tipo o con tipo ajeno → acceso con aviso de enlace incompleto, sin llamar a
  Auth.
- Fallo al crear el cliente o de red → acceso con aviso de sesión no establecida.
- Respuesta de generación sin `hashed_token` → la API falla visiblemente; nunca degrada al
  `action_link` ni emite un enlace que no es resistente a previsualizaciones.

## 8. Datos y contratos

- Entrada API: no cambia (`email`, `role`).
- Salida API: no cambia (`email`, `role`, `inviteLink`, `requiresPassword`); cambia la forma interna de
  `inviteLink` a `/auth/invite#...`.
- Persistencia y migraciones: ninguna.
- Integración: `admin.generateLink` entrega `hashed_token`; `verifyOtp({ token_hash, type })` canjea
  solamente tras el clic.

## 9. Seguridad y privacidad

- Ni `hashed_token`, `action_link`, token de sesión ni refresh token se escriben en logs, pruebas,
  rutas del servidor o documentación.
- El fragmento no llega al servidor. Tras el clic se borra con `history.replaceState` antes del canje.
- El tipo se valida contra una lista cerrada. Los errores externos se reducen a motivos propios.
- El enlace sigue siendo una credencial de un solo uso: compartirlo da acceso y debe hacerse solo con
  la persona invitada.

## 10. Compatibilidad y rollback

- Enlaces previos: `/auth/callback` sigue activo y los procesa como antes hasta que expiren.
- Configuración: los enlaces nuevos ya no dependen de una URL de redirección autorizada en Auth, pero
  `APP_PUBLIC_URL` debe seguir siendo el dominio público del chat para construir el enlace compartido.
- Rollback: volver a entregar el `action_link` y retirar `/auth/invite`; no hay datos que migrar.

## 11. Plan de pruebas

- API: enlace nuevo y acceso mágico usan fragmento, no query; no exponen `action_link`; tipos y
  destinos correctos; respuesta sin hash falla; la pertenencia conserva rol e idempotencia.
- Web: fragmento válido para los dos tipos; fragmento incompleto, token vacío y tipo ajeno; traducción
  de `otp_expired`; el destino se deriva del tipo validado.
- Manual: enviar una invitación nueva por WhatsApp, confirmar que la previsualización no la consume y
  que la persona solo inicia el canje al pulsar el botón.

## 12. Criterios de aceptación

- [ ] Compartir el enlace por WhatsApp no consume la invitación antes del clic (requiere prueba manual en producción).
- [x] Una cuenta nueva llega a crear contraseña y una existente a la bandeja.
- [x] Ningún secreto llega al servidor al abrir el enlace o se registra.
- [x] Enlaces emitidos antes del cambio siguen siendo compatibles.
- [x] Todos los controles de calidad aplicables pasan.
- [x] Documentación y decisiones actualizadas.
