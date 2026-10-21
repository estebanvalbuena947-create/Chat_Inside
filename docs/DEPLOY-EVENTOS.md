# Activar las actualizaciones del chat por eventos

## Estado de entrega — 2026-10-19

La migración `20261019145219_inbox_change_broadcast.sql` ya está aplicada en
`UI Chat Zernio`. Siete tablas emiten avisos privados mínimos. La función es
`SECURITY INVOKER` y no añade políticas ni permisos de usuario.

La API y web publicadas todavía necesitan este código. El usuario eligió ejecutar
el despliegue manual. No ejecutar `db push` para este paquete: la migración ya está
registrada remotamente y existen otras migraciones locales pendientes ajenas.

## Paquete

`chat-events-20261019.tar.gz` contiene únicamente los archivos del cambio de
eventos, pruebas, plan, especificación y esta guía. No contiene `.env`, secretos,
dependencias, compilados ni los cambios pendientes de tamaño de adjuntos.
Está preparado para extraerse dentro de `/opt/wepflash`, en el servidor existente.

Desde PowerShell del equipo, sustituir la ruta por la del archivo entregado:

```powershell
scp "C:\ruta\chat-events-20261019.tar.gz" root@178.156.183.192:/tmp/chat-events-20261019.tar.gz
```

En la sesión SSH del servidor:

```bash
cd /opt/wepflash
tar -tzf /tmp/chat-events-20261019.tar.gz
tar -czf "/tmp/wepflash-before-events-$(date +%Y%m%d-%H%M%S).tar.gz" apps/api/src/realtime apps/web/app/page.tsx apps/web/app/api/events apps/web/lib
tar -xzf /tmp/chat-events-20261019.tar.gz
bash deploy.sh
docker service ps wepflash_api --no-trunc
docker service ps wepflash_web --no-trunc
```

El destino debe ser el checkout operativo actual. Comparar antes cualquier cambio
hecho directamente en esos archivos del servidor. No ejecutar `git pull` esperando
recibir este paquete: no se creó commit ni se hizo push.

`deploy.sh` construye una imagen nueva y actualiza Docker Swarm. No usar Docker
Compose para este servidor. El trabajador no cambia en esta tarea; sus escrituras
también disparan las notificaciones por estar integradas en la base.

## Verificación después del despliegue

1. Recargar la página del chat para recibir la web nueva e iniciar sesión.
2. Abrir dos pestañas: un mensaje recibido/enviado y un cambio de estado deben
   aparecer sin recarga manual. Probar desde cuentas distintas del mismo espacio.
3. Con la bandeja inactiva, `/api/inbox` e historial no deben pedirse cada 4/30 s.
   El pulso de presencia cada minuto permanece: mantiene el reparto de atención.
4. Simular desconexión y volver: aparece el aviso de reconexión y el estado se
   recupera sin perder mensajes persistidos. Probar volver desde una pestaña oculta.
5. Revisar logs de `wepflash_api`: no deben repetirse
   `realtime_subscription_unavailable`. En PostgreSQL revisar cualquier
   `WarnSendingBroadcastMessage`; Broadcast no ofrece entrega garantizada.
6. Medir CPU, número de peticiones y tiempo de apertura con la misma cuenta y
   carga. No confundir el resumen semanal de CPU con la carga del último minuto.

Las lecturas de bandeja se hacen al abrir, recibir eventos, volver a la pestaña o
reconectar. Las colas del worker y las comprobaciones de sesión siguen su propio
funcionamiento. No se promete CPU cero ni un porcentaje de mejora sin medición.

## Rollback

Restaurar la imagen anterior con el procedimiento de `docs/DEPLOY-SERVIDOR.md`.
Si también se revierte el checkout, usar el respaldo de fuentes de `/tmp` anterior
a este cambio. Los avisos son aditivos y el código anterior puede ignorarlos.
Si se decide retirar los triggers, hacerlo en una migración propia, después de
restaurar el código anterior; no quitar los triggers con la API nueva activa.
