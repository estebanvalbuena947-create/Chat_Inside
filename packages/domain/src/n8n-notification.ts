import {
  WHATSAPP_BUTTON_TAP_EVENT,
  whatsappButtonTapNotificationSchema,
  type WhatsappButtonTapNotification
} from '@chat-zernio/contracts';

/**
 * Aviso a n8n: el cliente pulso un boton de una plantilla aprobada.
 *
 * Hermano de `agent-gateway`: aquel es el contrato de ENTRADA (la decision que n8n nos devuelve) y
 * este el de SALIDA (el aviso que le mandamos). El esquema vive en `contracts`, con el resto de los
 * contratos publicos; aqui solo queda la puerta de validacion.
 */

export { WHATSAPP_BUTTON_TAP_EVENT };
export type { WhatsappButtonTapNotification };

export function parseWhatsappButtonTapNotification(value: unknown): WhatsappButtonTapNotification {
  return whatsappButtonTapNotificationSchema.parse(value);
}
