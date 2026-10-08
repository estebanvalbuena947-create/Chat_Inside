/**
 * Identificadores del cliente que Meta acepta para atribuir una conversion.
 *
 * Es una funcion pura a proposito: la usan DOS caminos —la API al encolar la conversion y el
 * trabajador al entregarla— y tener dos copias de esta regla fue justo el fallo que dejo todas las
 * conversiones sin enviar: las dos copias leian columnas que el sistema nunca escribe.
 *
 * De donde sale cada dato, y por que:
 *   - `external_reference` es la referencia del contacto en el sistema de origen, y es la columna que
 *     SI se rellena (300 de 300 contactos medidos el 2026-10-08). Viaja como `external_id`, que es el
 *     identificador que Meta admite sin hashear.
 *   - `platform_user_id` se conserva como respaldo: hoy no se escribe, pero si algun dia se rellena es
 *     un identificador de plataforma legitimo.
 *   - `email` y `phone_e164` van SOLO si la configuracion lo permite: son datos de contacto, y
 *     apagarlos es un interruptor de configuracion, no de codigo.
 */

export type MetaContactFields = {
  email?: string | null;
  externalReference?: string | null;
  phoneE164?: string | null;
  platformUserId?: string | null;
};

export type MetaUserIdentifiers = {
  email?: string;
  externalId?: string;
  phone?: string;
};

/** El mismo motivo en los dos caminos: el evento no se puede atribuir a nadie. */
export const SIN_IDENTIFICADORES_DEL_CLIENTE = 'Sin identificadores del cliente.';

export function metaUserIdentifiers(
  contact: MetaContactFields,
  options: { includeContactData: boolean }
): MetaUserIdentifiers {
  const user: MetaUserIdentifiers = {};

  // Cadena vacia o espacios no son un identificador: se descartan como si no estuvieran.
  const externalId = texto(contact.externalReference) ?? texto(contact.platformUserId);
  if (externalId) user.externalId = externalId;

  if (options.includeContactData) {
    const email = texto(contact.email);
    const phone = texto(contact.phoneE164);
    if (email) user.email = email;
    if (phone) user.phone = phone;
  }

  return user;
}

/** Sin ningun identificador, Meta no puede atribuir el evento: enviarlo solo ensucia el registro. */
export function hasMetaUserIdentifiers(user: MetaUserIdentifiers): boolean {
  return Object.keys(user).length > 0;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}
