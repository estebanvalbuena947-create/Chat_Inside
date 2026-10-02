import { describe, expect, it } from 'vitest';
import {
  availableCommentModerationActions,
  canSendPrivateReply,
  planCommentReply,
  shouldAutoReply,
  type CommentPlatformFlags
} from './comment-moderation.js';

const AHORA = new Date('2026-10-01T15:00:00.000Z');

function delCliente(extra: Partial<CommentPlatformFlags> = {}): CommentPlatformFlags {
  return {
    canDelete: true,
    canHide: true,
    canReply: true,
    isHidden: false,
    isOwner: false,
    ...extra
  };
}

describe('que se puede hacer con un comentario', () => {
  it('con el del cliente ofrece ocultar y eliminar, nunca editar', () => {
    const acciones = availableCommentModerationActions(delCliente());
    expect(acciones).toEqual(['hide', 'delete']);
    expect(acciones).not.toContain('edit');
  });

  it('si ya esta oculto ofrece volver a mostrarlo', () => {
    expect(availableCommentModerationActions(delCliente({ isHidden: true }))).toEqual([
      'unhide',
      'delete'
    ]);
  });

  it('con el nuestro solo ofrece editar', () => {
    expect(availableCommentModerationActions(delCliente({ isOwner: true }))).toEqual(['edit']);
  });

  it('respeta lo que la plataforma prohibe', () => {
    expect(
      availableCommentModerationActions(delCliente({ canHide: false, canDelete: false }))
    ).toEqual([]);
  });
});

describe('la respuesta privada, que es de un solo uso', () => {
  it('se permite en un comentario reciente y sin responder', () => {
    expect(
      canSendPrivateReply({ alreadyRepliedAt: null, commentCreatedAt: AHORA, now: AHORA }).ok
    ).toBe(true);
  });

  it('no se permite dos veces sobre el mismo comentario', () => {
    const r = canSendPrivateReply({
      alreadyRepliedAt: new Date('2026-10-01T16:00:00.000Z'),
      commentCreatedAt: AHORA,
      now: AHORA
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('una');
  });

  it('no se permite pasados los siete dias', () => {
    const r = canSendPrivateReply({
      alreadyRepliedAt: null,
      commentCreatedAt: new Date('2026-09-20T15:00:00.000Z'),
      now: AHORA
    });
    expect(r.ok).toBe(false);
  });

  it('en el limite de los siete dias todavia se permite', () => {
    const commentCreatedAt = new Date(AHORA.getTime() - 7 * 24 * 60 * 60 * 1000 + 60_000);
    expect(canSendPrivateReply({ alreadyRepliedAt: null, commentCreatedAt, now: AHORA }).ok).toBe(
      true
    );
  });
});

describe('como responde el bot', () => {
  it('en modo combinado responde en publico y luego en privado', () => {
    expect(planCommentReply({ mode: 'combined', privateReply: { ok: true } })).toEqual([
      'public',
      'private'
    ]);
  });

  it('en modo combinado, si el privado ya no esta, mantiene el publico', () => {
    expect(
      planCommentReply({ mode: 'combined', privateReply: { ok: false, reason: 'agotado' } })
    ).toEqual(['public']);
  });

  it('en modo privado, si no esta disponible no responde nada', () => {
    expect(
      planCommentReply({ mode: 'private', privateReply: { ok: false, reason: 'agotado' } })
    ).toEqual([]);
  });

  it('en modo publico nunca intenta el privado', () => {
    expect(planCommentReply({ mode: 'public', privateReply: { ok: true } })).toEqual(['public']);
  });
});

describe('cuando el bot no debe responder', () => {
  const base = {
    autoRepliesInThread: 0,
    canReply: true,
    enabled: true,
    isOwner: false,
    maxAutoReplies: 3
  };

  it('responde cuando todo esta en orden', () => {
    expect(shouldAutoReply(base).ok).toBe(true);
  });

  it('no responde a un comentario propio, para no contestarse a si mismo', () => {
    const r = shouldAutoReply({ ...base, isOwner: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('nuestro');
  });

  it('no responde si el interruptor esta apagado', () => {
    expect(shouldAutoReply({ ...base, enabled: false }).ok).toBe(false);
  });

  it('no responde si la plataforma no lo permite', () => {
    expect(shouldAutoReply({ ...base, canReply: false }).ok).toBe(false);
  });

  it('deja de responder al alcanzar el tope del hilo', () => {
    expect(shouldAutoReply({ ...base, autoRepliesInThread: 3 }).ok).toBe(false);
    expect(shouldAutoReply({ ...base, autoRepliesInThread: 2 }).ok).toBe(true);
  });
});
