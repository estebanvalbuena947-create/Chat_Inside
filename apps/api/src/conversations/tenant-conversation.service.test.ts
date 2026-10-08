import { describe, expect, it, vi } from 'vitest';
import { TenantConversationService } from './tenant-conversation.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const conversationId = '44444444-4444-4444-8444-444444444444';
const contactId = '33333333-3333-4333-8333-333333333333';
const assigneeUserId = '66666666-6666-4666-8666-666666666666';
const labelId = '55555555-5555-4555-8555-555555555555';
const channelAccountId = '77777777-7777-4777-8777-777777777777';

type FakeResponse = { data: unknown; error: unknown };
type RecordedCall = { args: unknown[]; method: string };

type FakeBuilder = {
  recorded: RecordedCall[];
  maybeSingle: () => Promise<FakeResponse>;
  single: () => Promise<FakeResponse>;
  then: (resolve: (value: FakeResponse) => unknown) => Promise<unknown>;
  [method: string]: unknown;
};

const CHAIN_METHODS = [
  'delete',
  'eq',
  'in',
  'insert',
  'is',
  'limit',
  'lt',
  'or',
  'order',
  'select',
  'update',
  'upsert'
];

/**
 * Cliente falso: cada tabla devuelve sus respuestas en orden y registra las llamadas de su
 * cadena, para poder afirmar tanto el resultado como la forma exacta de la consulta.
 */
function createSupabaseFake(queues: Record<string, FakeResponse[]>) {
  const buildersByTable: Record<string, FakeBuilder[]> = {};
  const cursors: Record<string, number> = {};

  function nextResponse(table: string): FakeResponse {
    const queue = queues[table] ?? [];
    const index = cursors[table] ?? 0;
    cursors[table] = index + 1;
    return queue[index] ?? { data: [], error: null };
  }

  const from = vi.fn((table: string) => {
    buildersByTable[table] = buildersByTable[table] ?? [];
    const builder = { recorded: [] as RecordedCall[] } as FakeBuilder;
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        builder.recorded.push({ args, method });
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(nextResponse(table));
    builder.single = () => Promise.resolve(nextResponse(table));
    builder.then = (resolve: (value: FakeResponse) => unknown) =>
      Promise.resolve(nextResponse(table)).then(resolve);
    buildersByTable[table].push(builder);
    return builder;
  });

  return {
    client: { from },
    from,
    builders: (table: string) => buildersByTable[table] ?? [],
    callsIn: (table: string, method: string) =>
      (buildersByTable[table] ?? []).flatMap((builder) =>
        builder.recorded.filter((call) => call.method === method).map((call) => call.args)
      )
  };
}

function createService(
  queues: Record<string, FakeResponse[]>,
  options: {
    assertRole?: boolean;
    canAccess?: boolean;
    conversionError?: Error;
    members?: boolean;
  } = {}
) {
  const fake = createSupabaseFake(queues);
  const assertMembership = vi.fn(async () => {
    if (options.canAccess === false) throw new Error('forbidden');
  });
  const assertRole = vi.fn(async () => {
    if (options.assertRole === false) throw new Error('forbidden');
  });
  const memberExists = vi.fn(async () => options.members !== false);
  const enqueueWonConversion = vi.fn(async () => {
    if (options.conversionError) throw options.conversionError;
    return { queued: true };
  });

  const service = new TenantConversationService(
    { authenticate: async () => ({ userId }) } as never,
    { assertMembership, assertRole, memberExists } as never,
    { create: () => fake.client } as never,
    { enqueueWonConversion } as never
  );

  return { assertMembership, assertRole, enqueueWonConversion, fake, memberExists, service };
}

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    assignment_version: 1,
    assigned_user_id: null,
    automation_mode: 'auto',
    automation_version: 1,
    channel_account: { platform: 'instagram' },
    channel_account_id: channelAccountId,
    contact: {
      avatar_object_path: 'tenant/contact/avatar.jpg',
      display_name: 'Contacto de prueba',
      external_username: 'contacto.prueba'
    },
    contact_id: contactId,
    id: conversationId,
    inbound: [],
    last_message_at: '2026-08-13T01:02:03+00',
    latest: [],
    read: [],
    status: 'open',
    status_version: 1,
    updated_at: '2026-08-13T00:00:00+00',
    ...overrides
  };
}

function expectedSummary(overrides: Record<string, unknown> = {}) {
  return {
    assignmentVersion: 1,
    assignedUserId: null,
    attentionLevel: null,
    automationMode: 'auto',
    automationVersion: 1,
    channelPlatform: 'instagram',
    channelAccountId,
    contactAvatarAvailable: true,
    contactId,
    contactName: 'Contacto de prueba',
    contactUsername: 'contacto.prueba',
    id: conversationId,
    lastMessageAt: '2026-08-13T01:02:03.000Z',
    lastMessageDirection: null,
    lastMessagePreview: null,
    startedAt: null,
    needsAttention: false,
    status: 'open',
    statusVersion: 1,
    updatedAt: '2026-08-13T00:00:00.000Z',
    ...overrides
  };
}

describe('TenantConversationService list', () => {
  it('does not query conversations when tenant access is rejected', async () => {
    const { fake, service } = createService({}, { canAccess: false });
    await expect(
      service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', limit: 1 })
    ).rejects.toThrow('forbidden');
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('returns the tenant-scoped summary without attention for an empty conversation', async () => {
    const { service } = createService({
      conversations: [{ data: [conversationRow()], error: null }]
    });
    await expect(
      service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', limit: 1 })
    ).resolves.toEqual({ items: [expectedSummary()], nextCursor: null });
  });

  it('reports the last message, its direction and the attention of the reader', async () => {
    const { service } = createService({
      conversations: [
        {
          data: [
            conversationRow({
              inbound: [{ created_at: '2026-08-13T01:05:00+00' }],
              latest: [
                {
                  body: '¿Cuál es el horario?',
                  created_at: '2026-08-13T01:05:00+00',
                  direction: 'inbound'
                }
              ],
              read: [{ last_read_at: '2026-08-13T01:00:00+00' }]
            })
          ],
          error: null
        }
      ]
    });

    const result = await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 1
    });

    expect(result.items[0]).toMatchObject({
      lastMessageDirection: 'inbound',
      lastMessagePreview: '¿Cuál es el horario?',
      startedAt: null,
      needsAttention: true
    });
  });

  it('does not require attention when the reader is ahead of the last inbound message', async () => {
    const { service } = createService({
      conversations: [
        {
          data: [
            conversationRow({
              inbound: [{ created_at: '2026-08-13T01:05:00+00' }],
              latest: [
                { body: 'Gracias', created_at: '2026-08-13T01:06:00+00', direction: 'outbound' }
              ],
              read: [{ last_read_at: '2026-08-13T01:10:00+00' }]
            })
          ],
          error: null
        }
      ]
    });

    const result = await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 1
    });

    expect(result.items[0]).toMatchObject({
      lastMessageDirection: 'outbound',
      lastMessagePreview: 'Gracias',
      startedAt: null,
      needsAttention: false
    });
  });

  it('dice cuanto lleva el cliente sin respuesta, aunque alguien haya abierto la conversacion', async () => {
    const otraConversacion = '22222222-2222-4222-8222-222222222222';
    const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

    const { service } = createService({
      conversations: [
        {
          data: [
            conversationRow({
              // Abierta DESPUES del mensaje del cliente (marca mas nueva) y sin responder.
              inbound: [{ created_at: hace(2) }],
              last_message_at: hace(2),
              latest: [{ body: 'Hola', created_at: hace(2), direction: 'inbound' }],
              read: [{ last_read_at: hace(1) }]
            }),
            conversationRow({
              id: otraConversacion,
              last_message_at: hace(20),
              latest: [{ body: 'Hola', created_at: hace(20), direction: 'inbound' }]
            })
          ],
          error: null
        }
      ]
    });

    const result = await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 2
    });

    expect(result.items.map((item) => item.attentionLevel)).toEqual(['ok', 'alto']);
    // Abrir no responde: la primera sigue pendiente, y por eso el punto cuenta la espera y no la lectura.
    expect(result.items[0].needsAttention).toBe(false);
  });

  it('bounds the preview and omits it when the message has no visible text', async () => {
    const { service } = createService({
      conversations: [
        {
          data: [
            conversationRow({
              latest: [
                {
                  body: 'x'.repeat(260),
                  created_at: '2026-08-13T01:05:00+00',
                  direction: 'inbound'
                }
              ]
            }),
            conversationRow({
              id: '77777777-7777-4777-8777-777777777777',
              latest: [{ body: '   ', created_at: '2026-08-13T01:05:00+00', direction: 'inbound' }]
            })
          ],
          error: null
        }
      ]
    });

    const result = await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 2
    });

    expect(result.items[0]?.lastMessagePreview).toHaveLength(200);
    expect(result.items[1]?.lastMessagePreview).toBeNull();
  });

  it('bounds every embedded relation so a long conversation cannot flood the page', async () => {
    const { fake, service } = createService({
      conversations: [{ data: [conversationRow()], error: null }]
    });

    await service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', limit: 5 });

    const [builder] = fake.builders('conversations');
    expect(builder?.recorded).toEqual(
      expect.arrayContaining([
        { args: [1, { foreignTable: 'latest' }], method: 'limit' },
        { args: [1, { foreignTable: 'inbound' }], method: 'limit' },
        { args: [1, { foreignTable: 'read' }], method: 'limit' },
        { args: ['read.user_id', userId], method: 'eq' }
      ])
    );
  });

  it('filters assigned-to-me by the authenticated identity, not a browser supplied user', async () => {
    const { fake, service } = createService({ conversations: [{ data: [], error: null }] });
    await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'assigned_to_me',
      limit: 50
    });
    expect(fake.callsIn('conversations', 'eq')).toContainEqual(['assigned_user_id', userId]);
  });

  it('keeps the full tenant list when the assignment scope is all', async () => {
    const { fake, service } = createService({ conversations: [{ data: [], error: null }] });
    await service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', limit: 50 });
    expect(fake.callsIn('conversations', 'eq')).not.toContainEqual(['assigned_user_id', userId]);
  });

  it('filters conversations by a label only after proving that label belongs to the tenant', async () => {
    const { fake, service } = createService({
      conversation_labels: [{ data: [{ conversation_id: conversationId }], error: null }],
      conversations: [{ data: [conversationRow()], error: null }],
      labels: [{ data: { id: labelId }, error: null }]
    });

    await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      labelId,
      limit: 50
    });

    expect(fake.from).toHaveBeenNthCalledWith(1, 'labels');
    expect(fake.from).toHaveBeenNthCalledWith(2, 'conversation_labels');
    expect(fake.from).toHaveBeenNthCalledWith(3, 'conversations');
    expect(fake.callsIn('conversations', 'in')).toContainEqual(['id', [conversationId]]);
  });

  it('does not query conversations when the requested label is outside the tenant', async () => {
    const { fake, service } = createService({ labels: [{ data: null, error: null }] });
    await expect(
      service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', labelId, limit: 50 })
    ).rejects.toThrow('La etiqueta no existe en este tenant.');
    expect(fake.from).toHaveBeenCalledTimes(1);
  });

  it('returns no conversations when a valid tenant label has no applications', async () => {
    const { fake, service } = createService({
      conversation_labels: [{ data: [], error: null }],
      labels: [{ data: { id: labelId }, error: null }]
    });

    await expect(
      service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', labelId, limit: 50 })
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(fake.from).toHaveBeenCalledTimes(2);
  });

  it('resolves the search in the server and filters by the matching contacts', async () => {
    const { fake, service } = createService({
      contacts: [{ data: [{ id: contactId }], error: null }],
      conversations: [{ data: [conversationRow()], error: null }]
    });

    await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 50,
      search: 'Germán'
    });

    expect(fake.callsIn('contacts', 'or')).toContainEqual([
      'display_name.ilike.*Germán*,external_username.ilike.*Germán*'
    ]);
    expect(fake.callsIn('conversations', 'in')).toContainEqual(['contact_id', [contactId]]);
  });

  it('removes reserved characters from the term instead of letting it shape the query', async () => {
    const { fake, service } = createService({
      contacts: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }]
    });

    await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 50,
      search: 'a,b)*'
    });

    expect(fake.callsIn('contacts', 'or')).toContainEqual([
      'display_name.ilike.*a b*,external_username.ilike.*a b*'
    ]);
  });

  it('returns an empty page when no contact matches the search', async () => {
    const { fake, service } = createService({ contacts: [{ data: [], error: null }] });

    await expect(
      service.list('Bearer valid.jwt', tenantId, {
        assignmentScope: 'all',
        limit: 50,
        search: 'nadie'
      })
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(fake.from).toHaveBeenCalledTimes(1);
  });

  it('continues from a cursor with the timestamp and the identifier as keyset', async () => {
    const { fake, service } = createService({ conversations: [{ data: [], error: null }] });
    const cursor = JSON.stringify({
      id: conversationId,
      lastMessageAt: '2026-08-13T01:02:03.000Z'
    });

    await service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', cursor, limit: 50 });

    expect(fake.callsIn('conversations', 'or')).toContainEqual([
      `last_message_at.lt.2026-08-13T01:02:03.000Z,and(last_message_at.eq.2026-08-13T01:02:03.000Z,id.lt.${conversationId})`
    ]);
  });

  it('continues through the tail of conversations without messages', async () => {
    const { fake, service } = createService({ conversations: [{ data: [], error: null }] });
    const cursor = JSON.stringify({ id: conversationId, lastMessageAt: null });

    await service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', cursor, limit: 50 });

    expect(fake.callsIn('conversations', 'is')).toContainEqual(['last_message_at', null]);
    expect(fake.callsIn('conversations', 'lt')).toContainEqual(['id', conversationId]);
  });

  it('rejects a malformed cursor before querying', async () => {
    const { fake, service } = createService({});

    await expect(
      service.list('Bearer valid.jwt', tenantId, {
        assignmentScope: 'all',
        cursor: 'no-es-un-cursor',
        limit: 50
      })
    ).rejects.toThrow('El cursor de la bandeja no es válido.');
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('asks for one extra row to expose the next cursor and trims the page', async () => {
    const { fake, service } = createService({
      conversations: [
        {
          data: [
            conversationRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
            conversationRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
          ],
          error: null
        }
      ]
    });

    const result = await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 1
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(
      JSON.stringify({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        lastMessageAt: '2026-08-13T01:02:03.000Z'
      })
    );
    expect(fake.callsIn('conversations', 'limit')).toContainEqual([2]);
  });

  it('encodes a null timestamp in the cursor for conversations without messages', async () => {
    const { service } = createService({
      conversations: [
        {
          data: [
            conversationRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', last_message_at: null }),
            conversationRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', last_message_at: null })
          ],
          error: null
        }
      ]
    });

    const result = await service.list('Bearer valid.jwt', tenantId, {
      assignmentScope: 'all',
      limit: 1
    });

    expect(result.items[0]?.lastMessageAt).toBeNull();
    expect(result.nextCursor).toBe(
      JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lastMessageAt: null })
    );
  });

  it('fails visibly when the conversation list cannot be read', async () => {
    const { service } = createService({
      conversations: [{ data: null, error: { message: 'boom' } }]
    });

    await expect(
      service.list('Bearer valid.jwt', tenantId, { assignmentScope: 'all', limit: 1 })
    ).rejects.toThrow('No fue posible cargar las conversaciones.');
  });
});

describe('TenantConversationService conversacion ganada', () => {
  const ganada = {
    id: conversationId,
    outcome: 'ganado',
    outcome_amount: 1500,
    outcome_currency: 'MXN',
    outcome_set_at: '2026-10-08T20:00:00+00:00'
  };

  it('al marcarla ganada encola la conversion con su importe y su moneda', async () => {
    const { enqueueWonConversion, service } = createService({
      conversations: [{ data: ganada, error: null }]
    });

    await expect(
      service.markWon('Bearer valid.jwt', tenantId, conversationId, {
        amount: 1500,
        currency: 'MXN'
      })
    ).resolves.toMatchObject({ amount: 1500, conversationId, currency: 'MXN', outcome: 'ganado' });

    // El hecho de negocio se ENCOLA: la entrega a Meta es del trabajador, no de esta peticion.
    expect(enqueueWonConversion).toHaveBeenCalledWith({
      amount: 1500,
      conversationId,
      currency: 'MXN',
      occurredAt: expect.any(String),
      tenantId
    });
  });

  it('si encolar la conversion falla, la conversacion queda ganada igual', async () => {
    // Un fallo del proveedor no puede deshacer el trabajo de la asesora: la conversion es un efecto
    // secundario, y su cola es idempotente por conversacion.
    const { service } = createService(
      { conversations: [{ data: ganada, error: null }] },
      { conversionError: new Error('Zernio no responde') }
    );

    await expect(
      service.markWon('Bearer valid.jwt', tenantId, conversationId, {
        amount: 1500,
        currency: 'MXN'
      })
    ).resolves.toMatchObject({ outcome: 'ganado' });
  });

  it('rechaza una conversacion ganada sin importe valido', async () => {
    const { enqueueWonConversion, service } = createService({
      conversations: [{ data: ganada, error: null }]
    });

    await expect(
      service.markWon('Bearer valid.jwt', tenantId, conversationId, { amount: -5, currency: 'MXN' })
    ).rejects.toThrow();
    expect(enqueueWonConversion).not.toHaveBeenCalled();
  });
});

describe('TenantConversationService status', () => {
  it('changes the status with the visible version and returns the next version', async () => {
    const { fake, service } = createService({
      conversations: [
        {
          data: conversationRow({ status: 'pending', status_version: 2 }),
          error: null
        }
      ]
    });

    await expect(
      service.changeStatus('Bearer valid.jwt', tenantId, conversationId, {
        status: 'pending',
        statusVersion: 1
      })
    ).resolves.toEqual({ item: expectedSummary({ status: 'pending', statusVersion: 2 }) });

    expect(fake.callsIn('conversations', 'eq')).toContainEqual(['status_version', 1]);
    expect(fake.callsIn('conversations', 'update')).toContainEqual([
      {
        resolved_at: null,
        status: 'pending',
        status_version: 2,
        updated_at: expect.any(String)
      }
    ]);
  });

  it('guarda la fecha de cierre al resolver, que es lo que permite contarlas por periodo', async () => {
    const { fake, service } = createService({
      conversations: [
        { data: conversationRow({ status: 'resolved', status_version: 2 }), error: null }
      ]
    });

    await expect(
      service.changeStatus('Bearer valid.jwt', tenantId, conversationId, {
        status: 'resolved',
        statusVersion: 1
      })
    ).resolves.toEqual({ item: expectedSummary({ status: 'resolved', statusVersion: 2 }) });

    expect(fake.callsIn('conversations', 'update')).toContainEqual([
      {
        resolved_at: expect.any(String),
        status: 'resolved',
        status_version: 2,
        updated_at: expect.any(String)
      }
    ]);
  });

  it('treats a retried target that is already current as idempotent', async () => {
    const { service } = createService({
      conversations: [
        { data: null, error: null },
        { data: conversationRow({ status: 'pending', status_version: 2 }), error: null }
      ]
    });

    await expect(
      service.changeStatus('Bearer valid.jwt', tenantId, conversationId, {
        status: 'pending',
        statusVersion: 1
      })
    ).resolves.toEqual({ item: expectedSummary({ status: 'pending', statusVersion: 2 }) });
  });

  it('rejects a stale status request when a different state is now current', async () => {
    const { service } = createService({
      conversations: [
        { data: null, error: null },
        { data: conversationRow({ status: 'resolved' }), error: null }
      ]
    });

    await expect(
      service.changeStatus('Bearer valid.jwt', tenantId, conversationId, {
        status: 'pending',
        statusVersion: 1
      })
    ).rejects.toThrow('La conversación cambió. Actualiza la bandeja antes de intentarlo de nuevo.');
  });
});

describe('TenantConversationService assignment', () => {
  it('assigns a conversation only after the target member is verified in the tenant', async () => {
    const { assertRole, fake, memberExists, service } = createService({
      conversations: [
        {
          data: conversationRow({ assigned_user_id: assigneeUserId, assignment_version: 2 }),
          error: null
        }
      ]
    });

    await expect(
      service.changeAssignment('Bearer valid.jwt', tenantId, conversationId, {
        assignedUserId: assigneeUserId,
        assignmentVersion: 1
      })
    ).resolves.toEqual({
      item: expectedSummary({ assignedUserId: assigneeUserId, assignmentVersion: 2 })
    });

    expect(assertRole).toHaveBeenCalledWith(userId, tenantId, ['admin', 'supervisor']);
    expect(memberExists).toHaveBeenCalledWith(assigneeUserId, tenantId);
    expect(fake.callsIn('conversations', 'eq')).toContainEqual(['assignment_version', 1]);
  });

  it('rejects an assignment target that is not a member of the tenant before updating', async () => {
    const { fake, service } = createService({}, { members: false });

    await expect(
      service.changeAssignment('Bearer valid.jwt', tenantId, conversationId, {
        assignedUserId: assigneeUserId,
        assignmentVersion: 1
      })
    ).rejects.toThrow('El integrante no existe en este tenant.');
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('does not require the role check to read the current assignment after a conflict', async () => {
    const { service } = createService({
      conversations: [
        { data: null, error: null },
        {
          data: conversationRow({ assigned_user_id: assigneeUserId, assignment_version: 2 }),
          error: null
        }
      ]
    });

    await expect(
      service.changeAssignment('Bearer valid.jwt', tenantId, conversationId, {
        assignedUserId: assigneeUserId,
        assignmentVersion: 1
      })
    ).resolves.toEqual({
      item: expectedSummary({ assignedUserId: assigneeUserId, assignmentVersion: 2 })
    });
  });

  it('rejects a stale assignment when another assignee is current', async () => {
    const { service } = createService({
      conversations: [
        { data: null, error: null },
        {
          data: conversationRow({ assigned_user_id: assigneeUserId, assignment_version: 2 }),
          error: null
        }
      ]
    });

    await expect(
      service.changeAssignment('Bearer valid.jwt', tenantId, conversationId, {
        assignedUserId: null,
        assignmentVersion: 1
      })
    ).rejects.toThrow('La asignación cambió. Actualiza la bandeja antes de intentarlo de nuevo.');
  });
});

describe('TenantConversationService automation', () => {
  it('pauses the bot for any tenant member using the visible automation version', async () => {
    const { assertMembership, fake, service } = createService({
      conversations: [
        { data: conversationRow({ automation_mode: 'paused', automation_version: 2 }), error: null }
      ]
    });

    await expect(
      service.changeAutomation('Bearer valid.jwt', tenantId, conversationId, {
        automationMode: 'paused',
        automationVersion: 1
      })
    ).resolves.toEqual({
      item: expectedSummary({ automationMode: 'paused', automationVersion: 2 })
    });

    expect(assertMembership).toHaveBeenCalledWith(userId, tenantId);
    expect(fake.callsIn('conversations', 'eq')).toContainEqual(['automation_version', 1]);
  });

  it('treats a retried bot pause that is already current as idempotent', async () => {
    const { service } = createService({
      conversations: [
        { data: null, error: null },
        { data: conversationRow({ automation_mode: 'paused', automation_version: 2 }), error: null }
      ]
    });

    await expect(
      service.changeAutomation('Bearer valid.jwt', tenantId, conversationId, {
        automationMode: 'paused',
        automationVersion: 1
      })
    ).resolves.toEqual({
      item: expectedSummary({ automationMode: 'paused', automationVersion: 2 })
    });
  });

  it('rejects a stale bot request when the opposite mode is current', async () => {
    const { service } = createService({
      conversations: [
        { data: null, error: null },
        { data: conversationRow({ automation_mode: 'paused' }), error: null }
      ]
    });

    await expect(
      service.changeAutomation('Bearer valid.jwt', tenantId, conversationId, {
        automationMode: 'auto',
        automationVersion: 1
      })
    ).rejects.toThrow('El bot cambió. Actualiza la bandeja antes de intentarlo de nuevo.');
  });
});

describe('TenantConversationService read mark', () => {
  it('stores the mark when the person has none yet', async () => {
    const { fake, service } = createService({
      conversation_reads: [{ data: null, error: null }],
      conversations: [
        {
          data: { id: conversationId, latest: [{ created_at: '2026-08-13T01:05:00+00' }] },
          error: null
        }
      ]
    });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:04:00.000Z'
      })
    ).resolves.toEqual({
      item: { conversationId, lastReadAt: '2026-08-13T01:04:00.000Z' }
    });

    expect(fake.callsIn('conversation_reads', 'insert')).toContainEqual([
      {
        conversation_id: conversationId,
        last_read_at: '2026-08-13T01:04:00.000Z',
        tenant_id: tenantId,
        user_id: userId
      }
    ]);
  });

  it('caps the mark at the newest message so nobody can silence the future', async () => {
    const { service } = createService({
      conversation_reads: [{ data: null, error: null }],
      conversations: [
        {
          data: { id: conversationId, latest: [{ created_at: '2026-08-13T01:05:00+00' }] },
          error: null
        }
      ]
    });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2030-01-01T00:00:00.000Z'
      })
    ).resolves.toEqual({
      item: { conversationId, lastReadAt: '2026-08-13T01:05:00.000Z' }
    });
  });

  it('holds an older instant and returns the stored mark without writing', async () => {
    const { fake, service } = createService({
      conversation_reads: [{ data: { last_read_at: '2026-08-13T02:00:00+00' }, error: null }],
      conversations: [
        {
          data: { id: conversationId, latest: [{ created_at: '2026-08-13T01:05:00+00' }] },
          error: null
        }
      ]
    });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:00:00.000Z'
      })
    ).resolves.toEqual({
      item: { conversationId, lastReadAt: '2026-08-13T02:00:00.000Z' }
    });

    expect(fake.callsIn('conversation_reads', 'insert')).toHaveLength(0);
    expect(fake.callsIn('conversation_reads', 'update')).toHaveLength(0);
  });

  it('advances an existing mark and guards the write against going backwards', async () => {
    const { fake, service } = createService({
      conversation_reads: [
        { data: { last_read_at: '2026-08-13T01:00:00+00' }, error: null },
        { data: { last_read_at: '2026-08-13T01:04:00+00' }, error: null }
      ],
      conversations: [
        {
          data: { id: conversationId, latest: [{ created_at: '2026-08-13T01:05:00+00' }] },
          error: null
        }
      ]
    });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:04:00.000Z'
      })
    ).resolves.toEqual({
      item: { conversationId, lastReadAt: '2026-08-13T01:04:00.000Z' }
    });

    expect(fake.callsIn('conversation_reads', 'lt')).toContainEqual([
      'last_read_at',
      '2026-08-13T01:04:00.000Z'
    ]);
  });

  it('returns the advanced mark when another process moved it first', async () => {
    const { service } = createService({
      conversation_reads: [
        { data: { last_read_at: '2026-08-13T01:00:00+00' }, error: null },
        { data: null, error: null },
        { data: { last_read_at: '2026-08-13T01:09:00+00' }, error: null }
      ],
      conversations: [
        {
          data: { id: conversationId, latest: [{ created_at: '2026-08-13T01:05:00+00' }] },
          error: null
        }
      ]
    });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:04:00.000Z'
      })
    ).resolves.toEqual({
      item: { conversationId, lastReadAt: '2026-08-13T01:09:00.000Z' }
    });
  });

  it('does not invent a mark for a conversation without messages', async () => {
    const { fake, service } = createService({
      conversation_reads: [{ data: null, error: null }],
      conversations: [{ data: { id: conversationId, latest: [] }, error: null }]
    });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:04:00.000Z'
      })
    ).resolves.toEqual({ item: { conversationId, lastReadAt: null } });

    expect(fake.callsIn('conversation_reads', 'insert')).toHaveLength(0);
  });

  it('tolerates a concurrent insert of the same mark', async () => {
    const { service } = createService({
      conversation_reads: [
        { data: null, error: null },
        { data: null, error: { code: '23505' } },
        { data: { last_read_at: '2026-08-13T01:04:00+00' }, error: null }
      ],
      conversations: [
        {
          data: { id: conversationId, latest: [{ created_at: '2026-08-13T01:05:00+00' }] },
          error: null
        }
      ]
    });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:04:00.000Z'
      })
    ).resolves.toEqual({
      item: { conversationId, lastReadAt: '2026-08-13T01:04:00.000Z' }
    });
  });

  it('rejects a conversation outside the tenant', async () => {
    const { fake, service } = createService({ conversations: [{ data: null, error: null }] });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:04:00.000Z'
      })
    ).rejects.toThrow('La conversación no existe en este tenant.');
    expect(fake.callsIn('conversation_reads', 'insert')).toHaveLength(0);
  });

  it('requires membership before reading or writing a mark', async () => {
    const { fake, service } = createService({}, { canAccess: false });

    await expect(
      service.markRead('Bearer valid.jwt', tenantId, conversationId, {
        upTo: '2026-08-13T01:04:00.000Z'
      })
    ).rejects.toThrow('forbidden');
    expect(fake.from).not.toHaveBeenCalled();
  });
});
