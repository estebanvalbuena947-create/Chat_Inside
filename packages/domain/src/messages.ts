import type { MessageStatus } from '@chat-zernio/contracts';

const statusRank: Readonly<Record<Exclude<MessageStatus, 'failed' | 'received'>, number>> = {
  draft: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  read: 5
};

export function advanceMessageStatus(
  current: MessageStatus,
  incoming: MessageStatus
): MessageStatus {
  if (current === 'received') return current;
  if (incoming === 'received') return current;
  if (current === 'failed') return current;
  if (incoming === 'failed') return 'failed';
  return statusRank[incoming] >= statusRank[current] ? incoming : current;
}

/**
 * Que hace falta para poder enviar una plantilla de Meta.
 *
 * Dos condiciones, y ninguna es un caso particular de una plantilla concreta:
 *   1. La referencia es nombre + idioma: sin idioma el proveedor no puede resolverla.
 *   2. Meta solo entrega plantillas con estado APPROVED; cualquier otro estado no se envia.
 *   3. Un hueco ({{1}}, {{nombre}}) exige valores que hoy no se capturan. Se prefiere no enviar a
 *      mandar el texto con las llaves a la vista del cliente.
 *
 * El motivo se decide por orden: si ademas de tener huecos no esta aprobada, lo que hay que contar
 * primero es que el proveedor todavia no la aprobo.
 */
export type WhatsappTemplateSendability =
  | { sendable: true }
  | { reason: 'has_variables' | 'missing_language' | 'not_approved'; sendable: false };

export function whatsappTemplateSendability(template: {
  language: string | null;
  status: string | null;
  variables: readonly string[];
}): WhatsappTemplateSendability {
  if (!template.language) return { reason: 'missing_language', sendable: false };
  if (template.status !== 'APPROVED') return { reason: 'not_approved', sendable: false };
  if (template.variables.length > 0) return { reason: 'has_variables', sendable: false };
  return { sendable: true };
}

/**
 * Busca la plantilla por su referencia exacta: mismo nombre y mismo idioma.
 *
 * No se normaliza el caso ni se adivina el idioma: el proveedor resuelve el par exacto antes de
 * enviar, asi que una coincidencia aproximada aqui solo serviria para fallar mas tarde.
 */
export function findWhatsappTemplateByReference<
  T extends { language: string | null; name: string }
>(templates: readonly T[], reference: { language: string; name: string }): T | null {
  // Una referencia incompleta no identifica nada: se trata como ausencia de coincidencia y no como
  // comodin. El idioma se compara tal cual, asi que una plantilla sin idioma nunca coincide.
  if (!reference.name.trim() || !reference.language.trim()) return null;
  return (
    templates.find(
      (template) => template.name === reference.name && template.language === reference.language
    ) ?? null
  );
}

/**
 * La referencia de plantilla guardada con un mensaje, o nada.
 *
 * Nombre e idioma van juntos: uno solo no identifica nada que el proveedor pueda resolver, asi que
 * una fila incompleta se lee como mensaje de texto y nunca como una plantilla a medias.
 */
export function whatsappTemplateReferenceFrom(
  name: unknown,
  language: unknown
): { language: string; name: string } | null {
  if (typeof name !== 'string' || typeof language !== 'string') return null;
  if (!name.trim() || !language.trim()) return null;
  return { language, name };
}
