# Instalar en el servidor, paso a paso

Destino: el servidor donde ya corre **n8n**. Ahí van la **API** y el **trabajador**. La web puede ir
en Vercel o aquí mismo.

Ruta recomendada: **Docker**. Al final hay una sección con **PM2** como alternativa.

## Paso 0 — Lo que necesitas a mano

| Dato                                   | De dónde sale                                             |
| -------------------------------------- | --------------------------------------------------------- |
| Acceso SSH                             | el mismo con el que entras a n8n                          |
| Docker y Compose                       | `docker --version` y `docker compose version`             |
| `SUPABASE_URL` y `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API (**clave de servicio**) |
| `ZERNIO_API_KEY`                       | panel de Zernio                                           |
| `ZERNIO_WEBHOOK_SECRET`                | el mismo que usa el webhook                               |
| Un subdominio para la API              | por ejemplo `apichat.tudominio.com`                       |
| La URL pública de la web               | el dominio de Vercel, o el que uses                       |

Si Docker no estuviera instalado:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER    # y vuelve a entrar por SSH
```

## Paso 1 — Traer el código

```bash
cd /opt
sudo git clone <repositorio> wepflash
sudo chown -R $USER:$USER wepflash
cd wepflash
```

## Paso 2 — Los dos archivos de secretos

Crea `apps/api/.env`:

```bash
cat > apps/api/.env <<'ENV'
APP_ENV=production
API_PORT=4000
APP_PUBLIC_URL=https://<tu-web>
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_SECRET_KEY=<clave-de-servicio>
ZERNIO_API_KEY=<clave-de-zernio>
ZERNIO_WEBHOOK_SECRET=<secreto-del-webhook>
ZERNIO_CONNECT_REDIRECT_URL=https://<tu-web>/
ENV
```

Y `apps/worker/.env` **igual pero sin** `ZERNIO_CONNECT_REDIRECT_URL`.

```bash
chmod 600 apps/api/.env apps/worker/.env
```

`API_HOST` **no** se pone aquí: el contenedor lo recibe desde `docker-compose.yml` como `0.0.0.0`.
Con PM2, en cambio, se deja el valor por defecto (`127.0.0.1`) para que la API no quede expuesta.

## Paso 3 — Construir la imagen

```bash
docker compose build
```

Tarda unos minutos la primera vez y necesita salida a internet. Si falla aquí, casi siempre es la
red del servidor o un proxy.

## Paso 4 — Levantar los servicios

```bash
docker compose up -d
docker compose ps
docker compose logs -f api
```

Comprobaciones en el propio servidor:

```bash
curl -s http://127.0.0.1:4000/health      # debe responder 200
docker compose logs --tail 30 worker      # sin errores al arrancar
```

Deben quedar **dos contenedores en marcha** (`wepflash-api` y `wepflash-worker`), ambos con
`restart: unless-stopped`: si el servidor se reinicia, vuelven solos.

## Paso 5 — DNS

Registro `A` de `apichat.tudominio.com` apuntando a la IP del servidor. Comprueba con
`dig +short apichat.tudominio.com`.

## Paso 6 — nginx y certificado

Añade el sitio al nginx que ya sirve n8n:

```nginx
server {
    server_name apichat.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # La bandeja usa un flujo de eventos (SSE): sin esto se corta cada pocos segundos.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d apichat.tudominio.com
```

## Paso 7 — Comprobar desde fuera

```bash
curl -s https://apichat.tudominio.com/health
```

Si responde, la API está publicada y con certificado: ya se puede conectar todo.

## Paso 8 — Conectar las piezas

| Dónde                                             | Qué poner                                          |
| ------------------------------------------------- | -------------------------------------------------- |
| **Zernio** → webhook                              | `https://apichat.tudominio.com/v1/webhooks/zernio` |
| `ZERNIO_CONNECT_REDIRECT_URL` (API)               | la URL pública de la web, con `/` al final         |
| **Vercel** → `INTERNAL_API_URL`                   | `https://apichat.tudominio.com`                    |
| **Supabase** → Authentication → URL Configuration | el dominio de la web                               |
| **n8n** → variable                                | `WEPLASH_API_URL=https://apichat.tudominio.com`    |

Tras cambiar el `.env` de la API: `docker compose up -d api`.

## Paso 9 — Comprobación final

| Prueba                                   | Qué debe pasar                         |
| ---------------------------------------- | -------------------------------------- |
| Abrir la web e iniciar sesión            | entra (si no, revisa Supabase, paso 8) |
| Canales                                  | aparecen Instagram y TikTok            |
| Bandeja                                  | carga conversaciones                   |
| Escribir a la cuenta desde otro teléfono | aparece en la bandeja en segundos      |
| Responder desde la interfaz              | sale por Zernio y queda en el hilo     |
| `docker compose logs worker`             | procesa eventos sin errores            |

## Paso 10 — Apagar los túneles

Cuando lo anterior funcione, **apaga los túneles de prueba**: si no, habrá dos caminos entregando
los mismos eventos y verás mensajes duplicados.

## Actualizaciones

```bash
cd /opt/wepflash
git pull
docker compose build
docker compose up -d
```

## Si algo falla

| Síntoma                                 | Causa habitual                                                     |
| --------------------------------------- | ------------------------------------------------------------------ |
| `up` levanta pero `/health` no responde | `.env` mal, o `API_HOST` no llegó al contenedor                    |
| La web no inicia sesión                 | faltan las URLs de Supabase (paso 8)                               |
| No llegan mensajes                      | el webhook apunta a otro sitio, o el **trabajador** está caído     |
| El trabajador se reinicia en bucle      | `SUPABASE_SECRET_KEY` o `ZERNIO_*` mal en su `.env`                |
| La bandeja se queda cargando            | nginx sin los ajustes de SSE (paso 6)                              |
| n8n recibe **401** en las tools         | normal **por ahora**: los endpoints `/v1/tools/...` aún no existen |

## Alternativa con PM2 (sin contenedores)

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
sudo npm i -g pm2
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Con PM2, nginx apunta igual a `127.0.0.1:4000` y **no** se toca `API_HOST`.
