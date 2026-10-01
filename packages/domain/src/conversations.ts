import type { AutomationMode, ConversationStatus } from '@chat-zernio/contracts';

export function applyInboundMessage(status: ConversationStatus): ConversationStatus {
  return status === 'resolved' ? 'open' : status;
}

export function handoffToHuman(): AutomationMode {
  return 'paused';
}

export type AgentInvocationEligibility =
  | { allowed: true }
  | { allowed: false; reason: 'automation_not_auto' };

export function getAgentInvocationEligibility(
  automationMode: AutomationMode
): AgentInvocationEligibility {
  return automationMode === 'auto'
    ? { allowed: true }
    : { allowed: false, reason: 'automation_not_auto' };
}

function parseInstant(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * Acota la marca solicitada al instante del mensaje mas reciente de la conversacion.
 * El servidor es la autoridad: un cliente no puede silenciar mensajes que aun no existen.
 */
export function clampReadMark(candidate: string, newestMessageAt: string | null): string | null {
  const candidateTime = parseInstant(candidate);
  const newestTime = parseInstant(newestMessageAt);

  if (candidateTime === null || newestTime === null) return null;
  return new Date(Math.min(candidateTime, newestTime)).toISOString();
}

export type ReadMarkDecision = { advance: boolean; mark: string };

/**
 * Avance monotono de la marca de lectura: nunca retrocede, y repetir el mismo comando
 * devuelve la marca vigente sin efectos adicionales.
 */
export function nextReadMark(current: string | null, candidate: string): ReadMarkDecision {
  const candidateTime = parseInstant(candidate);
  if (candidateTime === null) return { advance: false, mark: current ?? candidate };

  const currentTime = parseInstant(current);
  if (currentTime === null) return { advance: true, mark: candidate };
  if (candidateTime <= currentTime) return { advance: false, mark: current as string };

  return { advance: true, mark: candidate };
}

/**
 * Una conversacion requiere atencion cuando tiene un mensaje entrante posterior a la marca
 * de la persona. Los envios del equipo no generan atencion.
 */
export function needsAttention(lastReadAt: string | null, lastInboundAt: string | null): boolean {
  const inboundTime = parseInstant(lastInboundAt);
  if (inboundTime === null) return false;

  const readTime = parseInstant(lastReadAt);
  if (readTime === null) return true;

  return inboundTime > readTime;
}
