import { ATTENTION_THRESHOLDS } from '@chat-zernio/domain';
import { describe, expect, it } from 'vitest';
import {
  leerPorPaginas,
  summarizeClosure,
  summarizeMessages,
  summarizeResponseTimes,
  type MetricRow,
  type ResponseRow
} from './metrics.service';

const DESDE = '2026-10-01T00:00:00.000Z';

const fila = (createdAt: string, direction: string, platform: string | null): MetricRow => ({
  createdAt,
  direction,
  platform
});

const mensaje = (
  conversationId: string,
  createdAt: string,
  direction: string,
  senderType: string
): ResponseRow => ({ conversationId, createdAt, direction, senderType });

/** Opciones del resumen con lo minimo; cada prueba cambia solo lo que mide. */
const opciones = (
  extra: Partial<Parameters<typeof summarizeMessages>[1]> = {}
): Parameters<typeof summarizeMessages>[1] => ({
  closure: { byAdvisor: 0, byBot: 0 },
  days: 30,
  responseTime: summarizeResponseTimes([], { since: DESDE }),
  truncated: false,
  ...extra
});

describe('resumen de actividad', () => {
  it('cuenta entrantes y salientes por dia', () => {
    const r = summarizeMessages(
      [
        fila('2026-10-01T10:00:00.000Z', 'inbound', 'instagram'),
        fila('2026-10-01T11:00:00.000Z', 'outbound', 'instagram'),
        fila('2026-10-02T09:00:00.000Z', 'inbound', 'instagram')
      ],
      opciones()
    );
    expect(r.messagesPerDay).toEqual([
      { date: '2026-10-01', received: 1, sent: 1 },
      { date: '2026-10-02', received: 1, sent: 0 }
    ]);
    expect(r.totalMessages).toBe(3);
  });

  it('agrupa por plataforma y ordena de mayor a menor actividad', () => {
    const r = summarizeMessages(
      [
        fila('2026-10-01T10:00:00.000Z', 'inbound', 'instagram'),
        fila('2026-10-01T10:01:00.000Z', 'inbound', 'instagram'),
        fila('2026-10-01T10:02:00.000Z', 'inbound', 'tiktok')
      ],
      opciones()
    );
    expect(r.messagesByChannel).toEqual([
      { platform: 'instagram', received: 2, sent: 0 },
      { platform: 'tiktok', received: 1, sent: 0 }
    ]);
  });

  it('no inventa plataforma cuando el mensaje no tiene canal', () => {
    const r = summarizeMessages([fila('2026-10-01T10:00:00.000Z', 'inbound', null)], opciones());
    expect(r.messagesByChannel[0].platform).toBe('sin canal');
  });

  it('devuelve un resumen vacio, no un error, cuando no hay actividad', () => {
    const r = summarizeMessages([], opciones({ closure: { byAdvisor: 1, byBot: 3 }, days: 7 }));
    expect(r.messagesPerDay).toEqual([]);
    expect(r.messagesByChannel).toEqual([]);
    expect(r.totalMessages).toBe(0);
    expect(r.closedConversations).toBe(4);
    expect(r.periodDays).toBe(7);
  });

  it('marca el resultado como minimo cuando se alcanzo el tope de lectura', () => {
    const r = summarizeMessages([], opciones({ truncated: true }));
    expect(r.truncated).toBe(true);
  });
});

describe('cierre de conversaciones: quien las atendio', () => {
  it('reparte por participacion y el total es la suma de las dos partes', () => {
    const reparto = summarizeClosure(['a', 'b', 'c'], ['b', 'c', 'z']);
    expect(reparto).toEqual({ byAdvisor: 2, byBot: 1 });
    expect(reparto.byAdvisor + reparto.byBot).toBe(3);
  });

  it('sin asesores, todas las cerradas las llevo el bot', () => {
    expect(summarizeClosure(['a', 'b'], [])).toEqual({ byAdvisor: 0, byBot: 2 });
  });

  it('no cuenta dos veces una conversacion aunque tenga varias respuestas de asesor', () => {
    expect(summarizeClosure(['a'], ['a', 'a'])).toEqual({ byAdvisor: 1, byBot: 0 });
  });
});

describe('tiempo de respuesta del asesor', () => {
  const resumen = (rows: ResponseRow[], since = DESDE) => summarizeResponseTimes(rows, { since });

  it('mide la espera hasta la primera respuesta de un asesor', () => {
    const r = resumen([
      mensaje('c1', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c1', '2026-10-01T10:04:00.000Z', 'outbound', 'agent')
    ]);
    expect(r.conversations).toBe(1);
    expect(r.averageSeconds).toBe(240);
    expect(r.underFiveMinutes).toBe(1);
  });

  it('no mide una segunda respuesta mas lenta: la primera es la que dice cuanto espero el cliente', () => {
    const r = resumen([
      mensaje('c1', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c1', '2026-10-01T10:02:00.000Z', 'outbound', 'agent'),
      mensaje('c1', '2026-10-01T10:03:00.000Z', 'inbound', 'contact'),
      mensaje('c1', '2026-10-01T11:30:00.000Z', 'outbound', 'agent')
    ]);
    expect(r.averageSeconds).toBe(120);
    expect(r.conversations).toBe(1);
  });

  it('lo que manda el bot no es tiempo de espera de un asesor', () => {
    const r = resumen([
      mensaje('c1', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c1', '2026-10-01T10:00:30.000Z', 'outbound', 'automation')
    ]);
    // El bot contesto, pero un asesor no: el periodo no tiene tiempo de respuesta que medir.
    expect(r.conversations).toBe(0);
    expect(r.averageSeconds).toBeNull();
  });

  it('no mide una respuesta de asesor sin mensaje previo del cliente', () => {
    const r = resumen([mensaje('c1', '2026-10-01T10:00:00.000Z', 'outbound', 'agent')]);
    expect(r.conversations).toBe(0);
    expect(r.averageSeconds).toBeNull();
  });

  it('empareja una respuesta con el mensaje anterior al periodo', () => {
    const r = resumen([
      mensaje('c1', '2026-09-30T23:58:00.000Z', 'inbound', 'contact'),
      mensaje('c1', '2026-10-01T00:01:00.000Z', 'outbound', 'agent')
    ]);
    expect(r.conversations).toBe(1);
    expect(r.averageSeconds).toBe(180);
  });

  it('no cuenta una respuesta de asesor anterior al periodo', () => {
    const r = resumen([
      mensaje('c1', '2026-09-30T22:00:00.000Z', 'inbound', 'contact'),
      mensaje('c1', '2026-09-30T22:03:00.000Z', 'outbound', 'agent')
    ]);
    expect(r.conversations).toBe(0);
    expect(r.averageSeconds).toBeNull();
  });

  it('pone el limite de cada color donde dice la politica', () => {
    const aminuto = (minutos: number) =>
      new Date(Date.parse('2026-10-01T10:00:00.000Z') + minutos * 60_000).toISOString();
    const r = resumen([
      // Justo en el limite: sigue siendo bueno/aceptable, no rojo.
      mensaje('c1', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c1', aminuto(5), 'outbound', 'agent'),
      mensaje('c2', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c2', aminuto(10), 'outbound', 'agent'),
      // Un segundo mas alla del limite y ya es rojo.
      mensaje('c3', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c3', new Date(Date.parse(aminuto(10)) + 1000).toISOString(), 'outbound', 'agent')
    ]);
    expect(ATTENTION_THRESHOLDS).toEqual({ amberSeconds: 300, redSeconds: 600 });
    expect(r.thresholds).toEqual(ATTENTION_THRESHOLDS);
    expect(r.underFiveMinutes).toBe(0);
    expect(r.betweenFiveAndTenMinutes).toBe(2);
    expect(r.overTenMinutes).toBe(1);
    expect(r.conversations).toBe(3);
  });

  it('promedia solo las conversaciones que tienen respuesta', () => {
    const r = resumen([
      mensaje('c1', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c1', '2026-10-01T10:01:00.000Z', 'outbound', 'agent'),
      mensaje('c2', '2026-10-01T10:00:00.000Z', 'inbound', 'contact'),
      mensaje('c2', '2026-10-01T10:03:00.000Z', 'outbound', 'agent')
    ]);
    expect(r.averageSeconds).toBe(120);
  });
});

describe('lectura por paginas', () => {
  const lote = (cantidad: number, desde = 0) =>
    Array.from({ length: cantidad }, (_, indice) => desde + indice);

  it('pide paginas hasta que el servidor devuelve menos de una pagina completa', async () => {
    const pedidos: Array<[number, number]> = [];
    const resultado = await leerPorPaginas<number>(
      async (desde, hasta) => {
        pedidos.push([desde, hasta]);
        return desde === 0
          ? { data: lote(1000), error: null }
          : { data: [1000, 1001], error: null };
      },
      20000,
      'No fue posible leer la actividad.'
    );

    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999]
    ]);
    expect(resultado.filas).toHaveLength(1002);
    expect(resultado.truncado).toBe(false);
  });

  it('se detiene en el tope y lo informa, para no presentar un trozo como total', async () => {
    let paginas = 0;
    const resultado = await leerPorPaginas<number>(
      async (desde) => {
        paginas += 1;
        return { data: lote(1000, desde), error: null };
      },
      2500,
      'No fue posible leer la actividad.'
    );

    // Tres paginas ya pasan del tope: la tercera es la que permite saber que hay mas.
    expect(paginas).toBe(3);
    expect(resultado.filas).toHaveLength(2500);
    expect(resultado.truncado).toBe(true);
  });

  it('no pide una segunda pagina cuando la primera viene vacia', async () => {
    let paginas = 0;
    const resultado = await leerPorPaginas<number>(
      async () => {
        paginas += 1;
        return { data: [], error: null };
      },
      20000,
      'No fue posible leer la actividad.'
    );

    expect(paginas).toBe(1);
    expect(resultado).toEqual({ filas: [], truncado: false });
  });

  it('convierte el error del servidor en un fallo con el motivo del que lo pidio', async () => {
    await expect(
      leerPorPaginas<number>(
        async () => ({ data: null, error: { code: 'temporal' } }),
        20000,
        'No fue posible leer los tiempos de respuesta.'
      )
    ).rejects.toThrow('No fue posible leer los tiempos de respuesta.');
  });
});
