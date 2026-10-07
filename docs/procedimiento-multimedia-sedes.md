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
4. Pega el **enlace público** del archivo. Por ejemplo, la dirección de la foto tal como está hoy en
   ManyChat o en Drive.
5. Un **título** opcional, que es lo que se verá en la lista (`Fachada`, `Sala de masaje`…).
6. **Importar**.

El archivo se copia a nuestro almacén en ese momento. Si el enlace caduca o no es accesible, la
pantalla lo dice y **no se registra nada**: no quedan filas a medias.

Para cambiar el orden en que se muestran, vuelve a importar el mismo enlace con otro título: la
importación es idempotente y **actualiza** la fila en lugar de duplicarla.

## Qué se acepta

- **Imágenes y vídeos.** Cualquier otro archivo se rechaza; la propia tabla solo admite esos dos
  tipos.
- **Hasta 25 MB.** Un vídeo más grande no entra.
- **Enlaces `https` públicos, sin credenciales y sin redirecciones.** Un enlace de Drive con permiso
  restringido no vale: tenemos que poder descargarlo sin autenticarnos.

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

**La misma foto dos veces no crea dos archivos.** La ruta se deriva de un hash del enlace, así que
reimportar apunta al mismo sitio, y la tabla tiene una restricción única que lo impide.

**Una fila sin archivo se muestra como «Falta el archivo».** Puede pasar si el archivo se borró del
almacén después de registrarlo. No es un error de la importación; se arregla reimportando.

**Por canal.** Cuando la migración del canal esté aplicada, la misma foto puede tener versiones
distintas para Instagram y TikTok —que piden formatos diferentes—. Se sube la común sin canal (sirve
en cualquier sitio) y, si hace falta una específica, otra con su canal. El bot pide las suyas más las
comunes.

## Lo que queda por hacer después

Con el material cargado, la parte de fotos de ManyChat se puede desconectar. Antes de hacerlo,
conviene comprobar que el bot recibe las direcciones correctas en una conversación real.
