/**
 * La ventana de servicio de WhatsApp.
 *
 * Meta solo admite mensajes libres (texto, multimedia) durante las **24 horas** siguientes al ultimo
 * mensaje del cliente. Fuera de ese plazo, lo unico que se puede enviar es una plantilla aprobada.
 * La politica vive aqui, con su umbral, para que quien la aplique y quien la lea digan lo mismo.
 */

/** Las 24 horas de ventana, en milisegundos. */
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WhatsappServiceWindow = {
  /** Instante en que la ventana se cierra. */
  expiresAt: string;
  /** Ultimo mensaje del cliente que la abrio. */
  lastInboundAt: string;
  open: boolean;
};

/**
 * La ventana, o nada si no se puede afirmar.
 *
 * Sin un mensaje entrante registrado no hay ventana que calcular, y devolver `null` es la respuesta
 * honesta: no se sabe, y quien envia decide. Inventar una ventana cerrada bloquearia envios
 * legitimos, como una conversacion que empezo desde un anuncio y todavia no tiene entrantes.
 *
 * En el limite se considera cerrada: a las 24 horas exactas, Meta ya no admite mensajes libres.
 */
export function whatsappServiceWindow(
  lastInboundAt: string | null | undefined,
  now: number
): WhatsappServiceWindow | null {
  if (typeof lastInboundAt !== 'string' || !lastInboundAt.trim()) return null;

  const inicio = new Date(lastInboundAt);
  if (Number.isNaN(inicio.getTime())) return null;

  const expiresAt = inicio.getTime() + WHATSAPP_SERVICE_WINDOW_MS;
  return {
    expiresAt: new Date(expiresAt).toISOString(),
    lastInboundAt: inicio.toISOString(),
    open: now < expiresAt
  };
}
