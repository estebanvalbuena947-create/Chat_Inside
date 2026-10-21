# Despliegue de horarios y fecha operativa

Este corte está implementado localmente. No se ejecutaron migraciones ni cambios de configuración
sobre datos remotos. Se agrupa con la corrección visual de Canales; los demás cortes locales tienen
sus propias instrucciones de despliegue.

## Orden

1. Aplicar `supabase/migrations/20261020150325_advisor_work_schedules.sql` mediante el procedimiento
   habitual del entorno. Es aditiva: tabla de versiones, guardado atómico, cierre de cobertura al
   retirar membresías y lectura de mensajes entrantes previos al período. Revisar permisos e índices
   del entorno y conservar el respaldo habitual.
2. Desplegar API y web del mismo corte, con los contratos compilados y las dependencias del lockfile.
   La API nueva necesita la migración; si falta, muestra un error de horarios en lugar de inventar
   métricas. El código anterior puede funcionar con la migración aplicada.
3. Entrar como administrador en **Equipo → Horario** y seleccionar las membresías reales. Guardar:

   | Integrante | Días            | Entrada  | Salida |
   | ---------- | --------------- | -------- | ------ |
   | Yess       | Martes a sábado | 08:00    | 17:00  |
   | Yess       | Lunes           | 15:00    | 23:00  |
   | Yess       | Domingo         | Descanso | —      |
   | Janeth     | Todos           | 17:00    | 23:00  |
   | Eizy       | Domingo y lunes | 08:00    | 15:00  |

   La configuración empieza al guardar cada horario; las versiones anteriores permanecen. No se
   codifican nombres ni se adivinan identidades. El domingo 15:00–17:00 no tiene cobertura declarada.

4. Comprobar una consulta de Hoy y una fecha elegida en Reservas; comparar la fecha operativa y
   actualización visibles con el reloj real de Ciudad de México. La gráfica y la tabla del día
   deben coincidir; la casilla de todos los días amplía explícitamente la tabla.
5. Abrir cada rango de espera, comprobar paginación y abrir una conversación. Las respuestas
   anteriores a la primera configuración conservan la etiqueta de tiempo corrido; no son tiempos
   hábiles reconstruidos. Comprobar un caso nuevo dentro de cobertura y otro cruzando un descanso.

## Límites y diagnóstico

- Estos rangos cuentan conversaciones con una primera respuesta humana en el período; no son una
  cola de conversaciones pendientes. El bot no termina la espera humana.
- Se conserva la regla existente de emparejar con el último mensaje entrante previo. Los turnos no
  cambian la asignación ni el pulso de presencia. Las medias individuales no se presentan como
  responsabilidad histórica dentro de horario.
- Revisar el reloj del host si la fecha operativa servida no coincide con el instante real. La
  revisión de código no prueba que el servidor esté sincronizado. No se desplazaron timestamps para
  compensar un reloj incorrecto. Las fechas originales sin zona explícita requieren verificar su
  semántica con el sistema de origen; este corte no reescribe sus datos.
- Si el reporte también afecta al bot de n8n, probar ese recorrido por separado. Este corte corrige
  la aplicación; no cambia un workflow externo ni su contexto temporal.
- Los límites de lectura de métricas continúan siendo explícitos. El historial de horarios se lee
  por páginas y rechaza un exceso sin aparentar una configuración completa.

## Rollback

Volver a la API/web previas manteniendo la migración aditiva y sus registros. No borrar versiones,
mensajes ni reservas como parte del rollback de la aplicación. Conservar el cierre automático de
cobertura de una membresía retirada. No ejecutar una migración destructiva para volver al diseño.

## Repetir las verificaciones locales

La prueba SQL usa PostgreSQL embebido solo como herramienta temporal; no se agrega al producto:

```powershell
$verificationDir = Join-Path $env:TEMP 'codex-schedule-postgres'
npm install --prefix $verificationDir --no-audit --no-fund @electric-sql/pglite@0.5.10
node tools/verify-work-schedules-db.mjs (Join-Path $verificationDir 'node_modules/@electric-sql/pglite')
```

`tools/verify-attention-ui.mjs` monta los componentes reales de Equipo, Actividad y Reservas en una
página aislada con respuestas ficticias. Usa TypeScript/Vite ya instalados en el workspace y recibe
como argumento una instalación de Playwright con Chrome disponible:

```text
node tools/verify-attention-ui.mjs <ruta-al-paquete-playwright>
```

Verifica el guardado de turnos, el error de carga y reintento sin ofrecer un horario vacío como
válido, la apertura del detalle y su callback de conversación, el filtro de todos los días, la
carrera de fechas y cinco anchos de pantalla. La resolución del identificador de conversación y sus
permisos se prueban en la suite de API; este montaje no inicia una sesión contra producción.
