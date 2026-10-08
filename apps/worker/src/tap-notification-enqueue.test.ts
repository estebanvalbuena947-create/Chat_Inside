import { describe, expect, it, vi } from 'vitest';
import type { NormalizedInboundMessage } from './zernio-inbound-normalizer';
import { enqueueButtonTapNotification } from './zernio-inbox-worker';

const incoming: NormalizedInboundMessage = {
  accountId: 'account-1',
  accountName: '+52 1 427 192 0078',
  attachments: [],
  avatarSourceUrl: null,
  body: 'Asistiré',
  buttonTap: {
    payload: 'Asistiré',
    quotedMessageReference: 'zernio:account-1:message:wamid.plantilla-48h'
  },
  contactDisplayName: 'Y M B',
  contactReference: 'zernio:account-1:contact:sender-1',
  contactUsername: null,
  conversationReference: 'zernio:account-1:conversation:conversation-1',
  messageReference: 'zernio:account-1:message:message-2',
  platform: 'whatsapp',
  receivedAt: '2026-10-08T18:57:29.122Z'
};

function createClientFake(options: {
  insertError?: { code: string } | null;
  quoted?: unknown;
  quotedError?: unknown;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  let selects = 0;
  const client = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['eq', 'select']) builder[method] = () => builder;
      builder.maybeSingle = async () => {
        selects += 1;
        return { data: options.quoted ?? null, error: options.quotedError ?? null };
      };
      builder.insert = (row: Record<string, unknown>) => {
        inserts.push({ ...row, table });
        return Promise.resolve({ error: options.insertError ?? null });
      };
      return builder;
    }
  };
  return { client, inserts, selects: () => selects };
}

const contexto = {
  channelAccountId: 'canal-1',
  contactId: '33333333-3333-4333-8333-333333333333',
  conversationId: '44444444-4444-4444-8444-444444444444',
  messageId: '55555555-5555-4555-8555-555555555555',
  n8nConfigured: true,
  tenantId: '11111111-1111-4111-8111-111111111111'
};

const plantillaAprobada = {
  whatsapp_template_language: 'es_MX',
  whatsapp_template_name: 'notificacion_48h'
};

describe('encolado del aviso de un toque', () => {
  it('un mensaje sin toque no consulta nada ni encola', async () => {
    const fake = createClientFake({ quoted: plantillaAprobada });

    await enqueueButtonTapNotification(fake.client as never, {
      ...contexto,
      incoming: { ...incoming, buttonTap: null }
    });

    expect(fake.selects()).toBe(0);
    expect(fake.inserts).toHaveLength(0);
  });

  it('sin webhook configurado no encola y deja el motivo escrito', async () => {
    const fake = createClientFake({ quoted: plantillaAprobada });
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await enqueueButtonTapNotification(fake.client as never, {
        ...contexto,
        incoming,
        n8nConfigured: false
      });

      expect(fake.inserts).toHaveLength(0);
      expect(logInfo).toHaveBeenCalledWith(
        JSON.stringify({ event: 'worker.n8n_notification_skipped', reason: 'n8n_not_configured' })
      );
    } finally {
      logInfo.mockRestore();
    }
  });

  it('un citado que no salio con plantilla no genera aviso', async () => {
    const fake = createClientFake({
      quoted: { whatsapp_template_language: null, whatsapp_template_name: null }
    });

    await enqueueButtonTapNotification(fake.client as never, { ...contexto, incoming });

    expect(fake.inserts).toHaveLength(0);
  });

  it('encola el aviso con su clase, su agregado y sin datos personales', async () => {
    const fake = createClientFake({ quoted: plantillaAprobada });

    await enqueueButtonTapNotification(fake.client as never, { ...contexto, incoming });

    expect(fake.inserts).toHaveLength(1);
    const fila = fake.inserts[0] ?? {};
    expect(fila).toMatchObject({
      aggregate_id: contexto.conversationId,
      aggregate_type: 'conversation',
      event_type: 'n8n.whatsapp.button_tap',
      tenant_id: contexto.tenantId
    });
    expect(fila.payload).toEqual({
      buttonPayload: 'Asistiré',
      contactId: contexto.contactId,
      conversationId: contexto.conversationId,
      event: 'whatsapp.button_tap',
      messageId: contexto.messageId,
      occurredAt: '2026-10-08T18:57:29.122Z',
      template: { language: 'es_MX', name: 'notificacion_48h' }
    });
    // Nada de telefonos, nombres ni cuerpos: solo lo que el contrato admite.
    const serializado = JSON.stringify(fila.payload);
    expect(serializado).not.toContain('573102453646');
    expect(serializado).not.toContain('Y M B');
  });

  it('el mismo toque produce siempre la misma clave', async () => {
    const primera = createClientFake({ quoted: plantillaAprobada });
    const reintento = createClientFake({ quoted: plantillaAprobada });

    await enqueueButtonTapNotification(primera.client as never, { ...contexto, incoming });
    await enqueueButtonTapNotification(reintento.client as never, { ...contexto, incoming });

    expect(primera.inserts[0]?.idempotency_key).toBe(reintento.inserts[0]?.idempotency_key);
    expect(String(primera.inserts[0]?.idempotency_key)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('dos toques distintos del mismo cliente son dos avisos distintos', async () => {
    const primero = createClientFake({ quoted: plantillaAprobada });
    const segundo = createClientFake({ quoted: plantillaAprobada });

    await enqueueButtonTapNotification(primero.client as never, { ...contexto, incoming });
    await enqueueButtonTapNotification(segundo.client as never, {
      ...contexto,
      incoming: {
        ...incoming,
        buttonTap: { ...incoming.buttonTap!, payload: 'No Asistiré' },
        messageReference: 'zernio:account-1:message:message-3'
      }
    });

    expect(primero.inserts[0]?.idempotency_key).not.toBe(segundo.inserts[0]?.idempotency_key);
  });

  it('un choque con la clave existente es el resultado esperado, no un fallo', async () => {
    const fake = createClientFake({ insertError: { code: '23505' }, quoted: plantillaAprobada });

    await expect(
      enqueueButtonTapNotification(fake.client as never, { ...contexto, incoming })
    ).resolves.toBeUndefined();
  });

  it('un fallo real al encolar se levanta para que el evento se reintente', async () => {
    const fake = createClientFake({ insertError: { code: '08006' }, quoted: plantillaAprobada });

    await expect(
      enqueueButtonTapNotification(fake.client as never, { ...contexto, incoming })
    ).rejects.toThrow('tap_notification_enqueue_failed');
  });

  it('si no se puede leer el mensaje citado, el evento falla visiblemente', async () => {
    const fake = createClientFake({ quotedError: { code: '08006' } });

    await expect(
      enqueueButtonTapNotification(fake.client as never, { ...contexto, incoming })
    ).rejects.toThrow('tap_quoted_message_lookup_failed');
  });
});
