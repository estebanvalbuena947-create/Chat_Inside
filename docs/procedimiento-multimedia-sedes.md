# Procedimiento: cargar la multimedia de las sedes

Las fotos y vídeos que el bot comparte hoy viven en ManyChat. Este documento explica cómo pasarlos a
nuestro almacén, que es lo que permite retirar esa parte de ManyChat sin que el bot se quede sin
material.

Es la **etapa 3** del plan `plans/032-migracion-fuera-de-manychat.md`.

## Antes de empezar

Hay que tener aplicadas las migraciones de la multimedia:

| Migración                                               | Qué aporta                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `20260930210000_add_branches_media_and_tool_tokens.sql` | Las tablas `branches` y `branch_media`, y el depósito `branch-media` |
| `20261007180000_add_branch_media_channel.sql`           | El canal por imagen (opcional)                                       |

Y las sedes dadas de alta. Comprueba cuáles hay:

```bash
curl -s -H "Authorization: Bearer TU_TOKEN_DE_MAQUINA" \
  "https://apichat.insidespa.com.mx/v1/tools/branches"
```

Deben aparecer las activas: `valle`, `lomas`, `juarez` y `polanco`. Si falta alguna, se da de alta
en la tabla `branches` con su `slug`, su `name` y `is_active = true`.

## Cargar las imágenes, desde la interfaz

Es el camino normal, y no hace falta ningún token.

1. **Configuración** (el icono de ajustes).
2. Tarjeta **Multimedia por sede**.
3. Elige la **sede** en el desplegable. Aparece lo que esa sede ya tiene.
4. Elige el origen: pega el **enlace público** del archivo (por ejemplo, desde ManyChat o Drive) o
   selecciona **Subir archivo** para escoger una imagen o vídeo desde tu equipo.
5. Un **título** opcional, que es lo que se verá en la lista (`Fachada`, `Sala de masaje`…).
6. **Importar**.

El archivo se copia a nuestro almacén en ese momento. Si el enlace caduca o no es accesible, la
pantalla lo dice y **no se registra nada**: no quedan filas a medias.

**El título también es configuración.** Los flujos no conocen los identificadores de la base: piden la
imagen por su título (`media: [{ "branchMediaTitle": "Accesorios" }]`) y la API la busca dentro de la
sede de la conversación. Por eso la foto que acompaña a la confirmación de pago de cada sede tiene que
llamarse **«Accesorios»**; si hay varias con ese título, se envía la de menor orden. Mientras esa
imagen no exista, el envío responde 422 con el motivo y **no encola nada**, que es lo correcto: mandar
el texto sin la foto pasaría desapercibido.

## Los títulos, y cómo se organizan

Un título no es un adorno: es la clave por la que el bot pide el material. Conviene tratarlos como una
**lista corta de roles**, no como descripciones libres. Los que algún flujo pide por su nombre son
contrato; el resto es catálogo que el agente muestra cuando viene al caso.

| Título       | Para qué                         | ¿Lo pide un flujo? |
| ------------ | -------------------------------- | ------------------ |
| `accesorios` | Acompaña la confirmación de pago | **Sí, por nombre** |
| `fachada`    | Presentar la sede                | No                 |
| `recepcion`  | Recepción y llegada              | No                 |
| `sala`       | Sala de masaje                   | No                 |
| `jacuzzi`    | Tina o jacuzzi                   | No                 |
| `temazcal`   | Temazcal                         | No                 |
| `promocion`  | La promo del mes, cuando cambia  | No                 |

Dos reglas prácticas:

- **La comparación no distingue mayúsculas y admite que el título contenga la palabra.** `accesorios`,
  `Accesorios` y `Accesorios spa` encuentran la misma imagen; el título exacto tiene preferencia sobre
  el que solo la contiene. Aun así, no mezcles dos roles en un título (`sala y jacuzzi`) salvo que de
  verdad sea una sola foto de las dos cosas.
- **Un orden deliberado.** `sort_order` decide en qué orden se muestran y desempata si hay dos con el
  mismo título. La primera de cada sede es la que más se comparte.

## Corregir, ordenar y quitar

Ya no hace falta reimportar el enlace para cambiar un título. En **Configuración → Multimedia por
sede**, cada archivo de la lista tiene:

- **Su título editable**: se escribe y se pulsa **Guardar título**. Dejarlo en blanco lo deja _sin
  título_, que es distinto de un título vacío.
- **Las flechas ↑ ↓**: mueven el archivo una posición y dejan el orden compacto (los que cambian de
  sitio reciben su posición; si dos compartían número, queda arreglado).
- **Quitar**: lo saca del material de la sede. Se pregunta antes, y el archivo del almacén solo se
  borra si ningún otro registro lo comparte.

Por API, lo mismo: `PATCH /v1/tenants/{id}/branches/{slug}/media/{mediaId}` con `{ "title": "Accesorios" }`
o `{ "sortOrder": 3 }`, y `DELETE` sobre la misma dirección.

## Identificar lo que ya está cargado

Cuando el material se cargó sin títulos —o hace meses y ya no se recuerda qué es cada archivo— hay una
herramienta que arma una **hoja de contactos por sede**: firma cada archivo, lo descarga y compone una
imagen con cada tramo numerado (sede, orden y los primeros caracteres del identificador).

```bash
python tools/hoja-contactos-sedes.py
```

Deja las hojas y los archivos sueltos en `%TEMP%\wepflash-media\` y un `resumen.jsonl` con una línea por
fila (sede, orden, identificador, tipo, tamaño y, si falló, el motivo). **No escribe nada** en la base ni
en el repositorio: sirve para mirar y decidir. Con la hoja delante, titular es cosa de un minuto en la
pantalla.

Ojo con lo que la hoja **no** muestra: los vídeos aparecen en el resumen pero no como tramo. Un vídeo sin
título también hay que titularlo si algún flujo lo va a pedir.

## Qué se acepta

- **Imágenes y vídeos.** Cualquier otro archivo se rechaza; la propia tabla solo admite esos dos
  tipos.
- **Hasta 25 MB.** Un vídeo más grande no entra.
- Al importar por URL, los enlaces deben ser **`https` públicos, sin credenciales y sin
  redirecciones**. Un enlace de Drive con permiso restringido no vale: tenemos que poder descargarlo
  sin autenticarnos.

El tipo se decide por **los bytes del archivo**, no por lo que diga el nombre ni por lo que declare
el servidor de origen. Un archivo llamado `foto.png` que por dentro sea un PDF se rechaza.

## Comprobarlo

Lo que ve el bot, con su credencial de máquina:

```bash
curl -s -H "Authorization: Bearer TU_TOKEN_DE_MAQUINA" \
  "https://apichat.insidespa.com.mx/v1/tools/branches/polanco/media?channel=instagram"
```

Devuelve cada elemento con su **dirección firmada**, que dura diez minutos. La ruta interna del
almacén no aparece nunca en la respuesta: quien necesite el archivo pide un enlace.

## Detalles que conviene saber

**La misma foto dos veces no crea dos archivos.** Por URL, la ruta se deriva de un hash del enlace;
al subirla desde el equipo, se deriva del hash de sus bytes. En ambos casos la tabla tiene una
restricción única que impide duplicarla.

**Una fila sin archivo se muestra como «Falta el archivo».** Puede pasar si el archivo se borró del
almacén después de registrarlo. No es un error de la importación; se arregla reimportando.

**Por canal.** Cuando la migración del canal esté aplicada, la misma foto puede tener versiones
distintas para Instagram y TikTok —que piden formatos diferentes—. Se sube la común sin canal (sirve
en cualquier sitio) y, si hace falta una específica, otra con su canal. El bot pide las suyas más las
comunes.

## Lo que queda por hacer después

Con el material cargado, la parte de fotos de ManyChat se puede desconectar. Antes de hacerlo,
conviene comprobar que el bot recibe las direcciones correctas en una conversación real.
