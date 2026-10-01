# Plan 023 - Plataforma de canal y bandeja compacta

- **Estado:** implementado y validado
- **Fecha:** 2026-08-14

1. Extender el normalizador de entrada con la plataforma validada del evento Zernio.
2. Sincronizar la plataforma de `channel_accounts` sin alterar una cuenta ajena ni crear efectos externos.
3. Reparar solo valores nulos históricos a partir de eventos ya validados de la misma cuenta.
4. Compactar la cuadrícula, cabecera, filtros y tarjetas; mantener desplazamiento independiente de contactos e historial.
5. Cubrir normalización, sincronización y representación; ejecutar controles del workspace.

## Cierre

- Sin cambios de esquema, privilegios, mensajes, outbox ni integración externa adicional.
- Verificados: reparación remota agregada, 95 pruebas, typecheck, lint y formato.
