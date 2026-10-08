import { describe, expect, it, vi } from 'vitest';
import { createN8nTransport, N8nDeliveryError, parseN8nWebhookUrl } from './n8n-transport';

const notification = {
  buttonPayload: 'Asistiré',
  contactId: '33333333-3333-4333-8333-333333333333',
  conversationId: '44444444-4444-4444-8444-444444444444',
  event: 'whatsapp.button_tap' as const,
  messageId: '55555555-5555-4555-8555-555555555555',
  occurredAt: '2026-10-08T18:57:29.122Z',
  template: { language: 'es_MX', name: 'notificacion_48h' }
};

describe('transporte a n8n', () => {
  it('manda el aviso con el secreto y la clave del evento', async () => {
    const request = vi.fn(async () => new Response('{}', { status: 200 }));
    const transport = createN8nTransport(
      { secret: 'secreto-de-prueba', url: 'https://n8n.example.test/webhook/tap' },
      request as unknown as typeof fetch
    );

    await transport.notify({ idempotencyKey: 'clave-1', notification });

    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://n8n.example.test/webhook/tap');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer secreto-de-prueba',
      'Idempotency-Key': 'clave-1'
    });
    expect(JSON.parse(String(init.body))).toEqual(notification);
  });

  it.each([400, 401, 403, 404, 422])(
    'un %s no se reintenta: repetir no arregla el secreto ni el contrato',
    async (status) => {
      const transport = createN8nTransport(
        { secret: 's', url: 'https://n8n.example.test/webhook/tap' },
        (async () => new Response('{}', { status })) as unknown as typeof fetch
      );

      await expect(transport.notify({ idempotencyKey: 'k', notification })).rejects.toEqual(
        expect.objectContaining<Partial<N8nDeliveryError>>({
          code: `n8n_http_${status}`,
          retryable: false
        })
      );
    }
  );

  it.each([429, 500, 502, 503])('un %s si se reintenta: puede pasar solo', async (status) => {
    const transport = createN8nTransport(
      { secret: 's', url: 'https://n8n.example.test/webhook/tap' },
      (async () => new Response('{}', { status })) as unknown as typeof fetch
    );

    await expect(transport.notify({ idempotencyKey: 'k', notification })).rejects.toEqual(
      expect.objectContaining<Partial<N8nDeliveryError>>({
        code: `n8n_http_${status}`,
        retryable: true
      })
    );
  });

  it('una caida de red se reintenta con su propio codigo', async () => {
    const transport = createN8nTransport(
      { secret: 's', url: 'https://n8n.example.test/webhook/tap' },
      (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch
    );

    await expect(transport.notify({ idempotencyKey: 'k', notification })).rejects.toEqual(
      expect.objectContaining<Partial<N8nDeliveryError>>({
        code: 'n8n_unreachable',
        retryable: true
      })
    );
  });
});

describe('direccion del webhook', () => {
  it('acepta HTTPS y los destinos internos en claro', () => {
    // Varias variantes de la misma clase: dominio publico con TLS, y servicios de la red del swarm.
    for (const value of [
      'https://n8n.example.test/webhook/tap',
      'http://n8n:5678/webhook/tap',
      'http://localhost:5678/webhook/tap',
      'http://127.0.0.1:5678/webhook/tap',
      'http://10.0.0.5:5678/webhook/tap',
      'http://192.168.1.20:5678/webhook/tap'
    ]) {
      expect(parseN8nWebhookUrl(value), value).not.toBeNull();
    }
  });

  it('rechaza mandar el secreto en claro por internet', () => {
    for (const value of ['http://n8n.example.test/webhook/tap', 'http://8.8.8.8/webhook/tap']) {
      expect(parseN8nWebhookUrl(value), value).toBeNull();
    }
  });

  it('rechaza lo que no es una direccion utilizable', () => {
    for (const value of ['', '   ', null, undefined, 42, 'n8n:5678', 'ftp://n8n.example.test']) {
      expect(parseN8nWebhookUrl(value), String(value)).toBeNull();
    }
  });

  it('rechaza credenciales dentro de la direccion: el secreto va en la cabecera', () => {
    expect(parseN8nWebhookUrl('https://usuario:clave@n8n.example.test/webhook')).toBeNull();
  });
});
