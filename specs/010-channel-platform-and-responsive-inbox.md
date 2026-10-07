# Especificación: plataforma de canal y bandeja compacta

- **Estado:** implementada

**Cierre:** implementada. `channel_accounts.platform` esta en uso desde la sincronizacion por webhook firmado, y las media queries de la bandeja convierten el panel en cajon y alternan lista y conversacion. Revisado contra el codigo el 2026-10-06.

- **Fecha:** 2026-08-14
- **Responsables:** integración Zernio y presentación

## Resultado

Cada conversación mostrará el canal de origen real en su encabezado. La bandeja utilizará una densidad visual adaptable para conservar el listado de conversaciones y el historial utilizables a escala de navegador normal.

## Reglas

1. La plataforma se obtiene exclusivamente de un webhook de Zernio cuya firma ya fue validada; no se infiere del nombre del contacto, texto ni interfaz.
2. El worker sincroniza la plataforma de la cuenta de canal de forma idempotente al procesar un mensaje entrante.
3. La reparación histórica solo llena cuentas de Zernio sin plataforma usando el último valor válido observado para la misma cuenta; no sobrescribe plataformas existentes.
4. El encabezado contiene únicamente nombre de contacto y plataforma. Los controles de operación permanecen en el panel de detalles.
5. El listado de conversaciones conserva su desplazamiento propio y se compacta sin ocultar funciones.

## Compatibilidad y rollback

- La columna `channel_accounts.platform` ya existe; no se cambia el esquema ni la autorización.
- Las conversaciones sin fuente registrada siguen mostrando un estado explícito, no una plataforma inventada.
- Rollback de la UI: revertir estilos y representación. La sincronización puede dejar de ejecutarse sin afectar el historial ni los mensajes.

## Cierre

- Implementada y validada el 2026-08-14. Una reparación idempotente completó la plataforma de una cuenta de canal existente a partir de eventos firmados; la verificación posterior confirmó que las 17 conversaciones asociadas quedaron con plataforma `instagram`.
