import { createHash } from 'node:crypto';
import { tieneFormaDeUuid, uuidDesdeHash } from '@chat-zernio/domain';

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
 *
 * La forma del UUID es de `@chat-zernio/domain` (`uuidDesdeHash`): el trabajador deriva claves con
 * la misma forma y tenerla dos veces solo servia para que se separaran con el tiempo.
 */

export { uuidDesdeHash };

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
  if (tieneFormaDeUuid(limpia)) return limpia;
  const hash = createHash('sha256').update(`${espacio}|${conversacion}|${limpia}`).digest('hex');
  return uuidDesdeHash(hash);
}
