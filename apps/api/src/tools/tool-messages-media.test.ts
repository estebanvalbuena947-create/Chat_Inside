import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import type { TenantMessageService } from '../conversations/tenant-message.service';
import { ToolMessagesService } from './tool-messages.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Envio con multimedia de sede.
 *
 * La prueba que mas importa es la de la imagen inexistente: NO debe quedar nada encolado. La
 * herramienta resuelve la multimedia antes de encolar precisamente para eso -- si encolara primero
 * y fallara despues, el cliente recibiria el texto sin la foto y nadie lo notaria.
 *
 * El doble usa una cola de respuestas porque el servicio consulta tres tablas distintas en un orden
 * concreto (interruptor, multimedia, adjuntos). Con un unico resultado, la prueba del orden pasaria
 * sin comprobar el orden.
 */

const UUID = '6b1f4c2e-9d3a-4f58-8b7c-1e2d3f4a5b6c';
const MEDIA = { id: 'media-1', kind: 'image', storage_object_path: 'b8b/valle/foto.jpg' };

function crearServicio(opciones: { mediaIds?: number } = {}) {
  const enqueueOutbound = vi.fn().mockResolvedValue({ item: { id: 'msg-1' } });
  const insert = vi.fn();
  let paso = 0;

  const respuestas: unknown[] = [
    { data: { sending_enabled: true }, error: null }, // 1) interruptor
    // 2) canal de la conversacion: no es WhatsApp, asi que la ventana de 24 h no interviene
    { data: { channel_account: { platform: 'instagram' }, id: 'conv-1' }, error: null },
    {
      data: opciones.mediaIds === 0 ? [] : [MEDIA],
      error: null
    }, // 3) multimedia
    { data: null, error: null } // 4) adjuntos
  ];

  const siguiente = () => {
    const r = respuestas[Math.min(paso, respuestas.length - 1)];
    paso += 1;
    return Promise.resolve(r);
  };

  const cadena = (): Record<string, unknown> => {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      in: () => encadenable,
      insert: (...args: unknown[]) => {
        insert(...args);
        return encadenable;
      },
      maybeSingle: () => siguiente(),
      select: () => encadenable,
      then: (resolver: (valor: unknown) => unknown) => siguiente().then(resolver)
    };
    return encadenable;
  };

  const supabase = { from: vi.fn(() => cadena()) };

  const servicio = new ToolMessagesService(
    {
      assertScope: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({
        scopes: ['messages'],
        tenantId: 'tenant-1',
        tokenId: 'token-1'
      })
    } as unknown as ToolTokenService,
    { enqueueOutbound } as unknown as TenantMessageService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { enqueueOutbound, insert, servicio };
}

/**
 * Envio solo con archivo.
 *
 * El contrato dice "uno de los dos": texto o multimedia. La base acepta el cuerpo vacio y ya hay
 * mensajes asi -- clientes que mandaron solo una foto -- pero la clave de idempotencia NO se relaja:
 * sin ella, un reintento le mandaria la foto dos veces al cliente.
 */
describe('envio solo con archivo, sin texto', () => {
  it('encola el mensaje con el cuerpo vacio cuando lleva archivo', async () => {
    const { enqueueOutbound, insert, servicio } = crearServicio();

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      media: [{ branchMediaId: MEDIA.id }]
    });

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
    const command = (enqueueOutbound.mock.calls[0]?.[0] as { command: { body: string } }).command;
    expect(command.body).toBe('');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('sin texto y sin archivo no encola nada', async () => {
    const { enqueueOutbound, insert, servicio } = crearServicio();

    await expect(
      servicio.send('Bearer token', { conversationId: 'conv-1', idempotencyKey: UUID })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('el archivo no sustituye a la clave de idempotencia', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: '',
        media: [{ branchMediaId: MEDIA.id }]
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });
});

describe('envio con multimedia de sede', () => {
  it('encola el mensaje y escribe el adjunto con su ruta y su origen', async () => {
    const { enqueueOutbound, insert, servicio } = crearServicio();

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      media: [{ branchMediaId: MEDIA.id }],
      text: 'Aqui tienes la foto'
    });

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    const filas = (insert.mock.calls[0] as unknown[] | undefined)?.[0] as Array<
      Record<string, unknown>
    >;
    expect(filas[0]).toMatchObject({
      conversation_id: 'conv-1',
      kind: 'image',
      message_id: 'msg-1',
      ordinal: 0,
      source_kind: 'branch_media',
      storage_object_path: 'b8b/valle/foto.jpg',
      tenant_id: 'tenant-1'
    });
  });

  it('sin media no escribe ninguna fila de adjunto', async () => {
    const { enqueueOutbound, insert, servicio } = crearServicio();

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      text: 'Solo texto'
    });

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it('una imagen que no existe rechaza el envio Y NO encola nada', async () => {
    const { enqueueOutbound, insert, servicio } = crearServicio({ mediaIds: 0 });

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        media: [{ branchMediaId: 'no-existe' }],
        text: 'Con foto'
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('rechaza mas de una imagen, que Meta no admite', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        media: [{ branchMediaId: 'a' }, { branchMediaId: 'b' }],
        text: 'Dos fotos'
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  it('rechaza una lista vacia y un elemento sin branchMediaId', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        media: [],
        text: 'Sin fotos'
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        media: [{ otro: 'campo' }],
        text: 'Sin id'
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });
});
