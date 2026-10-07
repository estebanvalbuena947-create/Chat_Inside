import type { AttentionLevel, AutomationMode, ConversationStatus } from '@chat-zernio/contracts';

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

/**
 * Cuando una espera deja de ser aceptable.
 *
 * Es politica del negocio y vive aqui, en un solo sitio: la bandeja y el panel de actividad tienen
 * que decir lo mismo, y cambiar el limite no puede obligar a tocar dos pantallas.
 */
export const ATTENTION_THRESHOLDS = { amberSeconds: 5 * 60, redSeconds: 10 * 60 };

/**
 * Cuanto lleva esperando respuesta el cliente.
 *
 * Nulo cuando el ultimo mensaje no es del cliente: si ya se respondio, no hay nada pendiente que
 * medir. El reloj **no** depende de quien haya abierto la conversacion: abrir sin contestar no
 * responde, y ese es justo el caso que hay que ver.
 */
export function attentionLevel(input: {
  direction: string | null;
  lastMessageAt: string | null;
  now?: Date;
}): AttentionLevel | null {
  if (input.direction !== 'inbound') return null;

  const momento = parseInstant(input.lastMessageAt);
  if (momento === null) return null;

  const segundos = Math.max(0, Math.round(((input.now?.getTime() ?? Date.now()) - momento) / 1000));
  if (segundos > ATTENTION_THRESHOLDS.redSeconds) return 'alto';
  if (segundos >= ATTENTION_THRESHOLDS.amberSeconds) return 'aviso';
  return 'ok';
}
