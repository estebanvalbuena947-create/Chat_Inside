import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZernioApiClient } from './zernio-api.client';

function respuesta(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

describe('cliente de Zernio: acciones sobre comentarios', () => {
  const cliente = new ZernioApiClient();
  let fetchSimulado: ReturnType<typeof vi.fn>;

  function ultimaLlamada(): { init: RequestInit; url: string } {
    const [url, init] = fetchSimulado.mock.calls[0] as unknown as [string, RequestInit];
    return { init, url };
  }

  beforeEach(() => {
    process.env.ZERNIO_API_KEY = 'clave-de-prueba';
    fetchSimulado = vi.fn();
    vi.stubGlobal('fetch', fetchSimulado);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ZERNIO_API_KEY;
  });

  it('oculta el comentario con la cuenta en el cuerpo', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { hidden: true }));
    await cliente.hideComment({
      accountId: 'cuenta-1',
      commentId: 'comentario-1',
      postId: 'post-1'
    });
    const { init, url } = ultimaLlamada();
    expect(url).toBe('https://zernio.com/api/v1/inbox/comments/post-1/comentario-1/hide');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ accountId: 'cuenta-1' });
  });

  it('vuelve a mostrar el comentario con la cuenta en la consulta', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { hidden: false }));
    await cliente.unhideComment({
      accountId: 'cuenta-1',
      commentId: 'comentario-1',
      postId: 'post-1'
    });
    const { init, url } = ultimaLlamada();
    expect(url).toBe(
      'https://zernio.com/api/v1/inbox/comments/post-1/comentario-1/hide?accountId=cuenta-1'
    );
    expect(init.method).toBe('DELETE');
  });

  it('elimina el comentario con los dos parametros que exige el contrato', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { success: true }));
    await cliente.deleteComment({
      accountId: 'cuenta-1',
      commentId: 'comentario-1',
      postId: 'post-1'
    });
    const { init, url } = ultimaLlamada();
    expect(url).toContain('/v1/inbox/comments/post-1?');
    expect(url).toContain('accountId=cuenta-1');
    expect(url).toContain('commentId=comentario-1');
    expect(init.method).toBe('DELETE');
  });

  it('responde en publico con la clave de idempotencia', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(200, { success: true, data: { commentId: 'respuesta-1' } })
    );
    const resultado = await cliente.replyToComment({
      accountId: 'cuenta-1',
      commentId: 'comentario-1',
      idempotencyKey: 'clave-1',
      message: 'Gracias por escribirnos',
      postId: 'post-1'
    });
    const { init } = ultimaLlamada();
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'clave-1' });
    expect(JSON.parse(String(init.body))).toMatchObject({ commentId: 'comentario-1' });
    expect(resultado.commentId).toBe('respuesta-1');
  });

  it('rechaza la respuesta publica sin identificador en la respuesta del proveedor', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { success: true, data: {} }));
    await expect(
      cliente.replyToComment({
        accountId: 'cuenta-1',
        commentId: 'comentario-1',
        idempotencyKey: 'clave-1',
        message: 'Hola',
        postId: 'post-1'
      })
    ).rejects.toThrow(/identificador/i);
  });

  it('responde en privado y devuelve el identificador del mensaje', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { status: 'success', messageId: 'mensaje-1' }));
    const resultado = await cliente.sendPrivateReply({
      accountId: 'cuenta-1',
      commentId: 'comentario-1',
      message: 'Te escribimos por privado',
      postId: 'post-1'
    });
    const { url } = ultimaLlamada();
    expect(url).toBe('https://zernio.com/api/v1/inbox/comments/post-1/comentario-1/private-reply');
    expect(resultado.messageId).toBe('mensaje-1');
  });

  it('explica que la respuesta privada ya se gasto, sin decir que el servicio fallo', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(400, {
        error: 'Private reply already consumed',
        details: { privateReplyConsumed: true }
      })
    );
    await expect(
      cliente.sendPrivateReply({
        accountId: 'cuenta-1',
        commentId: 'comentario-1',
        message: 'Hola',
        postId: 'post-1'
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('conserva el motivo del proveedor cuando la plataforma rechaza', async () => {
    fetchSimulado.mockResolvedValue(respuesta(400, { error: 'comment already deleted' }));
    await expect(
      cliente.deleteComment({ accountId: 'cuenta-1', commentId: 'comentario-1', postId: 'post-1' })
    ).rejects.toThrow('comment already deleted');
  });

  it('distingue un permiso denegado de una caida del servicio', async () => {
    fetchSimulado.mockResolvedValue(respuesta(403, { error: 'inbox addon required' }));
    await expect(
      cliente.hideComment({ accountId: 'cuenta-1', commentId: 'comentario-1', postId: 'post-1' })
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('cliente de Zernio: conversiones Meta', () => {
  const cliente = new ZernioApiClient();
  let fetchSimulado: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.ZERNIO_API_KEY = 'clave-de-prueba';
    fetchSimulado = vi.fn();
    vi.stubGlobal('fetch', fetchSimulado);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ZERNIO_API_KEY;
  });

  it('no lanza cuando Meta rechaza un evento del lote', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(200, {
        eventsFailed: 1,
        eventsReceived: 0,
        failures: [{ code: 100, eventId: 'evt-1', eventIndex: 0, message: 'Invalid event_time' }],
        platform: 'metaads'
      })
    );

    const result = await cliente.sendConversions({
      accountId: 'cuenta',
      destinationId: 'pixel',
      events: [{ eventId: 'evt-1', eventName: 'Purchase', eventTime: 1, user: {} }]
    });

    expect(result.eventsFailed).toBe(1);
    expect(result.failures[0]?.message).toBe('Invalid event_time');
  });
});

describe('cliente de Zernio: plantillas de WhatsApp', () => {
  const cliente = new ZernioApiClient();
  let fetchSimulado: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.ZERNIO_API_KEY = 'clave-de-prueba';
    fetchSimulado = vi.fn();
    vi.stubGlobal('fetch', fetchSimulado);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ZERNIO_API_KEY;
  });

  it('pide las plantillas de la cuenta y se queda con lo que el contrato necesita', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(200, {
        success: true,
        templates: [
          {
            name: 'confirmacion_reserva',
            language: 'es_MX',
            category: 'UTILITY',
            status: 'APPROVED',
            // Campos que el proveedor puede agregar: se ignoran en lugar de romper la pantalla.
            quality_score: { score: 'GREEN' }
          }
        ]
      })
    );

    await expect(cliente.listWhatsappTemplates('cuenta-1')).resolves.toEqual([
      {
        category: 'UTILITY',
        language: 'es_MX',
        name: 'confirmacion_reserva',
        previewText: '',
        status: 'APPROVED',
        variables: []
      }
    ]);

    const [url, init] = fetchSimulado.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://zernio.com/api/v1/whatsapp/templates?accountId=cuenta-1');
    expect(init.method).toBe('GET');
  });

  it('lee el texto visible y los huecos de cualquier componente', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(200, {
        success: true,
        templates: [
          {
            name: 'recordatorio',
            language: 'es_MX',
            status: 'APPROVED',
            components: [
              { type: 'HEADER', format: 'TEXT', text: 'Recordatorio' },
              { type: 'BODY', text: 'Hola {{1}}, tu cita es el {{2}}' },
              { type: 'FOOTER', text: 'Inside Spa' },
              // Un hueco en un boton cuenta igual que uno en el cuerpo.
              { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver {{3}}', url: 'https://x' }] }
            ]
          },
          {
            name: 'confirmacion_48h',
            language: 'es_MX',
            status: 'APPROVED',
            components: [
              { type: 'HEADER', format: 'TEXT', text: 'confirmacion de cita' },
              { type: 'BODY', text: 'Hola, confirmamos tu reservacion.' },
              { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Asistire' }] }
            ]
          }
        ]
      })
    );

    const plantillas = await cliente.listWhatsappTemplates('cuenta-1');

    // Varias variantes de la misma clase: hueco en cuerpo y hueco en boton.
    expect(plantillas[0]?.variables).toEqual(['{{1}}', '{{2}}', '{{3}}']);
    expect(plantillas[0]?.previewText).toBe(
      'Recordatorio\nHola {{1}}, tu cita es el {{2}}\nInside Spa'
    );
    // Sin huecos no se inventa ninguno, y los botones no entran en el texto visible.
    expect(plantillas[1]?.variables).toEqual([]);
    expect(plantillas[1]?.previewText).toBe(
      'confirmacion de cita\nHola, confirmamos tu reservacion.'
    );
  });

  it('descarta una plantilla sin nombre', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(200, {
        success: true,
        templates: [{ language: 'es_MX' }, { name: 'hola', language: 'es_MX' }]
      })
    );

    await expect(cliente.listWhatsappTemplates('cuenta-1')).resolves.toEqual([
      {
        category: null,
        language: 'es_MX',
        name: 'hola',
        previewText: '',
        status: null,
        variables: []
      }
    ]);
  });

  it('no inventa plantillas cuando el proveedor no devuelve la lista', async () => {
    fetchSimulado.mockResolvedValue(respuesta(200, { success: true }));
    await expect(cliente.listWhatsappTemplates('cuenta-1')).resolves.toEqual([]);
  });

  it('conserva el motivo cuando el proveedor rechaza la consulta', async () => {
    fetchSimulado.mockResolvedValue(
      respuesta(400, { error: 'Invalid input: expected string, received null' })
    );

    await expect(cliente.listWhatsappTemplates('cuenta-1')).rejects.toThrow(
      'Invalid input: expected string, received null'
    );
  });
});
