# Alcance de producto — Chat Zernio / UI personalizada

- **Versión:** 1.0
- **Fecha:** 2026-08-27
- **Estado:** documento de alcance

## 1. Propósito

Chat Zernio es una **UI de atención conversacional personalizada** para equipos que atienden redes sociales y mensajería. Zernio actúa como la capa de conexión y transporte con las plataformas; la aplicación propia es el espacio de trabajo del equipo, con identidad visual, reglas operativas, datos y automatizaciones adaptadas a cada cliente.

El primer tenant configurado es **Inside Spa**, con su logo, colores e identidad visual. La arquitectura permite crear un tenant aislado para cada cliente futuro.

## 2. Qué se ha construido hasta ahora

### Bandeja de atención personalizada

- Inicio de sesión y sesión protegida con Supabase Auth.
- Bandeja multicanal conectada a la API propia; la interfaz no consulta tablas operativas directamente.
- Conversaciones reales de Zernio, historial local y envío de respuestas humanas.
- Identificación visible del canal: Instagram, Messenger, WhatsApp, TikTok u otros valores que entregue el proveedor.
- Lista de contactos compacta con estado, canal, usuario externo y avatar cuando Zernio lo entregue.
- Barras de desplazamiento independientes para contactos e historial.
- Vista adaptada a la identidad de Inside Spa.

### Operación del equipo

- Vista de todas las conversaciones del tenant.
- Vista **Asignadas a mí** para cada integrante.
- Estados operativos: abierta, pendiente y resuelta.
- Asignación a integrantes por administradores y supervisores.
- Etiquetas internas privadas por tenant.
- Respuestas rápidas privadas por tenant.
- Notas privadas del equipo, no visibles al contacto.
- Interruptor por conversación para activar o pausar el bot.
- Indicador visual de conversación nueva que desaparece al abrirla durante la sesión.

### Integración y seguridad

- Webhook firmado de Zernio, con validación HMAC y deduplicación de eventos.
- Separación estricta por tenant: una cuenta de canal pertenece a un solo cliente.
- Mensajes entrantes normalizados en un worker, sin exponer claves al navegador.
- Estados de envío, entrega, lectura y fallo procesados cuando el proveedor los informa.
- Perfil visual de contacto: usuario y avatar se obtienen solo de eventos firmados; los avatares se validan y se guardan en un bucket privado de Supabase.
- URLs de avatar temporales y autorizadas; la UI no recibe ni conserva la URL original del proveedor.

## 3. Alcance objetivo del producto

La meta es una consola personalizada de atención y automatización, no una copia genérica de otro producto. Debe permitir que cada cliente tenga su propia marca, reglas, integrantes, canales, inteligencia artificial y organización interna.

### Capacidades objetivo

1. **Conexión de canales sin copiar IDs**
   - Un administrador elige la plataforma desde la UI.
   - Zernio realiza la autorización oficial.
   - La cuenta se asocia automáticamente al tenant correcto mediante webhook firmado.

2. **Atención humana organizada**
   - Bandejas, asignaciones, estados, etiquetas, notas y respuestas rápidas.
   - Búsqueda y filtros adaptados a cada operación.
   - Datos y permisos separados entre clientes.

3. **Automatización con IA controlada**
   - El agente de IA podrá responder conversaciones cuando el bot esté activado.
   - El equipo podrá desactivarlo por conversación y recuperará el control inmediato.
   - La IA se conectará mediante un Gateway validado; no tendrá acceso libre a secretos, datos de otros tenants ni herramientas no autorizadas.

4. **Experiencia visual por cliente**
   - Logo, paleta, nombre, navegación y vocabulario ajustados a cada marca.
   - Componentes reutilizables sin mezclar datos o apariencia entre tenants.

5. **Capas futuras, sujetas a diseño y aprobación**
   - Métricas operativas, SLA y reportes.
   - Biblioteca de campañas y plantillas de WhatsApp.
   - Reglas de asignación, automatizaciones y escalamiento.
   - Adjuntos, multimedia aprobada y gestión de activos.
   - Auditoría ampliada, exportación y retención de datos.

## 4. Límites actuales de plataformas y proveedor

| Tema                   | Situación actual                                                                                                      | Implicación para la UI personalizada                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram              | Canal de conversación integrado en el proyecto.                                                                       | Puede alimentar la bandeja y el historial cuando la cuenta y webhook estén configurados.                                                                               |
| Facebook / Messenger   | Soportado por la API de Inbox de Zernio.                                                                              | Requiere conectar la cuenta y completar la configuración del webhook.                                                                                                  |
| WhatsApp               | Zernio admite conversaciones, texto, multimedia y plantillas aprobadas.                                               | Hay que respetar la ventana de 24 horas y las reglas de Meta; fuera de esa ventana se necesita una plantilla aprobada.                                                 |
| TikTok                 | Zernio lo lista para OAuth, publicación de videos y analítica, pero no entre los canales de conversación de su Inbox. | **TikTok no recibirá ni enviará mensajes en esta bandeja por ahora.** Se incorporará solo cuando Zernio habilite mensajería Inbox para TikTok y se valide su contrato. |
| Plantillas de WhatsApp | Zernio dispone de API para crear, importar y listar plantillas aprobadas por Meta.                                    | La UI actual todavía no administra esas plantillas. Es un módulo futuro; no se debe confundir con las respuestas rápidas internas.                                     |
| Bot con IA             | La base de control por conversación existe.                                                                           | La conexión productiva con el flujo de IA/n8n, sus políticas de respuesta y observabilidad todavía requiere un corte de integración específico.                        |

Fuentes técnicas de referencia: [plataformas de Zernio](https://docs.zernio.com/platforms), [conversaciones de Inbox](https://docs.zernio.com/messages/create-inbox-conversation), [mensajes y restricciones por plataforma](https://docs.zernio.com/messages/send-inbox-message) y [plantillas de WhatsApp](https://docs.zernio.com/platforms/whatsapp/templates).

## 5. Aclaración: Zernio vs. funcionalidades de la UI

Zernio no es la fuente de verdad de la operación interna de este producto. Es el proveedor de conexión a canales y de transporte de mensajes. La UI propia crea las capacidades operativas que el equipo necesita.

| Funcionalidad                           | Responsable actual                  | Estado                                                                                                                                                   |
| --------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conectar cuentas y transportar mensajes | Zernio + integración propia         | Implementado para el flujo actual; conexión automática lista, pendiente de configuración externa de claves, URL de retorno y evento `account.connected`. |
| Bandeja, asignación y estados           | UI / API propia                     | Implementado.                                                                                                                                            |
| Etiquetas internas                      | UI / API propia                     | Implementado; privadas por tenant.                                                                                                                       |
| Respuestas rápidas                      | UI / API propia                     | Implementado; son textos internos reutilizables, no plantillas aprobadas por Meta.                                                                       |
| Plantillas oficiales de WhatsApp        | Meta / Zernio + módulo futuro       | No implementado en la UI actual.                                                                                                                         |
| IA que responde autónomamente           | Gateway propio + flujo de IA futuro | Base de control implementada; integración productiva pendiente.                                                                                          |
| TikTok Inbox                            | Proveedor                           | No disponible para mensajes en el alcance actual.                                                                                                        |

## 6. Beneficios frente a ManyChat

ManyChat es una plataforma madura de automatización multicanal, con Inbox, etiquetas, campos de contacto, campañas y flujos visuales. Por ejemplo, su Inbox cubre Instagram, Messenger, WhatsApp, Telegram y SMS, y maneja asignación y etiquetas según el plan contratado. [Referencia oficial de ManyChat Inbox](https://help.manychat.com/hc/en-us/articles/14281070478748-Manychat-Inbox).

La propuesta de Chat Zernio no pretende afirmar que hoy reemplaza todas las capacidades maduras de ManyChat. Su ventaja es la **personalización y control del producto**:

| Beneficio               | Chat Zernio / UI personalizada                                                                                                        | ManyChat                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Identidad de marca      | Logo, colores, vocabulario y experiencia pueden ajustarse a cada cliente.                                                             | Interfaz y experiencia estándar de plataforma.                                                              |
| Reglas de operación     | Se pueden diseñar según el proceso real: roles, asignaciones, etiquetas, notas y control de IA.                                       | Se trabaja dentro de las capacidades y planes disponibles de la plataforma.                                 |
| Aislamiento de clientes | Tenant, miembros, conversaciones y recursos internos separados en la base propia.                                                     | Gestión dentro de las cuentas y estructura de ManyChat.                                                     |
| Datos operativos        | La aplicación controla su modelo local, historial operativo y políticas de acceso.                                                    | Los datos y automatizaciones viven principalmente dentro de ManyChat.                                       |
| Integración de IA       | Puede implementarse con reglas de seguridad específicas: botón de pausa, validación de salida, trazabilidad y herramientas limitadas. | ManyChat ofrece automatizaciones propias; los flujos avanzados siguen su modelo y compatibilidad por canal. |
| Evolución               | Se construyen módulos solicitados por el negocio sin esperar que una función sea priorizada por un proveedor.                         | Depende de la hoja de ruta, plan y compatibilidad de ManyChat.                                              |

ManyChat mantiene ventajas actuales importantes: constructor de automatizaciones consolidado, campañas/broadcasts, herramientas de adquisición y plantillas compartibles. Esas capacidades se deben considerar módulos futuros y no prometerse hasta diseñarlas, implementarlas y validarlas.

## 7. Limitaciones y dependencias operativas

1. El servidor API, worker y web deben estar activos para procesar mensajes y mostrar cambios.
2. Las cuentas de Zernio requieren una autorización válida y un webhook HTTPS público configurado.
3. Las URLs temporales de Cloudflare cambian cuando se reinicia el túnel; una operación estable requiere dominio o túnel persistente antes de producción.
4. Las fotos y usuarios nuevos aparecen tras el siguiente mensaje que incluya esos datos desde Zernio; no se hace una importación retrospectiva de perfiles existentes.
5. Las restricciones de cada plataforma prevalecen sobre la UI: permisos, ventanas de mensajería, plantillas, formatos y revisiones de Meta/WhatsApp no se pueden omitir.
6. La interfaz no debe asumir que todos los canales admiten botones, adjuntos, plantillas, lectura, escritura o automatización con las mismas reglas.

## 8. Criterio de éxito de la siguiente etapa

La siguiente etapa estará completa cuando un administrador pueda conectar una nueva cuenta compatible desde la UI, recibir mensajes en la bandeja personalizada, ver el perfil del contacto, asignar y organizar la conversación, y activar o pausar el comportamiento de IA por chat sin que los datos se mezclen con los de otro cliente.
