/**
 * Moderacion de comentarios.
 *
 * Que se puede hacer con cada comentario lo decide la plataforma, no una lista escrita por
 * nosotros: Zernio devuelve `canHide`, `canDelete`, `canReply` y `from.isOwner`, y aqui se traduce
 * eso a acciones concretas. Asi, cuando Meta cambie sus reglas, la interfaz seguira acertando.
 *
 * Y las reglas del bot: cuando puede responder, cuanto puede insistir y que pasa con la respuesta
 * privada, que es un recurso de un solo uso.
 */

/** Lo que la plataforma dice de un comentario concreto. */
export type CommentPlatformFlags = {
  readonly canDelete: boolean;
  readonly canHide: boolean;
  readonly canReply: boolean;
  readonly isHidden: boolean;
  readonly isOwner: boolean;
};

export type CommentModerationAction = 'delete' | 'edit' | 'hide' | 'unhide';

/** Cuantos dias permite la plataforma para responder en privado a un comentario. */
const PRIVATE_REPLY_WINDOW_DAYS = 7;

const DIAS_EN_MS = 24 * 60 * 60 * 1000;

function haPasadoLaVentana(commentCreatedAt: Date, now: Date): boolean {
  return now.getTime() - commentCreatedAt.getTime() > PRIVATE_REPLY_WINDOW_DAYS * DIAS_EN_MS;
}

/**
 * Acciones de moderacion disponibles. Editar solo aparece sobre comentarios propios: la plataforma
 * no permite editar el comentario de otra persona, y ofrecerlo seria prometer algo imposible.
 */
export function availableCommentModerationActions(
  flags: CommentPlatformFlags
): CommentModerationAction[] {
  if (flags.isOwner) {
    return ['edit'];
  }

  const acciones: CommentModerationAction[] = [];
  if (flags.canHide) acciones.push(flags.isHidden ? 'unhide' : 'hide');
  if (flags.canDelete) acciones.push('delete');
  return acciones;
}

export type Availability = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * La respuesta privada es un recurso de un solo uso y con caducidad. Se comprueba antes de
 * ofrecerla, para no gastarla en un intento que la plataforma va a rechazar.
 */
export function canSendPrivateReply(input: {
  commentCreatedAt: Date;
  now: Date;
  alreadyRepliedAt: Date | null;
}): Availability {
  if (input.alreadyRepliedAt !== null) {
    return {
      ok: false,
      reason: 'Ya se envio la respuesta privada de este comentario: solo se permite una.'
    };
  }
  if (haPasadoLaVentana(input.commentCreatedAt, input.now)) {
    return {
      ok: false,
      reason: `La respuesta privada solo puede enviarse dentro de los ${PRIVATE_REPLY_WINDOW_DAYS} dias siguientes al comentario.`
    };
  }
  return { ok: true };
}

/** Como responde el bot a un comentario. Lo decide el negocio por espacio. */
export type CommentReplyMode = 'combined' | 'private' | 'public';

export type CommentReplyStep = 'private' | 'public';

/**
 * Pasos de la respuesta automatica, en orden.
 *
 * En modo combinado la respuesta publica va primero y abre la puerta al privado. Si el privado ya
 * no esta disponible, el publico se mantiene: seria peor quedarse sin responder por completo.
 */
export function planCommentReply(input: {
  mode: CommentReplyMode;
  privateReply: Availability;
}): CommentReplyStep[] {
  if (input.mode === 'public') return ['public'];
  if (input.mode === 'private') return input.privateReply.ok ? ['private'] : [];
  return input.privateReply.ok ? ['public', 'private'] : ['public'];
}

/**
 * Si el bot debe responder este comentario, y por que no cuando no debe.
 *
 * Las razones importan: quedan en el registro y evitan que alguien pregunte por que el bot se quedo
 * callado. El tope por hilo es lo que impide un bucle entre el bot y la persona.
 */
export function shouldAutoReply(input: {
  autoRepliesInThread: number;
  canReply: boolean;
  enabled: boolean;
  isOwner: boolean;
  maxAutoReplies: number;
}): Availability {
  if (!input.enabled) {
    return { ok: false, reason: 'Las respuestas automaticas de comentarios estan desactivadas.' };
  }
  if (input.isOwner) {
    return { ok: false, reason: 'El comentario es nuestro: el bot no responde a si mismo.' };
  }
  if (!input.canReply) {
    return { ok: false, reason: 'La plataforma no permite responder a este comentario.' };
  }
  if (input.autoRepliesInThread >= input.maxAutoReplies) {
    return {
      ok: false,
      reason: 'Se alcanzo el maximo de respuestas automaticas en este hilo: lo atiende una persona.'
    };
  }
  return { ok: true };
}
