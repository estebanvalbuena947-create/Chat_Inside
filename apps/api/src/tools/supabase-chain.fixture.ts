/**
 * La cadena de consultas de Supabase, tal como el servicio la usa de verdad.
 *
 * Existe porque tres pruebas fallaron por lo mismo: cada archivo se fabricaba su propio doble, y el
 * doble simplificaba la cadena. Devolvia una promesa donde va un constructor, o tenia una longitud
 * fija de condiciones, o no sabia responder dos veces a la misma tabla.
 *
 * Lo que hay que reproducir es su naturaleza doble:
 *
 *   1. ES ENCADENABLE: se puede seguir anadiendo condiciones despues de order o de eq.
 *   2. ES ESPERABLE: `await cadena` devuelve `{ data, error }` sin llamar a nada mas.
 *
 * Un objeto que solo fuera una cosa rompe al servicio de una forma u otra. Aqui esta una sola vez.
 *
 * Ademas anota cada llamada, asi las pruebas afirman sobre lo que se pidio -- por tabla y por
 * metodo -- en lugar de depender del orden.
 */

export type RespuestaTabla = { data: unknown; error: unknown };

export type LlamadaSupabase = { args: unknown[]; metodo: string };

export type CadenaSupabase = {
  cadena: Record<string, unknown>;
  llamadas: LlamadaSupabase[];
};

/** Metodos que devuelven la cadena para seguir encadenando. */
const ENCADENABLES = [
  'delete',
  'eq',
  'in',
  'insert',
  'is',
  'limit',
  'neq',
  'order',
  'select',
  'update',
  'upsert'
];

/**
 * Una cadena que responde siempre lo mismo.
 *
 * Para las pruebas que necesitan respuestas distintas segun la llamada, usa `crearCadenaPorTurnos`.
 */
export function crearCadenaSupabase(respuesta: RespuestaTabla): CadenaSupabase {
  return crearCadenaPorTurnos([respuesta]);
}

/** Una cadena que responde una cosa distinta en cada consulta, en orden. */
export function crearCadenaPorTurnos(respuestas: RespuestaTabla[]): CadenaSupabase {
  const llamadas: LlamadaSupabase[] = [];
  let turno = 0;
  const siguiente = () => Promise.resolve(respuestas[Math.min(turno++, respuestas.length - 1)]);

  const encadenable: Record<string, unknown> = {};
  const anotar = (metodo: string, args: unknown[]) => {
    llamadas.push({ args, metodo });
    return encadenable;
  };

  for (const metodo of ENCADENABLES) {
    encadenable[metodo] = (...args: unknown[]) => anotar(metodo, args);
  }
  // Los terminales: anotan y devuelven el resultado, que es lo que el servicio espera.
  encadenable.maybeSingle = () => {
    llamadas.push({ args: [], metodo: 'maybeSingle' });
    return siguiente();
  };
  encadenable.single = () => {
    llamadas.push({ args: [], metodo: 'single' });
    return siguiente();
  };
  // La pieza que faltaba en los dobles que fallaron: se puede esperar la cadena directamente.
  encadenable.then = (resolver: (valor: unknown) => unknown) => siguiente().then(resolver);

  return { cadena: encadenable, llamadas };
}

/**
 * Un cliente que responde por tabla.
 *
 * Cada tabla recuerda sus propias llamadas, asi una prueba dice "en branch_media se pidio el canal
 * tiktok" sin importarle cuantas consultas hizo antes el servicio.
 */
export function crearClienteSupabase(tablas: Record<string, RespuestaTabla | RespuestaTabla[]>) {
  const porTabla = new Map<string, CadenaSupabase>();

  const deTabla = (tabla: string): CadenaSupabase => {
    const existente = porTabla.get(tabla);
    if (existente) return existente;
    const definicion = tablas[tabla];
    const creada = Array.isArray(definicion)
      ? crearCadenaPorTurnos(definicion)
      : crearCadenaSupabase(definicion ?? { data: null, error: null });
    porTabla.set(tabla, creada);
    return creada;
  };

  return {
    cliente: { from: (tabla: string) => deTabla(tabla).cadena },
    /** Los metodos y argumentos que se pidieron a una tabla, en orden. */
    llamadasDe: (tabla: string): LlamadaSupabase[] => deTabla(tabla).llamadas,
    /** Los argumentos de la primera llamada a un metodo concreto, o undefined. */
    argumentosDe: (tabla: string, metodo: string): unknown[] | undefined =>
      deTabla(tabla).llamadas.find((llamada) => llamada.metodo === metodo)?.args
  };
}
