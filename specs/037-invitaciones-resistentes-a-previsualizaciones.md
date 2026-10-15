# Especificación: invitaciones resistentes a previsualizaciones

- **Estado:** implementada; pendiente de comprobación manual en producción
- **Responsable:** identidad y acceso
- **Fecha:** 2026-10-14
- **Actualización:** 2026-10-15 — la entrega pasó al correo oficial de Supabase con SMTP de Resend y el
  canje dejó de exigir una confirmación intermedia (ADR-058). Se añadió el tipo `recovery` y la
  política de contraseñas del proyecto.

## 1. Problema

El enlace que el administrador compartía era el `action_link` de Auth. Ese enlace empieza en el
endpoint de verificación del proveedor: una previsualización de WhatsApp o un escáner de enlaces lo
puede abrir por `GET` y gastar el secreto de un solo uso antes de que la persona invitada confirme su
acceso. Auth devuelve después `otp_expired`, aunque la persona nunca haya pulsado el enlace.

Al corregirlo con una pantalla intermedia de confirmación, en operación esa pantalla resultó un
obstáculo: al restablecer la contraseña hablaba de «abrir invitación», y una cuenta creada por una
invitación ya consumida entraba sin poder establecer contraseña.

## 2. Resultado esperado

Una previsualización HTTP no puede canjear una invitación. El enlace llega por correo, abre una página
propia de Chat Zernio con el secreto solo en el fragmento URL, y esa página lo canjea al cargar y lleva
a la persona directo a su destino, sin pasos intermedios.

## 3. No objetivos

- No se permite reutilizar un token ni se cambia su vencimiento.
- No se cambia la autorización por tenant ni la forma de los comandos de invitación.
- No se borra `/auth/callback`: sigue atendiendo enlaces emitidos antes de este corte.
- No se envía correo desde la aplicación: lo envía Supabase con el SMTP configurado en el proyecto.

## 4. Actores y permisos

| Actor                     | Puede                                         | No puede                                                     |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Administrador             | Invitar por correo y cambiar roles            | Ver o registrar el enlace después de enviarlo                |
| Persona invitada nueva    | Abrir su enlace, poner su nombre y contraseña | Entrar sin que Auth valide el token                          |
| Cuenta existente          | Abrir su enlace y entrar a la bandeja         | Cambiar su contraseña por el mero hecho de recibir un acceso |
| Persona que recupera      | Abrir su enlace y elegir contraseña nueva     | Ver el nombre de otra persona ni entrar a otra cuenta        |
| Previsualizador o escáner | Pedir la página pública sin fragmento         | Recibir o canjear el token                                   |

## 5. Reglas e invariantes

1. La API nunca entrega el `action_link` del proveedor ni construye el enlace: invita por correo con
   `auth.admin.inviteUserByEmail` cuando la cuenta no existe y solicita un acceso con
   `signInWithOtp` cuando ya existe. El contrato responde que el correo se envió.
2. El enlace de las plantillas de Auth usa `{{ .TokenHash }}` y coloca el secreto después de `#`. Los
   fragmentos no se envían al servidor, a logs de acceso ni a previsualizadores HTTP.
3. `/auth/invite` canjea el enlace al cargar y navega al destino del tipo, sin pantalla intermedia.
   Antes de llamar a Auth elimina el fragmento del historial.
4. Solo se aceptan los tipos `invite`, `magiclink` y `recovery`. Cualquier fragmento incompleto o tipo
   ajeno se trata como enlace incompleto, sin enviar nada al proveedor.
5. El destino se deriva del tipo que Auth valida y no de un valor manipulable del enlace: `invite` crea
   nombre y contraseña, `magiclink` entra a la bandeja y `recovery` restablece la contraseña sin pedir
   nombre.
6. Si Auth falla, el acceso recibe solamente un motivo propio, nunca el token hash ni el texto del
   proveedor.
7. La contraseña debe cumplir la política del proyecto: al menos ocho caracteres con una minúscula,
   una mayúscula, un número y un símbolo. Auth es la autoridad; el formulario la comprueba antes de
   enviar para dar respuesta inmediata y traduce el rechazo del proveedor a un motivo propio.
8. `/auth/callback` conserva el comportamiento anterior para enlaces ya emitidos hasta que caduquen.

## 6. Flujo principal

1. Un administrador invita un correo con un rol.
2. La API pide a Auth la invitación; Auth la envía por el SMTP del proyecto desde el remitente
   configurado.
3. El correo lleva un botón cuyo enlace apunta a
   `https://<web>/auth/invite#token_hash=<...>&type=<invite|magiclink|recovery>`.
4. Un previsualizador puede pedir `/auth/invite`, pero no recibe el fragmento ni puede gastar el token.
5. Al abrirlo la persona, la página elimina el fragmento del historial, canjea con `verifyOtp` y abre
   la sesión.
6. Una invitación nueva pide nombre y contraseña; una cuenta existente entra a la bandeja; una
   recuperación pide solo la contraseña nueva.

## 7. Flujos alternos y errores

- Token ya usado o vencido (`otp_expired`) → acceso con el aviso de enlace usado.
- Otro error de Auth → acceso con rechazo genérico, sin texto del proveedor.
- Fragmento sin token, sin tipo o con tipo ajeno → acceso con aviso de enlace incompleto, sin llamar a
  Auth.
- Fallo al crear el cliente o de red → acceso con aviso de sesión no establecida.
- Contraseña que no cumple la política → el formulario explica los requisitos antes de enviar y, si el
  proveedor la rechaza igualmente, muestra el motivo propio en lugar de un texto genérico.
- Invitación que no se puede enviar → la API falla visiblemente; nunca degrada a entregar un enlace a
  mano ni uno que no sea resistente a previsualizaciones.

## 8. Datos y contratos

- Entrada API: no cambia (`email`, `role`).
- Salida API: `item` deja de llevar `inviteLink` y lleva `emailSent` junto con `email`, `role` y
  `requiresPassword`.
- Persistencia y migraciones: ninguna.
- Integración: `inviteUserByEmail` y `signInWithOtp` entregan el correo; `verifyOtp({ token_hash,
type })` canjea al abrir la página.
- Configuración: el proyecto de Auth necesita SMTP propio y las plantillas de invitación, recuperación
  y enlace mágico apuntando a `/auth/invite` con `{{ .TokenHash }}`.

## 9. Seguridad y privacidad

- Ni `hashed_token`, `action_link`, token de sesión ni refresh token se escriben en logs, pruebas,
  rutas del servidor o documentación.
- El fragmento no llega al servidor y se borra con `history.replaceState` antes del canje.
- El tipo se valida contra una lista cerrada. Los errores externos se reducen a motivos propios.
- El enlace sigue siendo una credencial de un solo uso: quien lo abra primero obtiene el acceso.
- **Riesgo aceptado:** como la página canjea al cargar, un navegador automatizado que ejecute
  JavaScript y conserve el fragmento podría gastar el token. Un escáner que solo descargue la página no
  lo recibe, porque el fragmento no viaja en la petición. El correo es el único canal de entrega, así
  que el vector de previsualización de WhatsApp que originó el problema ya no aplica.

## 10. Compatibilidad y rollback

- Enlaces previos: `/auth/callback` sigue activo y los procesa como antes hasta que expiren.
- Configuración: los enlaces dependen de que el dominio esté verificado en el proveedor de correo y de
  que `APP_PUBLIC_URL` sea el dominio público del chat.
- Rollback: volver a entregar el `action_link` y retirar `/auth/invite`; no hay datos que migrar.

## 11. Plan de pruebas

- API: la invitación no expone `action_link`; una cuenta nueva se invita y una existente recibe acceso;
  la generación sin resultado falla visiblemente; la pertenencia conserva rol e idempotencia.
- Web: los tipos `invite`, `magiclink` y `recovery`; fragmentos incompletos, vacíos y de tipo ajeno; la
  traducción de `otp_expired`; los requisitos de contraseña y la traducción de los errores al
  guardarla; el destino derivado del tipo validado.
- Manual: invitar un correo nuevo, recibir el correo, abrir el enlace y comprobar que va directo a crear
  contraseña; repetir para recuperación y para una cuenta existente.

## 12. Criterios de aceptación

- [x] Abrir el enlace de correo no expone el token al servidor ni lo canjea una previsualización.
- [x] Una cuenta nueva llega a crear contraseña y una existente a la bandeja.
- [x] La recuperación llega directo al cambio de contraseña, sin pantalla intermedia.
- [x] Ningún secreto llega al servidor al abrir el enlace o se registra.
- [x] Enlaces emitidos antes del cambio siguen siendo compatibles.
- [x] Todos los controles de calidad aplicables pasan.
- [x] Documentación y decisiones actualizadas.
- [ ] Comprobación manual del recorrido real con un correo nuevo y uno existente en producción.
