# Especificación: zona horaria operativa única

- **Estado:** implementada
- **Responsable:** presentación
- **Fecha:** 2026-10-16

## Problema

La bandeja y otros paneles convertían instantes almacenados a la zona local del navegador. Dos
agentes podían ver horas y, cerca de medianoche, días distintos para el mismo mensaje.

## Resultado esperado

Toda fecha y hora operativa de la aplicación se muestra en `America/Mexico_City`, con formato
`es-MX`, sin importar la zona configurada en el dispositivo del agente.

## No objetivos

- No se modifican los instantes persistidos ni se convierte información histórica.
- No se cambia la configuración de zona horaria del servidor ni del navegador de los usuarios.

## Reglas e invariantes

1. La fuente de verdad temporal se conserva en UTC; la presentación declara explícitamente la zona
   operativa al formatear.
2. La agrupación «Hoy» y «Ayer» usa el día de Ciudad de México, no los métodos locales de `Date`.
3. Ninguna pantalla operativa elige la zona del sistema del agente implícitamente.

## Datos, compatibilidad y rollback

No hay migración ni cambio de contrato. La utilidad de presentación es compatible con todos los
instantes ISO existentes. El rollback revierte la utilidad y sus consumidores; no requiere
reconciliación de datos.

## Plan de pruebas

- Unitarias: hora, fecha y agrupación en el borde de medianoche de Ciudad de México.
- Antiatajo: el mismo instante que ya cambió de día en Colombia continúa perteneciendo al día
  anterior en la operación mexicana.

## Criterios de aceptación

- [x] Dos agentes en zonas distintas ven la misma hora y fecha operativa.
- [x] Bandeja, mensajes, multimedia, canales, Reservas y Reseñas usan la misma política.
- [ ] Controles de calidad completos superados.
