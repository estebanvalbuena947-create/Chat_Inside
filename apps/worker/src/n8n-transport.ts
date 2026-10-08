import type { WhatsappButtonTapNotification } from '@chat-zernio/domain';

/**
 * Entrega de avisos al webhook de n8n.
 *
 * Es el unico sitio que conoce el protocolo del agente: direccion, encabezados, tiempo de espera y
 * como se clasifica su respuesta. Quien lo usa solo sabe que entrego o que fallo y por que codigo.
 */

export class N8nDeliveryError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: string
  ) {
    super(code);
  }
}

export type N8nTransport = {
  notify(input: {
    idempotencyKey: string;
    notification: WhatsappButtonTapNotification;
  }): Promise<void>;
};

const TIMEOUT_MS = 10_000;

export function createN8nTransport(
  input: { secret: string; url: string },
  request: typeof fetch = fetch
): N8nTransport {
  return {
    async notify({ idempotencyKey, notification }): Promise<void> {
      let response: Response;
      try {
        response = await request(input.url, {
          body: JSON.stringify(notification),
          headers: {
            Authorization: `Bearer ${input.secret}`,
            'Content-Type': 'application/json',
            // La misma clave que en nuestra cola: n8n puede deduplicar con ella si el reintento
            // llega despues de que su respuesta se perdiera.
            'Idempotency-Key': idempotencyKey
          },
          method: 'POST',
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch {
        // Timeout, DNS o conexion rechazada: puede ser pasajero, y como no hubo respuesta tampoco
        // hay certeza de que n8n no lo haya recibido. La clave de idempotencia cubre ese caso.
        throw new N8nDeliveryError(true, 'n8n_unreachable');
      }

      if (response.ok) return;

      // Un 4xx es el contrato o el secreto: insistir no lo arregla y solo hace ruido. Un 429 o un
      // 5xx si pueden pasar solos.
      const retryable = response.status === 429 || response.status >= 500;
      throw new N8nDeliveryError(retryable, `n8n_http_${response.status}`);
    }
  };
}

/** Nombre de servicio dentro de la red del swarm, o direccion privada: no cruza internet. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  // Un nombre sin puntos es un servicio de la red del contenedor, no un dominio de internet.
  if (!host.includes('.')) return true;
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

/**
 * La direccion del webhook, o nada.
 *
 * Un aviso lleva un secreto en la cabecera, asi que no puede viajar en claro por internet: se exige
 * HTTPS salvo que el destino sea interno (un servicio de la red del swarm o una direccion privada),
 * que es como suele estar n8n al lado de la API.
 */
export function parseN8nWebhookUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return null;
    if (url.protocol === 'https:') return url.toString();
    if (url.protocol === 'http:' && isPrivateHost(url.hostname)) return url.toString();
    return null;
  } catch {
    return null;
  }
}
