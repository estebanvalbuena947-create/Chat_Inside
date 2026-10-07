# Flujos v2 — reapuntados a WEPLASH (Zernio + nuestra base)

Estas son las **versiones nuevas** de los 15 flujos. Se importan en n8n y **no se activan** hasta que
la versión vieja se apague: un mensaje, un emisor.

## Qué cambió

- **60 nodos** que llamaban a `api.manychat.com` ahora llaman a nuestra API.
- Nodos de **envío** (plantillas, flujos, fotos, seguimientos) → `POST /v1/tools/messages` → **Zernio**.
- **Multimedia por sucursal** (`Multimedia_Valle`, `Multimedia_Juarez`, `Multimedia_Lomas`) →
  `GET /v1/tools/branches/{sede}/media`.
- **`Transferir_al_asesor`** → `POST /v1/tools/assignments`.
- **Lecturas de contacto y estado** → `GET /v1/tools/conversations/{id}`.
- La credencial de ManyChat se retiró: ahora se envía `Authorization: Bearer` con un token de máquina.
- Cada nodo tocado lleva una **nota** dentro del flujo diciendo a qué endpoint va y qué ajustar.

## Variables de entorno necesarias en n8n

| Variable | Valor |
|---|---|
`WEPLASH_API_URL` | base de nuestra API (`http://127.0.0.1:4000` en local, el túnel en pruebas, el dominio en producción) |
`WEPLASH_TOOL_TOKEN` | token de máquina del espacio (se creará con `tool_tokens`). **Sin esto, los nodos responden 401** |

## Lo que falta antes de activar nada

1. **Los endpoints** (`/v1/tools/...`): **completos** — doce rutas con sus pruebas. Ya no hace falta
   probar en seco.
2. **El cuerpo de cada llamada**: el `jsonBody` sigue siendo el de ManyChat. Hay que ajustarlo al
   contrato de cada endpoint (por eso cada nodo lleva su nota). El `subscriber_id` de ManyChat se
   sustituye por el **contacto** de nuestra base.
3. **Cargar la multimedia** de cada sede en nuestro almacén, y que los `slug` de las sedes coincidan
   (`valle`, `juarez`, `lomas`).
4. **El token de máquina** creado y pegado en la variable de entorno.

## Qué NO se tocó (a propósito)

Pabau (24 nodos), su Supabase de lógica (7), Stripe (4), Sheets (3) y las llamadas internas de n8n.
La lógica del negocio se queda donde está.

## Checklist

`nodos-migrados.csv` lista los 60 nodos: flujo, nodo, método, endpoint y qué representa.

## Si vuelves a procesar estos flujos

Los quince originales de `Flujos/` están **limpios**. Las versiones nuevas tuvieron que repararse.

Al reapuntar los flujos se leyó y se escribió con codificaciones distintas, y el resultado fueron
**más de trece mil secuencias rotas** en los textos que el bot le dice a los clientes: `Cotización`
donde va `Cotización`, `Liberación` donde va `Liberación`. Estaban en los prompts, en los nombres de
nodo y en la tabla de precios.

Se corrigieron con un script que recorre el árbol, sustituye los pares de doble codificación y
**valida cada JSON antes de escribirlo** — un flujo a medio reparar es peor que uno sin reparar: se
importa, parece completo, y falla al ejecutarse.

Si alguna vez hay que volver a exportar o procesar estos archivos:

- **Lee y escribe siempre en UTF-8**, las dos cosas. El daño vino de mezclarlas.
- **Valida el JSON después de transformarlo** y no escribas si deja de parsear.
- Y comprueba el resultado: busca `Ã` seguido de vocal en los archivos que hayas tocado.

Las conexiones entre nodos se referencian **por nombre**. Renombrar un nodo para arreglar un acento
rompe las conexiones que apuntaban a él, y el flujo falla sin decir por qué. Si hay que renombrar,
hay que revisar las conexiones una a una.