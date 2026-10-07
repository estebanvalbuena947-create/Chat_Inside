import { createHash } from 'node:crypto';

/**
 * Claves de idempotencia de las tools.
 *
 * El contrato documentado (`docs/TOOLS_CONTRACT.md`) pide claves legibles, del estilo
 * `flujo-4.2-paso-7-<mensaje>`: son las que se leen en un registro o en una discusion. Pero la
 * columna `messages.idempotency_key` es de tipo `uuid` y el contrato de la interfaz exige un UUID.
 *
 * Este modulo hace la traduccion EN LA PUERTA del bot: no toca la tabla, no relaja el contrato de la
 * interfaz y no obliga a cada flujo a saber generar UUID. La traduccion es determinista, asi que un
 * reintento de n8n con la misma clave sigue siendo idempotente en lugar de crear un segundo mensaje.
 *
 * El UUID derivado depende del espacio y de la conversacion: dos conversaciones distintas pueden usar
 * la misma clave legible sin chocar entre si ni con el resto del espacio.
 */

/** La forma que exige el contrato: version 1-8 y variante 8/9/a/b. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Da forma de UUID a un hash hexadecimal, descartando los bits que el formato reserva. */
export function uuidDesdeHash(hash: string): string {
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-');
}

/**
 * Convierte la clave que manda un flujo en la clave que se guarda.
 *
 * Un UUID ya valido se respeta tal cual, para que el camino que ya lo manda no cambie de clave. Una
 * clave vacia se devuelve sin tocar, a proposito: asi el esquema la rechaza con un error claro en
 * lugar de convertir el olvido en un mensaje enviado.
 */
export function claveIdempotencia(espacio: string, conversacion: string, valor: unknown): unknown {
  if (typeof valor !== 'string') return valor;
  const limpia = valor.trim();
  if (limpia.length === 0) return valor;
  if (UUID.test(limpia)) return limpia;
  const hash = createHash('sha256').update(`${espacio}|${conversacion}|${limpia}`).digest('hex');
  return uuidDesdeHash(hash);
}
