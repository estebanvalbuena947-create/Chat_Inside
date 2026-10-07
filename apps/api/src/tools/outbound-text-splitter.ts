import { createHash } from 'node:crypto';

/**
 * Parte un texto largo en dos mensajes.
 *
 * El contrato de la tool admite 4000 caracteres, pero el canal no: Instagram corta alrededor de
 * 1000. El flujo no lo sabe, y no deberia saberlo: quien envia es la plataforma. Asi que el corte
 * vive aqui, en la puerta, y no repetido en cada nodo que manda un texto largo.
 *
 * Se corta por donde no rompe el sentido, en este orden: un salto de parrafo (que es como separa
 * sus dos partes quien escribe el texto), un salto de linea, un espacio. Solo si no hay ninguno de
 * los tres se corta por el limite exacto.
 */

/** Por debajo del corte de Instagram, con margen para el resto del mensaje. */
export const OUTBOUND_TEXT_LIMIT = 900;

/** Separadores por orden de preferencia: cuanto antes aparezca, menos rompe el corte. */
const SEPARADORES = ['\n\n', '\n', ' '];

function puntoDeCorte(texto: string, limite: number): number {
  for (const separador of SEPARADORES) {
    const posicion = texto.lastIndexOf(separador, limite - 1);
    if (posicion > 0) return posicion;
  }
  return limite;
}

/**
 * Devuelve una parte si el texto cabe, y dos si no.
 *
 * Nunca devuelve una parte vacia: partir un texto en dos donde uno de los trozos no dice nada deja
 * al cliente con un mensaje en blanco, que es peor que recibir el texto entero.
 */
export function splitOutboundText(texto: string, limite = OUTBOUND_TEXT_LIMIT): string[] {
  if (limite < 1 || texto.length <= limite) return [texto];

  const corte = puntoDeCorte(texto, limite);
  const primera = texto.slice(0, corte).trim();
  const segunda = texto.slice(corte).trim();
  if (primera.length === 0 || segunda.length === 0) return [texto];

  return [primera, segunda];
}

/**
 * La clave de la segunda parte.
 *
 * No puede repetir la de la primera -- el segundo mensaje chocaria con la idempotencia del primero
 * y no saldria nunca -- y tiene que seguir siendo un UUID, que es lo que exige el contrato. Asi que
 * no vale anadirle un sufijo: se deriva otro UUID determinista de la clave original, para que un
 * reintento con la misma clave produzca exactamente las mismas partes.
 */
export function partIdempotencyKey(clave: string, parte: number): string {
  if (parte <= 1) return clave;
  const hash = createHash('sha256').update(`${clave}#${parte}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-');
}
