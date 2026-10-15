# Especificación: aviso del enlace de invitación que no concede sesión

- **Estado:** implementada
- **Responsable:** identidad y acceso (presentación del acceso)
- **Fecha:** 2026-10-14

## 1. Problema

Cuando un enlace de invitación no concede sesión, la persona termina en la pantalla de acceso sin
ninguna explicación: ve el mismo formulario que vería si su contraseña estuviera mal. Quien
administra tampoco puede distinguir un enlace ya usado de una credencial equivocada ni de un enlace
mal compartido, así que el diagnóstico depende de adivinar. En la operación real esto ya ocurrió: una
persona invitada quedó fuera y no hubo forma de saber por qué.

## 2. Resultado esperado

El acceso nombra la causa observable de que un enlace de invitación no haya servido, con un texto
propio por motivo, y conserva el motivo en la dirección para que se pueda reportar sin exponer el
secreto. Un acceso normal, sin motivo, se sigue viendo igual que siempre.

## 3. No objetivos

- No cambia quién puede entrar: la sesión la sigue concediendo Auth y la pertenencia sigue viviendo
  en `memberships`.
- No se introduce envío de correo, ni registro del enlace, ni del token.
- No se arregla desde el producto el caso en que Auth no puede volver al callback porque la dirección
  de retorno no está autorizada en el proyecto: eso es configuración del proyecto Auth (ver §12).
- No se cambia la pantalla de creación de contraseña ni el uso de `requiresPassword`.

## 4. Actores y permisos

| Actor               | Puede                                                               | No puede                                            |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Persona invitada    | Ver por qué su enlace no sirvió y pedir uno nuevo                   | Entrar sin una sesión que Auth conceda              |
| Administrador       | Generar un enlace nuevo y compartirlo                               | Ver el motivo desde el producto, ni el enlace ajeno |
| Quien opera soporte | Leer el motivo en la dirección del acceso cuando la persona lo pega | Ver el token: nunca viaja al acceso                 |

## 5. Reglas e invariantes

1. El retorno de Auth se clasifica en **una** de cuatro causas: sesión lista, código de canje, enlace
   ya usado o vencido, y enlace incompleto; un código de error del proveedor que no esté traducido se
   presenta como rechazo genérico, nunca como una causa inventada.
2. El veredicto del proveedor manda: si Auth informa un error, el fragmento no se usa aunque traiga
   tokens.
3. Un motivo ausente o desconocido nunca deja a la persona sin explicación: se muestra el texto
   general.
4. El motivo que viaja a la dirección del acceso es un identificador propio, nunca el secreto, el
   token, el código del usuario ni el texto del proveedor.
5. El valor recibido en la dirección no se pinta tal cual: se traduce a un texto propio, así que no
   puede introducir contenido en la pantalla.
6. Un acceso sin motivo no muestra ningún aviso: el error de credenciales sigue siendo un error de
   credenciales.
7. El fragmento con secretos se elimina de la barra de direcciones en todos los caminos, como ya
   ocurría.

## 6. Flujo principal

1. La persona abre el enlace y Auth verifica el token.
2. Auth devuelve la sesión en el fragmento y el navegador carga `/auth/callback`.
3. La página clasifica el retorno, guarda la sesión y reemplaza la navegación por `/auth/password`.

## 7. Flujos alternos y errores

- Enlace ya usado o vencido (`error_code=otp_expired`) → el acceso explica que cada invitación sirve
  una sola vez y que hace falta una nueva.
- Otro error de Auth → el acceso dice que la invitación no se pudo verificar y que hace falta un
  enlace nuevo.
- Retorno sin tokens y sin error (enlace cortado o abierto a medias) → el acceso pide abrirlo otra vez
  sin cortarlo.
- Tokens presentes pero la sesión no se puede establecer → el acceso lo dice y pide un enlace nuevo.
- Fallo inesperado en el navegador → el mismo aviso de sesión no establecida, sin dejar la pantalla
  en blanco.

## 8. Casos límite

- Un solo token presente, o un token vacío o en blanco → enlace incompleto.
- Tokens en la consulta en lugar del fragmento → se aceptan igual.
- Código de error desconocido o ausente → rechazo genérico.
- Motivo repetido en la dirección (`?motivo=a&motivo=b`) → se usa el primero.
- Motivo heredado del objeto (`constructor`, `toString`) → texto general, nunca un valor del lenguaje.
- Error y tokens en el mismo retorno → gana el error.
- Auth no puede volver al callback (dirección de retorno no autorizada): la persona llega a la raíz
  sin parámetros y el portero la manda al acceso sin aviso. Es el único camino que este corte no puede
  nombrar, porque el fragmento nunca llega al servidor.

## 9. Datos y contratos

- Entradas: la dirección del callback (`access_token`, `refresh_token`, `code`, `error`,
  `error_code`) y, en el acceso, `error=invite` con `motivo`.
- Salidas: sesión guardada en cookies, o redirección a `/login?error=invite&motivo=<identificador>`.
- Persistencia: ninguna. No hay tabla, migración ni evento nuevo.
- Integraciones: Auth del proyecto (canje de tokens o de código). No se agrega ninguna dependencia.

## 10. Seguridad y privacidad

- El token y el refresh token solo se entregan al cliente de Supabase; jamás se escriben en la
  dirección del acceso, en un registro ni en una prueba.
- El motivo es un identificador de nuestra lista; el texto del proveedor no se muestra ni se guarda.
- El motivo recibido se comprueba contra las claves propias del mapa de textos, así que un valor
  arbitrario cae en el texto general.
- La sesión sigue viviendo en cookies del cliente SSR; no se introduce `localStorage`.

## 11. Observabilidad

- Logs seguros: no se agrega ninguno. El motivo queda visible en la dirección del acceso para que
  quien atiende lo pueda leer o pegar en un reporte.
- Métricas y alertas: no aplica en este corte.
- Correlación: el identificador del motivo es estable y no contiene datos de la persona.

## 12. Migración y rollback

- Migración: ninguna.
- Compatibilidad: los enlaces ya emitidos siguen funcionando igual; el aviso solo aparece cuando no
  conceden sesión. Requisito ya documentado en `specs/015`: la dirección exacta
  `${APP_PUBLIC_URL}/auth/callback` debe figurar en las redirecciones autorizadas del proyecto Auth;
  si no lo está, Auth no puede devolver la sesión a la aplicación y este aviso no llega a verse.
- Rollback: revertir las dos pantallas; no hay estado que deshacer.

## 13. Plan de pruebas

- Unitarias (14, `apps/web/lib/auth/invitation-callback.test.ts`): tokens en fragmento y en consulta;
  código de canje; `otp_expired`; cuatro códigos desconocidos distintos; error sin código; dirección
  sin parámetros; un solo token, token vacío y token en blanco; error con tokens; el secreto no
  aparece en el resultado ni en el texto; cada motivo tiene texto propio; motivo ausente y motivo
  heredado del objeto caen en el texto general; y la dirección del acceso lleva exactamente el error
  y el motivo, nada más.
- Integración y end-to-end: fuera de este corte (requieren un proyecto Auth y una persona real).
- Antiatajo: la familia «código desconocido» se prueba con cuatro valores y no con el que originó la
  incidencia; el motivo inventado se prueba también como propiedad heredada, para que la regla no se
  resuelva con una condición por valor concreto.

## 14. Criterios de aceptación

- [x] Un enlace usado o vencido se explica en el acceso y no como un error de credenciales.
- [x] Un acceso sin motivo no muestra aviso.
- [x] El secreto no viaja a la dirección del acceso ni a los textos.
- [x] El motivo desconocido no deja a la persona sin explicación.
- [x] Todos los controles de calidad aplicables pasan.
- [x] Documentación y decisiones actualizadas.
