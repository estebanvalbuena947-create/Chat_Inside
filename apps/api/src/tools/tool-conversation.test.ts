import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolConversationService } from './tool-conversation.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Lectura de una conversacion para el bot.
 *
 * Tres cosas se sostienen aqui:
 *   1. El aislamiento: la conversacion se busca dentro del espacio del token.
 *   2. La FORMA PLANA que define docs/TOOLS_CONTRACT.md, con el contacto, las etiquetas y la sede.
 *      Los flujos leen esos campos por nombre: si la forma cambia, dejan de encontrar los datos.
 *   3. El historial, del mas reciente al mas antiguo, que es el contexto con el que decide el bot.
 *
 * El doble es encadenable Y esperable a la vez: las tres consultas del servicio terminan de formas
 * distintas (con maybeSingle, con limit, o directamente sobre la cadena). Una cadena que solo fuera
 * encadenable fallaria en la tercera; una que solo fuera esperable, en la segunda.
 */

const CONVERSACION = {
  assigned_user_id: null,
  automation_mode: 'auto',
  branches: { name: 'Valle', slug: 'valle' },
  channel_account: { display_name: 'insidespamx', platform: 'instagram' },
  contact: {
    display_name: 'KAREN',
    external_username: null,
    id: 'contact-1',
    platform_user_id: 'ig-9'
  },
  created_at: '2026-09-29T16:00:00.000Z',
  has_comment: false,
  has_dm: true,
  id: 'conv-1',
  last_message_at: '2026-10-06T18:00:00.000Z',
  outcome: null,
  outcome_amount: null,
  outcome_currency: null,
  status: 'open'
};

const MENSAJES = [
  {
    body: 'Hola',
    comment_state: null,
    direction: 'inbound',
    id: 'm2',
    sender_type: 'contact',
    sent_at: null,
    source: 'dm',
    status: 'received'
  },
  {
    body: 'Buenos dias',
    comment_state: null,
    direction: 'outbound',
    id: 'm1',
    sender_type: 'automation',
    sent_at: '2026-10-06T17:00:00.000Z',
    source: 'dm',
    status: 'sent'
  }
];

function cadena(resultado: unknown) {
  const encadenable: Record<string, unknown> = {
    eq: () => encadenable,
    limit: () => Promise.resolve(resultado),
    maybeSingle: () => Promise.resolve(resultado),
    order: () => encadenable,
    select: () => encadenable,
    then: (resolver: (valor: unknown) => unknown) => Promise.resolve(resultado).then(resolver)
  };
  return encadenable;
}

function crearServicio(opciones: { existe?: boolean; etiquetas?: unknown[] } = {}) {
  const tablas: Record<string, unknown> = {
    conversation_labels: {
      data: opciones.etiquetas ?? [
        { labels: { name: 'Nuevo Cliente' } },
        { labels: null },
        { labels: { name: 'pago_pendiente' } }
      ],
      error: null
    },
    conversations: { data: opciones.existe === false ? null : CONVERSACION, error: null },
    messages: { data: MENSAJES, error: null }
  };

  const supabase = {
    from: vi.fn((tabla: string) => cadena(tablas[tabla] ?? { data: null, error: null }))
  };

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['conversations'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new ToolConversationService(
    toolTokenService as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { servicio, toolTokenService };
}

type Respuesta = {
  assignedUserId: unknown;
  automationMode: unknown;
  branch: { name: string; slug: string } | null;
  contact: { id: unknown; name: string; platform: string; username: unknown };
  id: string;
  labels: string[];
  messages: Array<{ direction: string; id: string }>;
  tenantId: string;
};

describe('lectura de conversacion', () => {
  it('exige el permiso de conversaciones', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.read('Bearer token', 'conv-1');

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      { scopes: ['conversations'], tenantId: 'tenant-1', tokenId: 'token-1' },
      'conversations'
    );
  });

  it('una conversacion de otro espacio da 404', async () => {
    const { servicio } = crearServicio({ existe: false });

    await expect(servicio.read('Bearer token', 'ajena')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devuelve la forma plana del contrato, con contacto, sede y modo de automatizacion', async () => {
    const { servicio } = crearServicio();

    const r = (await servicio.read('Bearer token', 'conv-1')) as Respuesta;

    expect(r).toMatchObject({
      automationMode: 'auto',
      id: 'conv-1',
      status: 'open',
      tenantId: 'tenant-1'
    });
    expect(r.contact).toMatchObject({ id: 'contact-1', name: 'KAREN', platform: 'instagram' });
    expect(r.branch).toMatchObject({ name: 'Valle', slug: 'valle' });
    expect(r.assignedUserId).toBeNull();
  });

  it('aplana las etiquetas a nombres y descarta las entradas vacias', async () => {
    const { servicio } = crearServicio();

    const r = (await servicio.read('Bearer token', 'conv-1')) as Respuesta;

    expect(r.labels).toEqual(['Nuevo Cliente', 'pago_pendiente']);
  });

  it('sin etiquetas devuelve una lista vacia, no null', async () => {
    const { servicio } = crearServicio({ etiquetas: [] });

    const r = (await servicio.read('Bearer token', 'conv-1')) as Respuesta;

    expect(r.labels).toEqual([]);
  });

  it('devuelve el historial con su direccion y su identificador', async () => {
    const { servicio } = crearServicio();

    const r = (await servicio.read('Bearer token', 'conv-1')) as Respuesta;

    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]).toMatchObject({ direction: 'inbound', id: 'm2' });
  });
});

describe('lectura de conversacion: casos limite', () => {
  it('una conversacion sin sede devuelve branch nulo, no un objeto vacio', async () => {
    const CONVERSACION_SIN_SEDE = { ...CONVERSACION, branches: null };
    const tablas: Record<string, unknown> = {
      conversation_labels: { data: [], error: null },
      conversations: { data: CONVERSACION_SIN_SEDE, error: null },
      messages: { data: [], error: null }
    };
    const supabase = {
      from: vi.fn((t: string) => cadena(tablas[t] ?? { data: null, error: null }))
    };
    const servicio = new ToolConversationService(
      {
        assertScope: vi.fn(),
        authenticate: vi
          .fn()
          .mockResolvedValue({ scopes: ['conversations'], tenantId: 'tenant-1', tokenId: 't' })
      } as unknown as ToolTokenService,
      { create: () => supabase } as unknown as SupabaseServerClientFactory
    );

    const r = (await servicio.read('Bearer token', 'conv-1')) as Respuesta;

    expect(r.branch).toBeNull();
  });
});
