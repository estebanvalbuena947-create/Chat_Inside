# Plan 013 — Actualización en tiempo real de la bandeja mediante SSE

- **Estado:** implementado y validado localmente
- **Fecha:** 2026-08-14
- **Autorización:** el administrador autorizó la fase de tiempo real.

## Regla

Una sesión autorizada recibe una señal de cambio únicamente para un tenant del que es miembro. La señal no contiene mensajes, contactos ni secretos: la interfaz vuelve a leer los recursos mediante las rutas BFF protegidas que ya validan la sesión.

## Diseño

1. La API expone un stream SSE por tenant tras validar Bearer y membresía. Consulta de forma acotada las marcas de actividad de inbox, outbox y mensajes para producir un cursor opaco cuando haya cambios.
2. El stream envía `inbox.changed` con un cursor opaco; al reconectar con `Last-Event-ID` emite `inbox.resync`, para que la web vuelva a cargar su estado aunque se hubiera perdido una señal.
3. Next.js expone un BFF del stream: obtiene la sesión en servidor y reenvía el Bearer a la API. El navegador usa `EventSource` solo contra su mismo origen, sin token ni acceso directo a Supabase.
4. Al recibir cualquiera de las señales, la web actualiza la lista y el historial actualmente seleccionado mediante sus endpoints protegidos existentes. Como respaldo para conexiones SSE que se reintenten o se intermedién localmente, el chat abierto se comprueba cada cuatro segundos. No se incorporan reglas de mensajes en la UI.

## Riesgos, compatibilidad y rollback

- No hay migración, tabla expuesta ni dependencia nueva.
- La detección es eventual y con sondeo acotado; una caída de conexión se recupera por la reconexión de SSE y una recarga REST. El respaldo de la UI incrementa dos lecturas por chat abierto cada cuatro segundos, aceptable para este entorno local.
- El rollback operativo es desactivar el BFF SSE: la bandeja mantiene la recarga manual existente.
- El stream se limita por tenant y no incluye contenido, con lo cual un evento de otro tenant no puede revelar datos.

## Pruebas

- Autenticación y membresía obligatorias antes de crear el stream.
- El cursor cambia ante actividad y no revela valores de la base.
- Formato SSE, reconexión/resincronización y filtrado por tenant.
- La web vuelve a pedir lista e historial al recibir la señal.
