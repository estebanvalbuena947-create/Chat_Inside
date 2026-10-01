#!/bin/bash
#
# Despliegue de WEPLASH.
#
#   bash deploy.sh
#
# Cada despliegue construye la imagen con una etiqueta nueva (fecha y hora). Asi Swarm ve que la
# imagen cambio y recrea las tareas por si solo: no hace falta acordarse de ningun --force.
#
# Si algo sale mal, se vuelve a la version anterior indicando su etiqueta:
#   WEPFLASH_TAG=20260930-1830 bash deploy.sh

set -euo pipefail
cd "$(dirname "$0")"

# Secretos y variables que el stack necesita (APP_PUBLIC_URL, SUPABASE_*, ZERNIO_*, NEXT_PUBLIC_*).
set -a
. ./.env
set +a

: "${SUPABASE_URL:?falta SUPABASE_URL en .env}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env}"

export WEPFLASH_TAG="${WEPFLASH_TAG:-$(date +%Y%m%d-%H%M)}"
echo "==> Construyendo wepflash-api:${WEPFLASH_TAG}"

docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -t "wepflash-api:${WEPFLASH_TAG}" .

echo "==> Desplegando"
docker stack deploy --resolve-image never -c docker-stack.yml wepflash

sleep 5
docker service ls | grep wepflash

echo "==> Conservando las 3 imagenes mas recientes"
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
  | grep '^wepflash-api:' \
  | tail -n +4 \
  | awk '{print $2}' \
  | xargs -r docker image rm >/dev/null 2>&1 || true

echo "==> Listo. Comprueba: docker service ps wepflash_web --no-trunc | head -3"