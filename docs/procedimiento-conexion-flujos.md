# Conexión de los flujos a WEPLASH — procedimiento

Todo lo que hay que hacer, en orden, para que los flujos dejen de depender de ManyChat. Cada paso
lleva **su comprobación**: si algo falla, se sabe en ese paso y no tres más adelante.

**Mientras el interruptor de envío esté apagado, nada de esto le escribe a un cliente.** Se puede
conectar y probar entero sin riesgo. Es la garantía central de esta migración.

---

## Paso 0 · Antes de tocar n8n

**a) Aplicar las tres migraciones** en Supabase (SQL Editor):

```
supabase/migrations/20261006093000_add_bot_sending_switch.sql
supabase/migrations/20261006180000_add_branch_services.sql
supabase/migrations/20261006210000_add_contact_fields.sql
```

**b) Sembrar los precios** — el `insert ... cross join` que está en el informe de la ronda 8.

**c) Desplegar el código**: `git add -A` → `commit` → `push` → en el servidor `git pull && bash deploy.sh`.

**Comprobación**: los tres servicios en `1/1` y:

```powershell
curl.exe -s -i -H "Authorization: Bearer TU_TOKEN" "https://apichat.insidespa.com.mx/v1/tools/branches/polanco/services" | Select-Object -First 4
```

Debe dar **200**. Si da 404, falta desplegar. Si da 401, el token.

**d) Direcciones permitidas en Supabase** (_Authentication → URL Configuration_):

```
https://chat.insidespa.com.mx
https://chat.insidespa.com.mx/auth/password
```

---

## Paso 1 · Conectar la puerta (el traductor)

Es **el** paso. Los demás dependen de él.

1. Abre el flujo nuevo `Flujos_v2/nodo-traductor-entrada.json` en n8n (o importa el archivo y copia
   el código del nodo **Traducir aviso de WEPLASH**).
2. En el flujo **`Sara IG ISV`**, inserta un nodo **Code** justo **después** del nodo _Webhook_.
3. Pega el código.
4. Conecta: `Webhook` → `Traducir aviso de WEPLASH` → lo que antes seguía al webhook.

**Comprobación — y es la más importante de todo el documento:**

Manda un mensaje real desde tu teléfono y mira la salida del traductor en la ejecución de n8n.
**`body` debe tener el texto del cliente.**

Si `body` está **vacío**, es un desajuste de envoltura entre nuestro aviso y el webhook. Y es un
fallo **silencioso**: no da error, solo deja al bot mudo. Se reconoce porque **todos** los campos
salen vacíos a la vez.

---

## Paso 2 · Los diez nodos de campos del contacto

Estos nodos **no envían mensajes**: guardan datos del contacto. Hoy apuntan a `/v1/tools/messages`
con un cuerpo de ManyChat.

En cada uno:

| Campo  | Antes                                     | Ahora                                 |
| ------ | ----------------------------------------- | ------------------------------------- |
| URL    | `…/v1/tools/messages`                     | `…/v1/tools/contact-fields`           |
| Cuerpo | `{ "subscriber_id": X, "fields": [...] }` | `{ "contactId": X, "fields": [...] }` |

**El resto del cuerpo no cambia** — la herramienta acepta exactamente la misma forma. Son:

```
4.2 y 4.5:  Cargar campos plantilla principal · Cargar campos plantilla ISV
Sara:       Guardar mensaje comprobante · Guardar mensaje imagen no relacionada ·
            Guardar mensaje revisión Banxico
```

**Comprobación**: al ejecutarse, en Supabase debe aparecer una fila en `contact_fields` con el
`field_name` esperado. Y si se ejecuta dos veces, **sigue habiendo una sola fila**.

---

## Paso 3 · Las transferencias a una asesora

Los nodos de transferencia no mandan texto: derivan la conversación. Van a nuestra herramienta ya
construida.

| Nodo                                                                               | Destino                      |
| ---------------------------------------------------------------------------------- | ---------------------------- |
| `Transferir_al_asesor` · `Transferir por consulta inconsistente` · `Foto_Deposito` | `POST /v1/tools/assignments` |

Cuerpo: `{ "conversationId": …, "userId": … }` — el `userId` es el de **nuestra** base (está en la
tabla `memberships`).

**Comprobación**: la conversación aparece **asignada** en la bandeja a esa persona.

---

## Paso 4 · El catálogo de imágenes — ya arreglado

Los tres nodos `Multimedia_Valle`, `Multimedia_Juarez` y `Multimedia_Lomas` estaban incoherentes
(un GET al catálogo con cuerpo de mensaje) y **ya están corregidos** en el archivo. Al reimportar,
quedan bien.

Falta **subir las imágenes** a `branch-media` y sus filas en `branch_media` — el procedimiento está
en el informe de la ronda 5. Las cuatro sedes (`valle`, `juarez`, `lomas`, `polanco`) ya existen.

**Comprobación**: `GET /v1/tools/branches/valle/media` devuelve las direcciones firmadas.

---

## Paso 5 · El contenido que creíamos que había que traer

Durante un tiempo este paso decía que era **el único bloqueo real**: nueve flujos de mensaje cuyo
contenido vivía dentro de ManyChat, con su lista nodo por nodo en un documento aparte.

**No era un bloqueo, y el documento con la lista se retiró.** Los nodos de ManyChat eran
**transporte, no contenido**: se usaban porque no se puede enviar un mensaje directo al cliente sin
activar un flujo, y las imágenes que enviaban son las que ahora sirve nuestra base de datos. El
contenido no se recupera: se sustituye.

Lo que queda de aquel paso es la multimedia por sede, que ya funciona:
`GET /v1/tools/branches/{sede}/media` devuelve sus direcciones firmadas.

## Paso 6 · Encender el envío

**Solo cuando todo lo anterior esté probado.** Es el momento en que el bot empieza a escribirle a
clientes reales:

```sql
update public.bot_integrations
set sending_enabled = true, updated_at = now()
where tenant_id = 'b8b53c64-00c4-4739-a7ac-b8fc84ea0b72';
```

Y para apagarlo, lo mismo con `false`. **Se revierte en un segundo**, sin desplegar nada.

**Comprobación**: `POST /v1/tools/messages` pasa de responder **422** (_"el envío del bot está
apagado"_) a aceptar el mensaje.

---

## El orden importa

```
0. Migraciones + despliegue + direcciones
1. Traductor en la puerta        ← verificar que 'body' NO esté vacío
2. Campos del contacto
3. Transferencias
4. Catálogo (ya corregido) + imágenes
5. Contenido de ManyChat
6. Encender el envío             ← último, y reversible
```

**Nada de esto le escribe a un cliente hasta el paso 6.** Y en el paso 6 se enciende con una fila y
se apaga con la misma fila.
