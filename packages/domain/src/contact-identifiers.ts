/**
 * Identificadores de contacto: telefono y correo.
 *
 * Se normalizan aqui, una sola vez, para que guardar, comparar y buscar sean fiables. Si cada
 * pantalla normalizara a su manera, el mismo cliente acabaria con dos fichas distintas.
 *
 * El pais no se adivina ni se escribe dentro: llega por parametro desde la configuracion.
 */

/** Formato internacional E.164: mas, primer digito distinto de cero, y entre 8 y 15 digitos. */
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/** Formato de correo suficiente para uso real: no pretende cubrir cada rareza del estandar. */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

const MAX_EMAIL_LENGTH = 254;

export type NormalizedIdentifier =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string };

const SEPARADORES = /[\s().-]/g;

/**
 * Normaliza un telefono a E.164.
 *
 * Acepta separadores habituales y el prefijo internacional escrito como `00`. Si el numero no trae
 * prefijo, se le aplica el pais indicado por el llamante: nunca se supone cual es.
 */
export function normalizePhoneE164(
  input: string,
  defaultCountryCode: string
): NormalizedIdentifier {
  const original = typeof input === 'string' ? input.trim() : '';
  if (original.length === 0) {
    return { ok: false, reason: 'El telefono no puede estar vacio.' };
  }

  const limpio = original.replace(SEPARADORES, '');
  if (!/^[+0-9]+$/.test(limpio)) {
    return { ok: false, reason: 'El telefono solo admite digitos y los separadores habituales.' };
  }

  let candidato = limpio;
  if (candidato.startsWith('00')) {
    candidato = `+${candidato.slice(2)}`;
  }

  if (!candidato.startsWith('+')) {
    const pais = (defaultCountryCode ?? '').replace(/[^0-9]/g, '');
    if (pais.length === 0) {
      return { ok: false, reason: 'Hace falta el codigo de pais para interpretar el telefono.' };
    }
    candidato = `+${pais}${candidato}`;
  }

  if (!E164_PATTERN.test(candidato)) {
    return { ok: false, reason: 'El telefono no queda en formato internacional valido.' };
  }

  return { ok: true, value: candidato };
}

/** Normaliza un correo a minusculas y sin espacios, que es como se compara y se busca. */
export function normalizeEmail(input: string): NormalizedIdentifier {
  const valor = typeof input === 'string' ? input.trim().toLowerCase() : '';

  if (valor.length === 0) {
    return { ok: false, reason: 'El correo no puede estar vacio.' };
  }

  if (valor.length > MAX_EMAIL_LENGTH) {
    return { ok: false, reason: 'El correo es demasiado largo.' };
  }

  if (!EMAIL_PATTERN.test(valor)) {
    return { ok: false, reason: 'El correo no tiene un formato valido.' };
  }

  return { ok: true, value: valor };
}
