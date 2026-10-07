# Poner el sistema en vivo

Estado: guía para desplegar. Marca lo que **está verificado** en el repositorio y lo que hay que
hacer en los paneles (Vercel, host de la API, Supabase y Zernio).

## Lo primero: Vercel no puede hospedar todo

| Pieza                         | ¿Vercel?           | Por qué                                                                                                                                      |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` (Next.js)          | **Sí**             | es justo su caso                                                                                                                             |
| `apps/api` (NestJS + Fastify) | **No**             | es un servidor que debe estar siempre encendido y mantener conexiones abiertas (SSE)                                                         |
| `apps/worker`                 | **No**             | **bucle continuo**: drena eventos, reintenta multimedia cada 5 min, procesa webhooks. En Vercel no existe un proceso que viva entre llamadas |
| Supabase                      | Ya está en la nube | no hay nada que hacer                                                                                                                        |

Y un aviso que importa: **los túneles de Cloudflare que usamos para probar son temporales**. Se caen
al cerrar la sesión que los levantó. "En vivo" significa **un host real** para la API y el worker.

## Arquitectura recomendada

```
Vercel        → la web (Next.js)              https://<proyecto>.vercel.app
Host Node     → la API (puerto 4000)          https://api.<dominio>
Host Node     → el trabajador                 (sin puerto público)
Supabase      → ya está en la nube
Zernio        → apunta su webhook a https://api.<dominio>/... (ver abajo)
```

Sirve cualquier host que mantenga procesos vivos: Railway, Render, Fly.io o un VPS. La API y el
worker se despliegan **del mismo repositorio**, cada uno con su comando de arranque.

## 1. La web en Vercel

- **Importar** el repositorio en Vercel.
- **Root Directory**: `apps/web`.
- **Include source files outside of the Root Directory**: activado (la web usa los paquetes del
  monorepo).
- **Build Command**: `pnpm --filter @chat-zernio/web... build` — los puntos suspensivos hacen que se
  construyan **también los paquetes de los que depende**, que es lo que hoy falla si se olvida.
- **Install Command**: el de pnpm por defecto (`pnpm install` en la raíz del monorepo).

### Variables de entorno de la web (exactamente estas tres)

Verificadas en el código (`apps/web`):

| Variable                               | Para qué                                          |
| -------------------------------------- | ------------------------------------------------- |
| `INTERNAL_API_URL`                     | la URL pública de **nuestra API** (solo servidor) |
| `NEXT_PUBLIC_SUPABASE_URL`             | el proyecto de Supabase                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clave **publicable** (no la de servicio)       |

## 2. La API y el trabajador

Mismo repositorio, dos servicios. Comandos:

```
API:     pnpm --filter @chat-zernio/api start      (o: node apps/api/dist/main.js)
Worker:  pnpm --filter @chat-zernio/worker start
```

Variables (verificadas en `apps/api/.env` y `apps/worker/.env`):

| Variable                      | API | Worker |
| ----------------------------- | --- | ------ |
| `APP_ENV`                     | sí  | sí     |
| `API_PORT`                    | sí  | sí     |
| `APP_PUBLIC_URL`              | sí  | sí     |
| `SUPABASE_URL`                | sí  | sí     |
| `SUPABASE_SECRET_KEY`         | sí  | sí     |
| `ZERNIO_API_KEY`              | sí  | sí     |
| `ZERNIO_WEBHOOK_SECRET`       | sí  | sí     |
| `ZERNIO_CONNECT_REDIRECT_URL` | sí  | —      |

**La clave de servicio de Supabase nunca va al navegador**: solo existe en la API y el worker.

## 3. Pasos manuales que solo puedes hacer tú

1. **Supabase → Authentication → URL Configuration**: añadir el dominio de Vercel a _Site URL_ y a
   _Redirect URLs_. **Si falta, el inicio de sesión no funciona** en el dominio nuevo.
2. **`ZERNIO_CONNECT_REDIRECT_URL`**: hoy apunta a `http://localhost:3000/`. En vivo debe ser
   `https://<proyecto>.vercel.app/`, o el navegador volverá a tu máquina tras autorizar un canal.
3. **Zernio → webhook**: apuntarlo a la URL pública de la API. **No tiene API de webhooks** (lo
   comprobamos): se cambia a mano en su panel. Si el secreto cambia, actualiza
   `ZERNIO_WEBHOOK_SECRET` en la API y el worker.
4. **Los túneles**: apagarlos cuando el host real esté funcionando, para que no queden dos caminos
   entregando los mismos eventos.

## 4. Comprobación después de desplegar

| Prueba                                | Qué debe pasar                                  |
| ------------------------------------- | ----------------------------------------------- |
| `https://<proyecto>.vercel.app/login` | carga                                           |
| Inicio de sesión                      | funciona (si falla, revisa el paso 1 de arriba) |
| Canales                               | se ven Instagram y TikTok registrados           |
| Bandeja                               | carga conversaciones                            |
| Un mensaje de prueba a la cuenta      | aparece en la bandeja en segundos               |
| Enviar desde la interfaz              | sale por Zernio y se queda en el hilo           |

## 5. Lo que falta de mi lado

- **Migraciones**: quedan **cinco** por aplicar en el SQL Editor —
  `bot_integrations.sending_enabled`, `contact_fields`, `branch_services`, `message_templates` y
  `branch_media.channel`. Sin ellas no hay precios, ni campos del contacto, ni interruptor de envío,
  ni plantillas, ni imagen por canal.
- **Bucket `branch-media`**: creado, con la importación desde enlace funcionando y probada.
- **Los endpoints `/v1/tools/...`**: **completos** — doce rutas, con sus pruebas.
- **Pruebas del botón de conectar**: pendientes.

Yo no tengo credenciales de Vercel ni del host, así que el despliegue lo lanzas tú. Si algo falla,
mándame el error tal cual y lo diagnostico: con la lista de variables y los pasos manuales, la
mayoría de los fallos de un primer despliegue son de esos dos sitios.
