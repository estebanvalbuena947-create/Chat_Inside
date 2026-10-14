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

function crearServicio(
  opciones: {
    mediaIds?: number;
    mediaPorTitulo?: unknown[];
    /** La fila solo casa si la busqueda es por contenido: simula un titulo como «Accesorios spa». */
    soloPorContenido?: boolean;
    sede?: string | null;
  } = {}
) {
  const enqueueOutbound = vi.fn().mockResolvedValue({ item: { id: 'msg-1' } });
  const insert = vi.fn();
  const patronesDeTitulo: string[] = [];

  // El doble responde POR TABLA y no por orden: el servicio consulta el interruptor, la
  // conversacion, la multimedia y la tabla de adjuntos, y el orden puede cambiar sin que la prueba
  // deje de comprobar lo que dice comprobar.
  const respuestas: Record<string, unknown> = {
    bot_integrations: { data: { sending_enabled: true }, error: null },
    branch_media: {
      data:
        opciones.mediaPorTitulo !== undefined
          ? opciones.mediaPorTitulo
          : opciones.mediaIds === 0
            ? []
            : [MEDIA],
      error: null
    },
    conversations: {
      data: opciones.sede === null ? { branch_id: null } : { branch_id: opciones.sede ?? 'sede-1' },
      error: null
    },
    message_attachments: { data: null, error: null }
  };

  const cadena = (tabla: string): Record<string, unknown> => {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      ilike: (_columna: string, patron: string) => {
        patronesDeTitulo.push(patron);
        return encadenable;
      },
      in: () => encadenable,
      insert: (...args: unknown[]) => {
        insert(...args);
        return Promise.resolve(respuestas.message_attachments);
      },
      limit: () => Promise.resolve(respuestaDe(tabla)),
      maybeSingle: () => Promise.resolve(respuestaDe(tabla)),
      order: () => encadenable,
      select: () => encadenable,
      then: (resolver: (valor: unknown) => unknown) =>
        Promise.resolve(respuestaDe(tabla)).then(resolver)
    };
    return encadenable;
  };

  // El titulo solo casa cuando la busqueda es por contenido: la primera consulta, exacta, no
  // encuentra nada y la segunda -- la tolerante -- si. Sin la segunda, el envio fallaria.
  const respuestaDe = (tabla: string): unknown => {
    if (tabla === 'branch_media' && opciones.soloPorContenido) {
      const ultimo = patronesDeTitulo[patronesDeTitulo.length - 1] ?? '';
      return { data: ultimo.includes('%') ? [MEDIA] : [], error: null };
    }
    return respuestas[tabla];
  };

  const supabase = { from: vi.fn((tabla: string) => cadena(tabla)) };

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

  return { enqueueOutbound, insert, patronesDeTitulo, servicio };
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

/**
 * La imagen pedida por su TITULO.
 *
 * Los flujos no conocen los identificadores de la base: escribir uno a mano solo funciona en el
 * espacio donde se copio. El titulo lo elige quien carga el material, y la API lo busca dentro de la
 * sede de la conversacion -- asi la misma palabra sirve en cualquier espacio y en cualquier sede.
 */
describe('multimedia pedida por titulo', () => {
  it('resuelve la imagen de la sede de la conversacion y la envia', async () => {
    const { enqueueOutbound, insert, servicio } = crearServicio();

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      media: [{ branchMediaTitle: 'Accesorios' }],
      text: 'Aqui tienes la foto'
    });

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('si la sede no tiene esa imagen, rechaza el envio y NO encola nada', async () => {
    const { enqueueOutbound, insert, servicio } = crearServicio({ mediaPorTitulo: [] });

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        media: [{ branchMediaTitle: 'Accesorios' }],
        text: 'Con foto'
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('la tarjeta global de accesorios no exige una sede en la conversacion', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ sede: null });

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      media: [{ branchMediaTitle: 'Accesorios' }],
      text: 'Con foto'
    });

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
  });

  it('no admite las dos formas a la vez para el mismo adjunto', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        media: [{ branchMediaId: MEDIA.id, branchMediaTitle: 'Accesorios' }],
        text: 'Con foto'
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  /**
   * Quien escribe el titulo es una persona, y el titulo es la clave por la que el bot pide el
   * material. Exigir la coincidencia exacta convertia una mayuscula o una palabra de mas -- «Accesorios
   * spa» -- en un envio fallido que nadie sabia explicar. La busqueda es: primero el titulo exacto, y
   * solo si no hay, uno que lo contenga.
   */
  it('busca primero el titulo exacto y, si no lo hay, uno que lo contenga', async () => {
    const { enqueueOutbound, patronesDeTitulo, servicio } = crearServicio({
      soloPorContenido: true
    });

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      media: [{ branchMediaTitle: 'Accesorios' }],
      text: 'Aqui tienes la foto'
    });

    expect(patronesDeTitulo).toEqual(['Accesorios', '%Accesorios%']);
    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
  });

  it('si el titulo exacto existe, no hace falta la busqueda tolerante', async () => {
    const { patronesDeTitulo, servicio } = crearServicio();

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      media: [{ branchMediaTitle: 'Accesorios' }],
      text: 'Aqui tienes la foto'
    });

    expect(patronesDeTitulo).toEqual(['Accesorios']);
  });
});
