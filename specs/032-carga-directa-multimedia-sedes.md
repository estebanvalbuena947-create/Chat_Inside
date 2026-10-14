# 032 — Carga directa de multimedia por sede

**Estado:** implementada; pendiente de comprobación manual en un entorno con Storage.

## Regla

Un administrador o supervisor puede incorporar al material de una sede una imagen o vídeo mediante
una URL pública o seleccionando un archivo local. Ambas variantes autorizan al usuario en el mismo
tenant, reconocen el tipo real del contenido y registran una única fila de multimedia sin revelar la
ruta interna del bucket.

## Comportamiento

1. Configuración muestra las opciones «Enlace público» y «Subir archivo».
2. La URL conserva el contrato existente. La carga local usa `multipart/form-data` solo entre la web
   y la API propia; el navegador no habla con Storage.
3. La API acepta exclusivamente imágenes y vídeos de hasta 25 MB. El MIME, extensión y nombre
   enviados por el navegador no determinan el tipo: se reconocen los bytes.
4. La carga directa se nombra por SHA-256 de los bytes, dentro de tenant y sede. Repetir exactamente
   el mismo archivo reutiliza la ruta y el `upsert` existente evita una segunda fila.
5. Una sede de otro tenant, una sesión sin pertenencia, un archivo vacío, no reconocible o grande no
   generan escritura en Storage ni una fila parcial.

## Compatibilidad y rollback

No hay migración ni cambio al contrato de URL. El endpoint nuevo es aditivo. Revertir la interfaz y
la ruta `upload` deja intacto el material ya cargado, que se sigue entregando por los enlaces firmados
existentes.

## Criterios de aceptación

- Se puede importar por URL como antes.
- Se puede elegir y cargar una imagen o vídeo local desde Configuración.
- Un PDF renombrado como imagen se rechaza.
- Un archivo mayor de 25 MB se rechaza.
- El mismo archivo local dos veces no crea dos registros.
- Las rutas de Storage no aparecen en ninguna respuesta de la interfaz.
