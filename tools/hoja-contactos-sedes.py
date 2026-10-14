"""Hoja de contactos del material de cada sede, para poder titularlo.

Lee las filas de `branch_media`, firma cada archivo, lo descarga y arma una imagen por sede con cada
tramo numerado (sede, orden y los primeros caracteres del identificador). Con eso se puede decir "la 3
de Valle es la fachada" sin abrir veinte archivos.

Es una herramienta de trabajo: no escribe nada en la base ni en el repositorio, solo deja los archivos
en una carpeta temporal.
"""

import io
import json
import os
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TENANT = "b8b53c64-00c4-4739-a7ac-b8fc84ea0b72"
SALIDA = os.path.join(os.environ.get("TEMP", "/tmp"), "wepflash-media")
ANCHO_TRAMO = 320
COLUMNAS = 4


def leer_env() -> dict[str, str]:
    valores: dict[str, str] = {}
    with open(os.path.join(RAIZ, ".env"), encoding="utf-8") as archivo:
        for linea in archivo:
            if "=" in linea and not linea.strip().startswith("#"):
                clave, valor = linea.split("=", 1)
                valores[clave.strip()] = valor.strip()
    return valores


def pedir(url: str, clave: str, metodo: str = "GET", cuerpo: bytes | None = None) -> bytes:
    peticion = urllib.request.Request(url, data=cuerpo, method=metodo)
    peticion.add_header("apikey", clave)
    peticion.add_header("Authorization", f"Bearer {clave}")
    if cuerpo is not None:
        peticion.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(peticion, timeout=60) as respuesta:
        return respuesta.read()


def main() -> None:
    env = leer_env()
    base = env["SUPABASE_URL"].rstrip("/")
    clave = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SECRET_KEY", "")

    filas = json.loads(
        pedir(
            f"{base}/rest/v1/branch_media?tenant_id=eq.{TENANT}"
            "&select=id,branch_id,sort_order,kind,storage_object_path,title&order=branch_id,sort_order",
            clave,
        )
    )
    sedes = json.loads(
        pedir(f"{base}/rest/v1/branches?tenant_id=eq.{TENANT}&select=id,slug,name", clave)
    )
    nombre = {sede["id"]: sede["slug"] for sede in sedes}

    os.makedirs(SALIDA, exist_ok=True)
    por_sede: dict[str, list[dict]] = {}
    for fila in filas:
        por_sede.setdefault(nombre.get(fila["branch_id"], "?"), []).append(fila)

    resumen: list[str] = []
    for slug, items in sorted(por_sede.items()):
        tramos: list[tuple[str, Image.Image | None]] = []
        for indice, fila in enumerate(items):
            etiqueta = f"{slug} · {fila['sort_order']} · {fila['id'][:8]}"
            detalle = {
                "bytes": 0,
                "etiqueta": etiqueta,
                "id": fila["id"],
                "kind": fila["kind"],
                "sede": slug,
                "sortOrder": fila["sort_order"],
                "title": fila["title"],
            }
            imagen: Image.Image | None = None
            if fila["kind"] == "image" and fila["storage_object_path"]:
                firmada = json.loads(
                    pedir(
                        f"{base}/storage/v1/object/sign/branch-media/{fila['storage_object_path']}",
                        clave,
                        "POST",
                        json.dumps({"expiresIn": 600}).encode(),
                    )
                )
                url = f"{base}/storage/v1{firmada['signedURL']}"
                try:
                    with urllib.request.urlopen(url, timeout=60) as respuesta:
                        crudo = respuesta.read()
                    detalle["bytes"] = len(crudo)
                    imagen = Image.open(io.BytesIO(crudo)).convert("RGB")
                    # Se guarda tambien el archivo suelto, por si hay que mirarlo en grande.
                    imagen.save(os.path.join(SALIDA, f"{slug}-{fila['sort_order']:02d}-{fila['id'][:8]}.jpg"))
                except (urllib.error.URLError, OSError) as fallo:
                    detalle["error"] = str(fallo)
            else:
                detalle["error"] = "no es imagen o no tiene copia"
            resumen.append(json.dumps(detalle, ensure_ascii=False))
            tramos.append((etiqueta, imagen))

        # Hoja de contactos: una cuadricula con el numero de cada tramo encima.
        con_imagen = [(etiqueta, im) for etiqueta, im in tramos if im is not None]
        if not con_imagen:
            continue
        ancho_tramo = ANCHO_TRAMO
        alto_tramo = int(ANCHO_TRAMO * 0.75)
        filas_grid = (len(con_imagen) + COLUMNAS - 1) // COLUMNAS
        lienzo = Image.new("RGB", (COLUMNAS * ancho_tramo, filas_grid * (alto_tramo + 26)), "white")
        dibujo = ImageDraw.Draw(lienzo)
        try:
            fuente = ImageFont.truetype("arial.ttf", 16)
        except OSError:
            fuente = ImageFont.load_default()
        for posicion, (etiqueta, im) in enumerate(con_imagen):
            columna = posicion % COLUMNAS
            fila_grid = posicion // COLUMNAS
            x = columna * ancho_tramo
            y = fila_grid * (alto_tramo + 26)
            copia = im.copy()
            copia.thumbnail((ancho_tramo - 8, alto_tramo - 4))
            lienzo.paste(copia, (x + 4, y + 24))
            dibujo.text((x + 4, y + 4), etiqueta, fill="black", font=fuente)
        destino = os.path.join(SALIDA, f"hoja-{slug}.jpg")
        lienzo.save(destino, quality=82)
        print(f"hoja de {slug}: {destino} ({len(con_imagen)} tramos)")

    with open(os.path.join(SALIDA, "resumen.jsonl"), "w", encoding="utf-8") as archivo:
        archivo.write("\n".join(resumen))
    print(f"carpeta: {SALIDA}")


if __name__ == "__main__":
    main()
