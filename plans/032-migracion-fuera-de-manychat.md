# 032 — Nuevas versiones de los flujos: Zernio + la base de datos de la UI

Estado: **propuesta para revisión**. Alcance corregido tras confirmar cómo funciona hoy la operación.

## 1. Qué hay hoy (confirmado)

| Pieza                                 | Dónde vive                                                                             | Se toca                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **La lógica del bot y los flujos**    | **n8n**                                                                                | No se reescribe. Se le dan **nuevas versiones** que llaman a nuestra API |
| **Pabau**                             | Llamadas **HTTP desde n8n**                                                            | **No se migra.** Sigue siendo el sistema de reservas                     |
| **Google Sheets y su base conectada** | n8n                                                                                    | **No se migran**                                                         |
| **ManyChat**                          | Solo el **manejo del inbox** y flujos para disparar envíos concretos (fotos, catálogo) | Es lo que se **retira**: su parte de envío pasa a Zernio                 |
| **Zernio**                            | Canal de los mensajes                                                                  | Es el canal definitivo, entrantes y salientes                            |
| **Nuestra base y la UI**              | Conversaciones, mensajes, etiquetas, asignación, notas                                 | Es donde la nueva versión de los flujos lee y escribe                    |

Los 15 flujos de `Flujos/` son los que recibirán **nueva versión**. Las versiones actuales **no se
tocan** mientras tengan ManyChat conectado: las activas tú cuando lo consideres.

## 2. La regla que evita las dobles respuestas

**Un mensaje, un emisor.** Mientras una versión vieja siga conectada, la nueva permanece apagada.
El encendido lo haces tú, flujo a flujo, y la versión anterior se conserva para volver atrás. La UI
se conecta al final.

## 3. Lo que hay que construir de nuestro lado

Solo cuatro piezas. Todo lo demás (reservas, disponibilidad, pagos, catálogo en Sheets) **se queda
donde está**.

### 3.1 Multimedia por sucursal (sí o sí, porque ManyChat la alojaba)

| Tabla          | Campos                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `branches`     | `id`, `tenant_id`, `name`, `slug`, `external_reference` (Pabau), `is_active`                        |
| `branch_media` | `id`, `tenant_id`, `branch_id`, `kind` (imagen/video), `storage_object_path`, `title`, `sort_order` |

Las fotos se suben a **nuestro almacén** con URLs firmadas — el mismo motor que ya copia los
adjuntos de las conversaciones. Así "multimedia Juárez", "multimedia Polanco", "multimedia Lomas"
viven en tu base y el bot las comparte desde ahí.

### 3.2 Credencial de máquina para n8n

| Tabla         | Para qué                                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| `tool_tokens` | `id`, `tenant_id`, `name`, `token_hash`, `scopes`, `last_used_at`, `revoked_at` |

n8n nunca usa la sesión de una persona. Cada token es de un espacio, revocable y con registro de uso.

### 3.3 Los endpoints que sustituyen a ManyChat

| Endpoint                                   | Sustituye a                                       | Notas                                                                                          |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /v1/tools/messages`                  | **el envío de ManyChat** (texto, fotos, catálogo) | Sale **por Zernio** a través de nuestro pipeline, así el mensaje queda en el hilo con su acuse |
| `GET /v1/tools/branches`                   | listados de sucursales                            | sedes activas del espacio                                                                      |
| `GET /v1/tools/branches/{id}/media`        | fotos que hoy sirve ManyChat                      | material de la sede con URLs firmadas                                                          |
| `POST /v1/tools/assignments`               | transferencia a asesor                            | Asigna **y apaga el bot** en esa conversación, en el mismo acto                                |
| `GET /v1/tools/conversations/{id}`         | estado que hoy vive en ManyChat                   | sede, asesor, etiquetas, bot encendido/apagado                                                 |
| `POST /v1/tools/conversations/{id}/labels` | etiquetado desde los flujos                       | reutiliza lo que ya existe                                                                     |

### 3.4 La UI (se conecta al final)

- **Gestión de la multimedia por sede**: subir, ordenar y quitar, en Configuración (como las
  etiquetas y las respuestas rápidas que ya viven ahí).
- **Selector de sede en la bandeja**: la sede es un dato de la conversación, y se podrá filtrar por
  ella. Esto cierra la pregunta de "Sedes" que quedó abierta: son las cinco sucursales.
- **Asignación a asesor visible**: ya existe ("Asignadas a mi", notas); se le suma ver **desde qué
  flujo** llegó la conversación, si hace falta.

## 4. Cambios en lo que ya está

- `conversations`: añadir **`branch_id`** (la sede de la conversación).
- Nada más. La asignación (`assigned_user_id`) y el interruptor de bot (`automation_mode`,
  "Desactivar bot") **ya existen** y son la base de la transferencia a asesor.

## 5. Etapas

| #   | Etapa                                     | Entregable                                                                | Quién                            |
| --- | ----------------------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| 1   | Datos y almacén                           | migraciones de `branches`, `branch_media`, `tool_tokens`; subida de fotos | nosotros                         |
| 2   | Endpoints de tools con pruebas            | `/v1/tools/...` funcionando contra datos reales                           | nosotros                         |
| 3   | Carga inicial                             | sedes y su multimedia cargadas desde la UI                                | tú + nosotros                    |
| 4   | **Nuevas versiones de los flujos en n8n** | cada flujo apuntando a las tools nuevas                                   | **tú**, con nuestra API ya lista |
| 5   | Activación por flujo                      | enciendes la versión nueva y apagas la vieja                              | **tú**                           |
| 6   | Conexión de la UI                         | bandeja por sede, gestión de multimedia                                   | nosotros                         |

## 6. Riesgos

| Riesgo                                                 | Control                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Doble respuesta                                        | activación manual, flujo a flujo (etapa 5)                                |
| Mensajes duplicados por reintento de n8n               | idempotencia por referencia de proveedor (ya es el comportamiento actual) |
| Fotos perdidas al retirar ManyChat                     | se suben a nuestro almacén **antes** de desconectar esa parte             |
| Token de máquina filtrado                              | por espacio, revocable, con `last_used_at` y alcance mínimo               |
| Que la UI muestre algo distinto de lo que envía el bot | todo envío pasa por nuestra API: el hilo es la única fuente de verdad     |

## 7. Preguntas abiertas

1. **¿El catálogo (nombres, precios, links) se queda en Sheets**, o el bot necesita pedirlo a nuestra
   base? Si se queda en Sheets, no creamos tablas de catálogo: solo la multimedia.
2. **¿Las fotos son por sede, o también por servicio?** Si hay material por servicio, la tabla de
   multimedia necesita además el servicio.
3. **¿Cuántos asesores y de qué sedes?** Decide si la asignación debe respetar la sede.

## 8. Decisiones que este documento propone registrar

- **ADR: el canal es Zernio; el motor de flujos sigue en n8n.** No se construye motor propio.
- **ADR: todo mensaje saliente —humano o bot— pasa por nuestra API antes de Zernio**, para que el
  hilo, los acuses y la auditoría sean nuestros y no haya dos verdades.
- **ADR: la sede es un dato de la conversación**, con su multimedia en nuestro almacén.
