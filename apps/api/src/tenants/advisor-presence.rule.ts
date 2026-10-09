/**
 * Regla de presencia de las asesoras.
 *
 * Una bandeja visible manda un pulso cada minuto; la presencia vale dos. Un solo pulso perdido no
 * saca a nadie de la rotacion, y un navegador cerrado deja de contar en dos minutos sin que haya
 * que cerrar sesion. Estos dos numeros son la MISMA regla vista desde los dos lados, asi que viven
 * aqui y no repetidos en cada servicio.
 */
export const ADVISOR_PRESENCE_TTL_MS = 120_000;

/**
 * Desde cuando cuenta una presencia como activa.
 *
 * Se calcula con el reloj del proceso y se manda a PostgreSQL como parametro. El margen de error
 * entre ese reloj y el de la base es de milisegundos, muy por debajo de los dos minutos de margen:
 * la funcion SQL no vuelve a decidir el plazo para no tener la regla en dos sitios.
 */
export function advisorActiveAfter(ahora: number = Date.now()): string {
  return new Date(ahora - ADVISOR_PRESENCE_TTL_MS).toISOString();
}

/** Cuando vence la presencia que acaba de registrar un pulso. */
export function advisorActiveUntil(ahora: number = Date.now()): string {
  return new Date(ahora + ADVISOR_PRESENCE_TTL_MS).toISOString();
}
