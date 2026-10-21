# Desplegar el bloqueo de respuestas con el bot pausado

## Estado

Correccion autorizada el 2026-10-19, preparada localmente. No se ha desplegado en el servidor.
No requiere migraciones, variables nuevas, reimportar flujos n8n ni instalar dependencias nuevas.
El despliegue de API y trabajador es necesario para que la pausa tenga efecto en produccion.

## Cambios que hay que llevar al servidor

### Despliegue desde Git

El arreglo se integra en `main`; eso versiona el codigo, pero GitHub no despliega automaticamente
en este servidor. Desde una copia limpia de `/opt/wepflash`, comprobar `git status --short` y luego:

```bash
git switch main && git pull --ff-only origin main && bash deploy.sh
```

Si aparecen cambios locales, revisar y respaldar antes de continuar: no usar `reset --hard`,
`clean` ni sobrescribir el trabajo del servidor. Si falla la actualizacion, no ejecutar el despliegue
con una version anterior por accidente. Conservar la imagen anterior para rollback.

### Alternativa con el paquete preparado

El paquete `bot-pause-20261019.tar.gz` contiene el dominio, el encolado de API, los dos caminos del
trabajador, sus pruebas, la especificacion, el plan, el contrato de tools y esta guia. Excluye secretos,
dependencias, compilados, migraciones y los cambios pendientes de tiempo real y adjuntos.
No ejecutar `git reset`, `git clean` ni `db push` para instalar este corte.

1. Transferir el paquete al servidor por el canal habitual.
2. En `/opt/wepflash`, guardar una copia de los archivos enumerados por `tar -tzf` antes de extraer.
   Si esos archivos tienen cambios propios, integrar el diff en lugar de sobrescribirlos.
3. Extraer el paquete dentro de `/opt/wepflash`. Los controles de tipos, lint, formato y pruebas
   se ejecutan en el equipo de desarrollo; no hace falta instalar Node en el host de produccion.
4. Ejecutar `bash deploy.sh`. Es el procedimiento existente de Docker Swarm: construye la imagen y
   actualiza los servicios. No operar estos servicios mediante Docker Compose.
5. Confirmar una replica activa de `wepflash_api` y `wepflash_worker`, salud correcta y ausencia de
   fallos de arranque, siguiendo `docs/DEPLOY-SERVIDOR.md`.

## Verificacion despues del despliegue

Usar una conversacion interna de prueba, sin enviar mensajes a clientes para probar el cambio:

- Con el bot pausado, un nuevo envio automatico responde `422` y no crea mensaje ni evento.
- Una persona puede responder y adjuntar archivos en esa conversacion.
- Un mensaje automatico en cola que el trabajador encuentra pausado no llega al proveedor: queda
  `failed`, con `automation_not_auto` en el evento, sin reintentos. Reactivar no rearma ese evento.
- Un aviso entrante pendiente que se encuentra pausado queda `skipped` y no activa n8n.
- Con `auto`, los mensajes nuevos siguen enviandose. Un fallo de lectura del modo nunca autoriza
  un envio: reintenta dentro del presupuesto existente.
- Un evento recuperado de un mensaje ya enviado o leido solo cierra la cola y conserva su estado.

La comprobacion se hace inmediatamente antes de la llamada externa, pero no cancela una peticion
que ya viaja al proveedor. Una pausa y reactivacion completas entre dos lecturas pueden no ser
observadas; no se promete atomicidad entre la base y HTTP. Los avisos operativos de botones de
WhatsApp conservan su comportamiento; sus respuestas por la API quedan protegidas por el bloqueo.

## Rollback

Conservar la etiqueta anterior y usar el rollback de Swarm de `docs/DEPLOY-SERVIDOR.md`/`deploy.sh`.
El rollback restaura el defecto anterior y no rearma mensajes fallidos ni avisos omitidos. No borrar
datos, reactivar conversaciones ni reenviar mensajes descartados como parte de este procedimiento.
