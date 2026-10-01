export const INBOX_SEARCH_MAX_LENGTH = 80;

export type InboxCursor = {
  id: string;
  lastMessageAt: string | null;
};

/**
 * Cursor de la bandeja. Es opaco para el cliente: solo se devuelve y se reenvia.
 * Se codifica como JSON para no depender de APIs de Node ni del navegador.
 */
export function encodeInboxCursor(cursor: InboxCursor): string {
  return JSON.stringify({ id: cursor.id, lastMessageAt: cursor.lastMessageAt });
}

export function decodeInboxCursor(value: string | null | undefined): InboxCursor | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return null;
  if (candidate.lastMessageAt !== null && typeof candidate.lastMessageAt !== 'string') return null;
  if (
    typeof candidate.lastMessageAt === 'string' &&
    Number.isNaN(Date.parse(candidate.lastMessageAt))
  ) {
    return null;
  }

  return {
    id: candidate.id,
    lastMessageAt: candidate.lastMessageAt as string | null
  };
}

const RESERVED_SEARCH_CHARACTERS = /[\\%_*,.()"'<>]/g;

/**
 * Saneado del termino de busqueda en lugar de escaparlo: se retiran los caracteres que
 * pueden alterar la condicion del listado o actuar como comodines, de modo que el termino
 * nunca pueda cambiar la forma de la consulta.
 */
export function sanitizeSearchTerm(term: string | null | undefined): string | null {
  if (!term) return null;

  const bounded = term.trim().slice(0, INBOX_SEARCH_MAX_LENGTH);
  const cleaned = bounded.replace(RESERVED_SEARCH_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();

  return cleaned || null;
}
