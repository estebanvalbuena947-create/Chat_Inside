import { describe, expect, it, vi } from 'vitest';
import type { WhatsappTemplate } from '@chat-zernio/contracts';
import { WhatsappTemplateCatalog } from './whatsapp-template-catalog';

const tenantId = '11111111-1111-4111-8111-111111111111';
const cuentaA = 'aaaaaaaa-1111-4111-8111-111111111111';
const cuentaB = 'bbbbbbbb-2222-4222-8222-222222222222';

function plantilla(overrides: Partial<WhatsappTemplate> = {}): WhatsappTemplate {
  return {
    category: 'UTILITY',
    language: 'es_MX',
    name: 'notificacion_48h',
    previewText: 'Hola, confirmamos tu reservacion.',
    status: 'APPROVED',
    variables: [],
    ...overrides
  };
}

function createSupabaseFake(responses: Array<{ data: unknown; error?: unknown }>) {
  let index = 0;
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    for (const method of ['eq', 'order', 'select']) {
      builder[method] = () => builder;
    }
    const siguiente = () => responses[index++] ?? { data: [], error: null };
    builder.maybeSingle = () => Promise.resolve(siguiente());
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(siguiente()).then(resolve);
    return builder;
  });
  return { client: { from }, from };
}

function createCatalog(options: {
  responses: Array<{ data: unknown; error?: unknown }>;
  templates: (accountId: string) => WhatsappTemplate[];
}) {
  const listWhatsappTemplates = vi.fn(async (accountId: string) => options.templates(accountId));
  const fake = createSupabaseFake(options.responses);
  const catalog = new WhatsappTemplateCatalog(
    { listWhatsappTemplates } as never,
    { create: () => fake.client } as never
  );
  return { catalog, listWhatsappTemplates };
}

const cuentas = [
  {
    data: [
      { id: cuentaA, provider_account_id: 'proveedor-a' },
      { id: cuentaB, provider_account_id: 'proveedor-b' }
    ],
    error: null
  }
];

describe('WhatsappTemplateCatalog listado del espacio', () => {
  it('agrupa la misma plantilla en dos cuentas y deja una sola entrada', async () => {
    const { catalog, listWhatsappTemplates } = createCatalog({
      responses: cuentas,
      templates: (accountId) =>
        accountId === 'proveedor-a'
          ? [plantilla(), plantilla({ name: 'solo_en_a' })]
          : [plantilla(), plantilla({ name: 'solo_en_b' })]
    });

    const items = await catalog.listForTenant(tenantId);

    expect(listWhatsappTemplates).toHaveBeenCalledWith('proveedor-a');
    expect(listWhatsappTemplates).toHaveBeenCalledWith('proveedor-b');
    // Varias variantes de la misma clase: compartida, solo en A, solo en B.
    expect(items.map((item) => item.name).sort()).toEqual([
      'notificacion_48h',
      'solo_en_a',
      'solo_en_b'
    ]);
    expect(items.find((item) => item.name === 'notificacion_48h')?.channelAccountIds).toEqual([
      cuentaA,
      cuentaB
    ]);
    expect(items.find((item) => item.name === 'solo_en_b')?.channelAccountIds).toEqual([cuentaB]);
  });

  it('decide lo que se puede enviar y lo explica, sin dejar la regla a la pantalla', async () => {
    const { catalog } = createCatalog({
      responses: cuentas,
      templates: (accountId) =>
        accountId === 'proveedor-a'
          ? [
              plantilla(),
              plantilla({ name: 'en_revision', status: 'PENDING' }),
              plantilla({ name: 'con_huecos', variables: ['{{1}}', '{{2}}'] }),
              plantilla({ language: null, name: 'sin_idioma' }),
              plantilla({ name: 'en_revision_con_huecos', status: 'PENDING', variables: ['{{1}}'] })
            ]
          : []
    });

    const items = await catalog.listForTenant(tenantId);
    const porNombre = new Map(items.map((item) => [item.name, item]));

    expect(porNombre.get('notificacion_48h')).toMatchObject({
      blockedReason: null,
      sendable: true
    });
    expect(porNombre.get('en_revision')).toMatchObject({
      blockedReason: 'Meta todavía no la tiene aprobada.',
      sendable: false
    });
    expect(porNombre.get('con_huecos')).toMatchObject({
      blockedReason: 'Necesita valores para {{1}}, {{2}}.',
      sendable: false
    });
    expect(porNombre.get('sin_idioma')).toMatchObject({
      blockedReason: 'Meta no informó su idioma, así que no se puede resolver.',
      sendable: false
    });
    // Estado invalido + huecos: manda el motivo que el operador puede resolver primero.
    expect(porNombre.get('en_revision_con_huecos')?.blockedReason).toBe(
      'Meta todavía no la tiene aprobada.'
    );
  });

  it('sin cuentas de WhatsApp no molesta al proveedor', async () => {
    const { catalog, listWhatsappTemplates } = createCatalog({
      responses: [{ data: [], error: null }],
      templates: () => [plantilla()]
    });

    await expect(catalog.listForTenant(tenantId)).resolves.toEqual([]);
    expect(listWhatsappTemplates).not.toHaveBeenCalled();
  });

  it('ignora una cuenta sin identificador de proveedor en lugar de consultarla', async () => {
    const { catalog, listWhatsappTemplates } = createCatalog({
      responses: [
        {
          data: [
            { id: cuentaA, provider_account_id: null },
            { id: cuentaB, provider_account_id: 'proveedor-b' }
          ],
          error: null
        }
      ],
      templates: () => [plantilla()]
    });

    await catalog.listForTenant(tenantId);
    expect(listWhatsappTemplates).toHaveBeenCalledTimes(1);
    expect(listWhatsappTemplates).toHaveBeenCalledWith('proveedor-b');
  });
});

describe('WhatsappTemplateCatalog por cuenta', () => {
  it('lee solo la cuenta pedida, para no ofrecer lo que no se puede enviar', async () => {
    const { catalog, listWhatsappTemplates } = createCatalog({
      responses: [{ data: { id: cuentaB, provider_account_id: 'proveedor-b' }, error: null }],
      templates: () => [plantilla()]
    });

    const resultado = await catalog.readForChannelAccount(tenantId, cuentaB);

    expect(resultado?.channelAccountId).toBe(cuentaB);
    expect(resultado?.templates).toHaveLength(1);
    expect(listWhatsappTemplates).toHaveBeenCalledTimes(1);
    expect(listWhatsappTemplates).toHaveBeenCalledWith('proveedor-b');
  });

  it('devuelve nulo cuando la cuenta no es de WhatsApp en este espacio', async () => {
    const { catalog, listWhatsappTemplates } = createCatalog({
      responses: [{ data: null, error: null }],
      templates: () => [plantilla()]
    });

    await expect(catalog.readForChannelAccount(tenantId, cuentaA)).resolves.toBeNull();
    expect(listWhatsappTemplates).not.toHaveBeenCalled();
  });
});
