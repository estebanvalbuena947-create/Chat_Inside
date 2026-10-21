import { createHash } from 'node:crypto';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { maxOutboundMediaBytes, maxOutboundMediaLabel } from '@chat-zernio/contracts';
import { describe, expect, it, vi } from 'vitest';
import { encodeMediaCursor } from '@chat-zernio/domain';
import {
  ConversationMediaService,
  MEDIA_BUCKET,
  conversationMediaPath
} from './conversation-media.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';
const conversationId = '44444444-4444-4444-8444-444444444444';
const messageId = '55555555-5555-4555-8555-555555555555';

const attachmentRow = {
  bucket: MEDIA_BUCKET,
  content_type: 'image/jpeg',
  conversation: { contact: { display_name: 'Iván' }, contact_id: contactId },
  conversation_id: conversationId,
  created_at: '2026-09-29T03:57:56.761+00:00',
  id: '66666666-6666-4666-8666-666666666666',
  kind: 'image',
  message_id: messageId,
  storage_object_path: 'tenant/conversation/message/0.jpg'
};

/** Bytes de un archivo real: la firma es lo unico que decide el tipo. */
const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(48, 7)]);
const pdfBytes = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32, 32)]);
const aviBytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI ')]);

type Upload = { bucket: string; bytes: Buffer; contentType: string; path: string; upsert: boolean };

function createService(
  options: {
    canAccess?: boolean;
    /** `null` simula una conversacion de otro espacio: no existe en este. */
    conversation?: unknown;
    rows?: unknown[];
    signedError?: boolean;
    /** Rutas con copia propia; por defecto, todas las que se pidan. */
    signedPaths?: string[];
    uploadError?: unknown;
  } = {}
): {
  bucketsFirmados: string[];
  createSignedUrls: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  service: ConversationMediaService;
  uploads: Upload[];
} {
  const rows = options.rows ?? [attachmentRow];
  const builder: Record<string, unknown> = {};
  for (const method of ['eq', 'or', 'order', 'select']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn().mockResolvedValue({ data: rows, error: null });

  const conversationQuery: Record<string, unknown> = {};
  conversationQuery.eq = () => conversationQuery;
  conversationQuery.select = () => conversationQuery;
  conversationQuery.maybeSingle = async () => ({
    data: options.conversation === undefined ? { id: conversationId } : options.conversation,
    error: null
  });

  const bucketsFirmados: string[] = [];
  const uploads: Upload[] = [];
  const createSignedUrls = vi.fn(
    async (paths: string[], _ttl: number, bucket: string = MEDIA_BUCKET) => {
      bucketsFirmados.push(bucket);
      if (options.signedError) return { data: null, error: { message: 'no' } };
      const firmables = options.signedPaths ?? paths;
      return {
        data: paths
          .filter((path) => firmables.includes(path))
          .map((path) => ({
            path,
            signedUrl: `https://storage.example.test/${bucket}/${path}`
          })),
        error: null
      };
    }
  );

  const from = vi.fn((table: string) => {
    if (table === 'conversations') return conversationQuery;
    return builder;
  });

  const service = new ConversationMediaService(
    { authenticate: async () => ({ userId }) } as never,
    {
      assertMembership: async () => {
        if (options.canAccess === false) throw new Error('forbidden');
      }
    } as never,
    {
      create: () => ({
        from,
        storage: {
          from: (bucket: string) => ({
            createSignedUrls: (paths: string[], ttl: number) =>
              createSignedUrls(paths, ttl, bucket),
            upload: async (path: string, bytes: Buffer, settings: Upload) => {
              uploads.push({ ...settings, bucket, bytes, path });
              return { error: options.uploadError ?? null };
            }
          })
        }
      })
    } as never
  );

  return { bucketsFirmados, createSignedUrls, from, service, uploads };
}

describe('ConversationMediaService', () => {
  it('returns the media of the tenant with the contact name and a temporary link', async () => {
    const { service, createSignedUrls } = createService({});

    await expect(service.list('Bearer valid.jwt', tenantId, {})).resolves.toEqual({
      items: [
        {
          contactId,
          contactName: 'Iván',
          contentType: 'image/jpeg',
          conversationId,
          createdAt: '2026-09-29T03:57:56.761Z',
          id: '66666666-6666-4666-8666-666666666666',
          kind: 'image',
          messageId,
          title: null,
          url: `https://storage.example.test/${MEDIA_BUCKET}/tenant/conversation/message/0.jpg`
        }
      ],
      nextCursor: null
    });

    expect(createSignedUrls).toHaveBeenCalledWith(
      ['tenant/conversation/message/0.jpg'],
      600,
      MEDIA_BUCKET
    );
  });

  /**
   * La galeria mezcla dos procedencias: la copia de lo que mando un contacto y lo que salio desde el
   * catalogo de una sede. Cada fila declara su bucket y se firma contra el suyo, o la imagen del
   * catalogo se queda sin enlace.
   */
  it('firma cada fila de la galeria contra el bucket que declara', async () => {
    const { bucketsFirmados, service } = createService({
      rows: [
        attachmentRow,
        {
          ...attachmentRow,
          bucket: 'branch-media',
          id: '99999999-9999-4999-8999-999999999999',
          storage_object_path: 'sede/valle/foto.jpg'
        }
      ]
    });

    const listado = await service.list('Bearer valid.jwt', tenantId, {});

    expect(bucketsFirmados).toEqual([MEDIA_BUCKET, 'branch-media']);
    expect(listado.items.map((item) => item.url)).toEqual([
      `https://storage.example.test/${MEDIA_BUCKET}/tenant/conversation/message/0.jpg`,
      'https://storage.example.test/branch-media/sede/valle/foto.jpg'
    ]);
  });

  it('lists a media file whose copy is missing, without breaking the gallery', async () => {
    const { service, createSignedUrls } = createService({
      rows: [{ ...attachmentRow, storage_object_path: null }]
    });

    const listed = await service.list('Bearer valid.jwt', tenantId, {});
    expect(listed.items[0]?.url).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('muestra la galeria sin enlaces cuando el almacen no responde, en vez de caerse', async () => {
    const { service } = createService({ signedError: true });

    const listed = await service.list('Bearer valid.jwt', tenantId, {});
    expect(listed.items[0]?.url).toBeNull();
  });

  it('asks for one more row to know whether another page exists', async () => {
    const extra = Array.from({ length: 31 }, (_, index) => ({
      ...attachmentRow,
      id: `66666666-6666-4666-8666-6666666666${String(index).padStart(2, '0')}`
    }));
    const { service } = createService({ rows: extra });

    const listed = await service.list('Bearer valid.jwt', tenantId, { limit: 30 });
    expect(listed.items).toHaveLength(30);
    expect(listed.nextCursor).not.toBeNull();
    expect(
      encodeMediaCursor({ createdAt: listed.items[29]!.createdAt, id: listed.items[29]!.id })
    ).toBe(listed.nextCursor);
  });

  it('rejects a cursor that the application did not issue', async () => {
    const { service } = createService({});

    await expect(
      service.list('Bearer valid.jwt', tenantId, { cursor: 'inventado' })
    ).rejects.toThrow(BadRequestException);
  });

  it('requires membership before showing any media', async () => {
    const { service, createSignedUrls } = createService({ canAccess: false });

    await expect(service.list('Bearer valid.jwt', tenantId, {})).rejects.toThrow('forbidden');
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('returns nothing when the search term has no characters left to match', async () => {
    const { service, createSignedUrls } = createService({});

    await expect(service.list('Bearer valid.jwt', tenantId, { search: ' %%% ' })).resolves.toEqual({
      items: [],
      nextCursor: null
    });
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});

/**
 * La subida.
 *
 * Lo que se comprueba es la regla completa: el tipo lo dicen los BYTES -- no el nombre ni el MIME
 * declarado --, lo que no se admite no se escribe, el archivo queda en la ruta determinista de ESA
 * conversacion de ESE espacio y la respuesta no revela ninguna ruta del almacen.
 */
describe('ConversationMediaService subida a la conversacion', () => {
  it('guarda un archivo admitido en la ruta determinista y responde sin rutas', async () => {
    const { service, uploads } = createService({});

    const respuesta = await service.upload('Bearer valid.jwt', tenantId, conversationId, jpegBytes);

    const uploadId = createHash('sha256').update(jpegBytes).digest('hex');
    expect(respuesta).toEqual({
      byteSize: jpegBytes.length,
      contentType: 'image/jpeg',
      extension: 'jpg',
      kind: 'image',
      uploadId
    });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      bucket: MEDIA_BUCKET,
      contentType: 'image/jpeg',
      path: conversationMediaPath({
        conversationId,
        extension: 'jpg',
        tenantId,
        uploadId
      }),
      upsert: true
    });
    // La ruta interna no sale nunca en una respuesta.
    expect(JSON.stringify(respuesta)).not.toContain(tenantId);
    expect(JSON.stringify(respuesta)).not.toContain(conversationId);
  });

  it('un PDF llamado .jpg se guarda como lo que es: lo deciden los bytes', async () => {
    const { service, uploads } = createService({});

    const respuesta = await service.upload('Bearer valid.jwt', tenantId, conversationId, pdfBytes);

    expect(respuesta).toMatchObject({
      contentType: 'application/pdf',
      extension: 'pdf',
      kind: 'file'
    });
    expect(uploads[0]?.path.endsWith('.pdf')).toBe(true);
    expect(uploads[0]?.contentType).toBe('application/pdf');
  });

  it('lo que no se reconoce por sus bytes se rechaza y no se escribe', async () => {
    const { service, uploads } = createService({});

    // El nombre dice «foto.jpg»: no decide nada.
    await expect(
      service.upload('Bearer valid.jwt', tenantId, conversationId, Buffer.from('no es un archivo'))
    ).rejects.toThrow(UnprocessableEntityException);
    expect(uploads).toHaveLength(0);
  });

  it('un tipo que se reconoce pero no se admite como adjunto tampoco se escribe', async () => {
    const { service, uploads } = createService({});

    // Un AVI es video para el reconocimiento por bytes, pero no esta en los tipos admitidos.
    await expect(
      service.upload('Bearer valid.jwt', tenantId, conversationId, aviBytes)
    ).rejects.toThrow(UnprocessableEntityException);
    expect(uploads).toHaveLength(0);
  });

  it('un archivo por encima del tope se rechaza sin escribir nada', async () => {
    const { service, uploads } = createService({});
    const grande = Buffer.concat([jpegBytes, Buffer.alloc(maxOutboundMediaBytes)]);

    await expect(
      service.upload('Bearer valid.jwt', tenantId, conversationId, grande)
    ).rejects.toThrow(`El archivo supera el límite de ${maxOutboundMediaLabel}.`);
    expect(uploads).toHaveLength(0);
  });

  /**
   * El caso que motivo subir el tope: un comprobante escaneado de 23 MB no llegaba. Lo que se
   * comprueba es que ya no se rechaza por el tamaño anterior, y que su ficha reporta el tamaño real.
   */
  it('un archivo de 26 MB, que antes se rechazaba, ahora se guarda', async () => {
    const { service, uploads } = createService({});
    const escaneado = Buffer.concat([jpegBytes, Buffer.alloc(26 * 1024 * 1024)]);

    const respuesta = await service.upload('Bearer valid.jwt', tenantId, conversationId, escaneado);

    expect(respuesta.byteSize).toBe(escaneado.length);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.path.endsWith('.jpg')).toBe(true);
  });

  it('un archivo vacio se rechaza sin escribir nada', async () => {
    const { service, uploads } = createService({});

    await expect(
      service.upload('Bearer valid.jwt', tenantId, conversationId, Buffer.alloc(0))
    ).rejects.toThrow(UnprocessableEntityException);
    expect(uploads).toHaveLength(0);
  });

  it('una conversacion de otro espacio no existe: 404 y ninguna escritura', async () => {
    const { service, uploads } = createService({ conversation: null });

    await expect(
      service.upload('Bearer valid.jwt', tenantId, conversationId, jpegBytes)
    ).rejects.toThrow(NotFoundException);
    expect(uploads).toHaveLength(0);
  });

  it('sin pertenencia al espacio no se comprueba siquiera la conversacion', async () => {
    const { from, service, uploads } = createService({ canAccess: false });

    await expect(
      service.upload('Bearer valid.jwt', tenantId, conversationId, jpegBytes)
    ).rejects.toThrow('forbidden');
    expect(from).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('un almacen que falla es un error visible, no un exito silencioso', async () => {
    const { service } = createService({ uploadError: { message: 'sin espacio' } });

    await expect(
      service.upload('Bearer valid.jwt', tenantId, conversationId, jpegBytes)
    ).rejects.toThrow('No se pudo guardar el archivo.');
  });
});

/**
 * La comprobacion de que la carga existe.
 *
 * Se le pregunta al almacen por el objeto. Un objeto que no esta no es un fallo -- y un fallo del
 * almacen no es un objeto que no esta: el primero es un error del servidor y el segundo un rechazo
 * con motivo para quien lo intenta.
 */
describe('ConversationMediaService comprobacion de una carga', () => {
  it('encuentra la carga de la conversacion preguntando al almacen por el objeto', async () => {
    const { bucketsFirmados, service, uploads } = createService({});
    const rutasConsultadas: string[] = [];
    const supabase = {
      storage: {
        from: (bucket: string) => ({
          exists: async (path: string) => {
            bucketsFirmados.push(bucket);
            rutasConsultadas.push(path);
            return { data: true, error: null };
          }
        })
      }
    } as never;

    await expect(
      service.uploadedObjectExists(supabase, {
        conversationId,
        extension: 'jpg',
        tenantId,
        uploadId: 'a'.repeat(64)
      })
    ).resolves.toBe(true);
    expect(bucketsFirmados).toEqual([MEDIA_BUCKET]);
    expect(rutasConsultadas).toEqual([`${tenantId}/${conversationId}/${'a'.repeat(64)}.jpg`]);
    expect(uploads).toHaveLength(0);
  });

  it('una carga que no esta en el almacen no existe, y no es un fallo', async () => {
    const { service } = createService({});
    const supabase = {
      storage: {
        from: () => ({
          exists: async () => ({ data: false, error: { message: 'not found', status: 400 } })
        })
      }
    } as never;

    await expect(
      service.uploadedObjectExists(supabase, {
        conversationId,
        extension: 'pdf',
        tenantId,
        uploadId: 'a'.repeat(64)
      })
    ).resolves.toBe(false);
  });

  it('un almacen que responde con un error no se confunde con un objeto que no esta', async () => {
    const { service } = createService({});
    const supabase = {
      storage: {
        from: () => ({
          exists: async () => ({ data: false, error: { message: 'caido', status: 503 } })
        })
      }
    } as never;

    await expect(
      service.uploadedObjectExists(supabase, {
        conversationId,
        extension: 'jpg',
        tenantId,
        uploadId: 'a'.repeat(64)
      })
    ).rejects.toThrow('No fue posible comprobar el archivo.');
  });

  it('un almacen que no responde tampoco se confunde con un objeto que no esta', async () => {
    const { service } = createService({});
    const supabase = {
      storage: {
        from: () => ({
          exists: async () => {
            throw new Error('sin red');
          }
        })
      }
    } as never;

    await expect(
      service.uploadedObjectExists(supabase, {
        conversationId,
        extension: 'jpg',
        tenantId,
        uploadId: 'a'.repeat(64)
      })
    ).rejects.toThrow('No fue posible comprobar el archivo.');
  });
});
