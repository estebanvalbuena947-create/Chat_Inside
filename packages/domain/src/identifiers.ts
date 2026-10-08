/**
 * Forma de un UUID derivado de un hash.
 *
 * Varias columnas del esquema son de tipo `uuid` (`messages.idempotency_key`,
 * `outbox_events.idempotency_key`) y a la vez necesitan claves **deterministas**: el mismo hecho
 * tiene que producir la misma clave para que un reintento no duplique el efecto. Como el valor de
 * partida suele ser legible (una referencia del proveedor, una clave de un flujo), aqui se le da la
 * forma que exige el contrato: version 4 y variante 8/9/a/b, descartando los bits que el formato
 * reserva.
 *
 * La funcion es pura a proposito: quien la usa decide que hashea (hash) y con que secreto de
 * dominio; la forma vive en un solo sitio.
 */

/** La forma que exige el contrato: version 1-8 y variante 8/9/a/b. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Da forma de UUID a un hash hexadecimal. */
export function uuidDesdeHash(hash: string): string {
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-');
}

/** Un valor con la forma exacta que exigen las columnas `uuid`. */
export function tieneFormaDeUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID.test(value);
}
