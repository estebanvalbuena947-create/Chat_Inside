import { describe, expect, it } from 'vitest';
import {
  advanceMessageStatus,
  findWhatsappTemplateByReference,
  whatsappTemplateReferenceFrom,
  whatsappTemplateSendability
} from './messages';

describe('message status policy', () => {
  it.each([
    ['draft', 'queued', 'queued'],
    ['queued', 'sending', 'sending'],
    ['sent', 'delivered', 'delivered'],
    ['delivered', 'read', 'read']
  ] as const)('advances %s to %s', (current, incoming, expected) => {
    expect(advanceMessageStatus(current, incoming)).toBe(expected);
  });

  it.each([
    ['read', 'sent'],
    ['delivered', 'sending'],
    ['sending', 'queued']
  ] as const)('does not regress %s when %s arrives late', (current, incoming) => {
    expect(advanceMessageStatus(current, incoming)).toBe(current);
  });

  it('records a failure without allowing later events to hide it', () => {
    expect(advanceMessageStatus('sending', 'failed')).toBe('failed');
    expect(advanceMessageStatus('failed', 'read')).toBe('failed');
  });

  it('keeps inbound received state outside the outbound delivery progression', () => {
    expect(advanceMessageStatus('received', 'read')).toBe('received');
    expect(advanceMessageStatus('sent', 'received')).toBe('sent');
  });
});

describe('whatsapp template sendability', () => {
  const aprobada = { language: 'es_MX', status: 'APPROVED', variables: [] };

  it('allows an approved template with a language and no placeholders', () => {
    expect(whatsappTemplateSendability(aprobada)).toEqual({ sendable: true });
  });

  it.each(['PENDING', 'REJECTED', 'PAUSED', 'DISABLED', null])('refuses status %s', (status) => {
    expect(whatsappTemplateSendability({ ...aprobada, status })).toEqual({
      reason: 'not_approved',
      sendable: false
    });
  });

  it.each([['{{1}}'], ['{{nombre}}'], ['{{1}}', '{{nombre}}']])(
    'refuses a template that declares placeholders %s',
    (...variables) => {
      expect(whatsappTemplateSendability({ ...aprobada, variables })).toEqual({
        reason: 'has_variables',
        sendable: false
      });
    }
  );

  it('refuses a template without the language the provider resolves', () => {
    expect(whatsappTemplateSendability({ ...aprobada, language: null })).toEqual({
      reason: 'missing_language',
      sendable: false
    });
  });

  it('reports the approval state first when both problems exist', () => {
    expect(
      whatsappTemplateSendability({ ...aprobada, status: 'PENDING', variables: ['{{1}}'] })
    ).toMatchObject({ reason: 'not_approved' });
  });
});

describe('whatsapp template reference matching', () => {
  const catalogo = [
    { language: 'es_MX', name: 'notificacion_48h' },
    { language: 'en_US', name: 'notificacion_48h' },
    { language: null, name: 'sin_idioma' }
  ];

  it('matches name and language exactly', () => {
    expect(
      findWhatsappTemplateByReference(catalogo, { language: 'en_US', name: 'notificacion_48h' })
    ).toEqual({ language: 'en_US', name: 'notificacion_48h' });
  });

  it.each([
    [{ language: 'es_MX', name: 'NOTIFICACION_48H' }],
    [{ language: 'ES_mx', name: 'notificacion_48h' }],
    [{ language: 'pt_BR', name: 'notificacion_48h' }],
    [{ language: 'es_MX', name: 'otra' }]
  ])('does not approximate the reference %o', (reference) => {
    expect(findWhatsappTemplateByReference(catalogo, reference)).toBeNull();
  });

  it('treats a template without language as unreachable, not as a wildcard', () => {
    expect(
      findWhatsappTemplateByReference(catalogo, { language: '', name: 'sin_idioma' })
    ).toBeNull();
  });

  it('reads a stored reference only when both halves are present', () => {
    expect(whatsappTemplateReferenceFrom('notificacion_48h', 'es_MX')).toEqual({
      language: 'es_MX',
      name: 'notificacion_48h'
    });
    expect(whatsappTemplateReferenceFrom('notificacion_48h', null)).toBeNull();
    expect(whatsappTemplateReferenceFrom(null, 'es_MX')).toBeNull();
    expect(whatsappTemplateReferenceFrom('  ', 'es_MX')).toBeNull();
    expect(whatsappTemplateReferenceFrom(undefined, undefined)).toBeNull();
  });
});
