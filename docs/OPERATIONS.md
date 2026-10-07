# Operación

Procedimientos que no son código pero que hay que ejecutar para que el sistema funcione.

## Entorno local

```powershell
corepack pnpm dev          # web (3000), api (4000) y worker en un solo proceso
corepack pnpm build        # build de producción de las tres apps
```

Comprobaciones rápidas:

| Qué     | Cómo                                                               | Esperado              |
| ------- | ------------------------------------------------------------------ | --------------------- |
| UI      | `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3000/login` | `200`                 |
| API     | `curl.exe -s http://127.0.0.1:4000/health`                         | `{"status":"ok",...}` |
| Webhook | `POST http://127.0.0.1:4000/v1/webhooks/zernio` sin firma          | `401`                 |

Un `401` en el webhook significa que la ruta está viva y que la autenticación se aplica antes de
procesar nada; **no** es un fallo. Antes esta comprobación decía `400`: la respuesta cambió al
endurecerse la validación de firma, y el manual se quedó con el número viejo.

## Webhook de Zernio: la dirección pública

Zernio entrega los eventos a una URL pública. En local esa URL es un túnel de Cloudflare, porque Zernio no puede alcanzar `127.0.0.1`.

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:4000
```

El túnel imprime una URL `https://<nombre-aleatorio>.trycloudflare.com`. La dirección que hay que registrar en Zernio es:

```
https://<nombre-aleatorio>.trycloudflare.com/v1/webhooks/zernio
```

### Reglas que hay que respetar

1. **La URL cambia cada vez que se reinicia el túnel.** Los túneles rápidos de Cloudflare no tienen garantía de disponibilidad y no conservan el nombre. Al reiniciarlo hay que volver a registrarlo en Zernio.
2. **No se puede actualizar por API.** La API de Zernio no expone la gestión del webhook (`/v1/webhooks` responde `404`) y el perfil no incluye ese campo: la URL se cambia en su panel.
3. **Si el túnel se cae, los mensajes dejan de entrar sin avisar.** No hay alerta: la única señal es que `webhook_events` deja de tener filas nuevas. Antes de dar por sentado que "no llegan mensajes", comprobar la antigüedad del último evento registrado.
4. **Para producción hace falta una dirección estable.** Un túnel rápido no sirve para un cliente real: se necesita un dominio propio o un túnel con nombre, y esa URL es la que se registra.

### Comprobar que los eventos entran

```sql
select received_at, processed_at, failed_at
from webhook_events
order by received_at desc
limit 5;
```

`processed_at` con valor y `failed_at` vacío significa que el evento entró y se normalizó bien. Si no hay filas recientes, el problema está en la URL pública, no en el procesamiento.

## Pasos manuales pendientes

| Paso                                                                     | Por qué                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Aplicar `supabase/migrations/20260929220000_add_message_attachments.sql` | Sin ella no se registra ni se copia la multimedia recibida                   |
| Configurar `ZERNIO_CONNECT_REDIRECT_URL` en `apps/api/.env`              | Sin ella, "Conectar canales" responde 503                                    |
| Configurar SMTP y las URLs de retorno en Supabase                        | Las invitaciones por correo dependen de eso; el enlace manual funciona igual |
| Habilitar la protección contra contraseñas filtradas                     | Recomendado antes de sumar integrantes                                       |

La migración `20260928215601_fix_membership_removal` **ya está aplicada** en el proyecto remoto: se verificó que las notas aceptan autoría vacía y que la clave foránea de autoría rechaza un autor inexistente. Con eso, retirar a un integrante con actividad deja de fallar.
