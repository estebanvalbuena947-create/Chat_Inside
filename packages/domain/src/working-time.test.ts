import { describe, expect, it } from 'vitest';
import {
  measureResponses,
  operationalInstant,
  validWeeklyShifts,
  workingSeconds,
  type ScheduleVersion
} from './working-time';
import { summarizeDraftDays } from './reservation-board';
import { normalizeDraft } from './reservations';

const at = (day: string, time: string) =>
  operationalInstant(day, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
const version = (
  userId: string,
  shifts: ScheduleVersion['shifts'],
  effectiveAt = '2026-10-01T00:00:00Z'
): ScheduleVersion => ({ userId, shifts, effectiveAt });
const shifts = [
  version('a', [
    ...[2, 3, 4, 5, 6].map((day) => ({ day, start: 480, end: 1020 })),
    { day: 1, start: 900, end: 1380 }
  ]),
  version(
    'b',
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: 1020, end: 1380 }))
  ),
  version(
    'c',
    [0, 1].map((day) => ({ day, start: 480, end: 900 }))
  )
];

describe('cobertura de atención versionada', () => {
  it('convierte el día y la hora de México sin depender del servidor', () =>
    expect(new Date(at('2026-10-20', '08:00')).toISOString()).toBe('2026-10-20T14:00:00.000Z'));
  it('conserva esperas que atraviesan varios días sin turno', () =>
    expect(
      workingSeconds(at('2026-10-16', '16:55'), at('2026-10-19', '08:05'), [
        version('a', [
          { day: 5, start: 480, end: 1020 },
          { day: 1, start: 480, end: 1020 }
        ])
      ])
    ).toBe(600));
  it('descuenta la noche', () =>
    expect(workingSeconds(at('2026-10-20', '22:55'), at('2026-10-21', '08:05'), shifts)).toBe(600));
  it('descuenta el hueco dominical de 15 a 17', () =>
    expect(workingSeconds(at('2026-10-18', '14:55'), at('2026-10-18', '17:05'), shifts)).toBe(600));
  it('une los turnos del lunes sin multiplicar el solapamiento', () =>
    expect(workingSeconds(at('2026-10-19', '08:00'), at('2026-10-19', '23:00'), shifts)).toBe(
      15 * 3600
    ));
  it('no cuenta dos veces turnos de dos integrantes', () =>
    expect(
      workingSeconds(at('2026-10-20', '17:00'), at('2026-10-20', '18:00'), [
        version('a', [{ day: 2, start: 0, end: 1440 }]),
        version('b', [{ day: 2, start: 1020, end: 1380 }])
      ])
    ).toBe(3600));
  it('un descanso explícito tiene cero cobertura', () =>
    expect(
      workingSeconds(at('2026-10-20', '08:00'), at('2026-10-20', '18:00'), [version('a', [])])
    ).toBe(0));
  it('sin configuración no inventa cero minutos', () =>
    expect(workingSeconds(at('2026-10-20', '08:00'), at('2026-10-20', '09:00'), [])).toBeNull());
  it('no aplica un horario al pasado', () =>
    expect(
      workingSeconds(at('2026-09-30', '08:00'), at('2026-10-20', '09:00'), shifts)
    ).toBeNull());
  it('respeta el instante de cambio conservando el tramo anterior', () => {
    const versions = [
      version('a', [{ day: 2, start: 480, end: 1020 }]),
      version('a', [], new Date(at('2026-10-20', '12:00')).toISOString())
    ];
    expect(workingSeconds(at('2026-10-20', '11:00'), at('2026-10-20', '13:00'), versions)).toBe(
      3600
    );
    expect(workingSeconds(at('2026-10-20', '09:00'), at('2026-10-20', '10:00'), versions)).toBe(
      3600
    );
  });
  it('admite turnos que atraviesan medianoche y el límite semanal', () =>
    expect(
      workingSeconds(at('2026-10-18', '00:30'), at('2026-10-18', '01:30'), [
        version('a', [{ day: 6, start: 1320, end: 120 }])
      ])
    ).toBe(3600));
  it.each(
    [
      [{ day: 1, start: 0, end: 0 }],
      [{ day: 7, start: 60, end: 120 }],
      [{ day: 0, start: -1, end: 120 }],
      [{ day: 0, start: 1.5, end: 120 }],
      [{ day: 0, start: 60, end: 1441 }],
      [
        { day: 6, start: 1320, end: 120 },
        { day: 0, start: 60, end: 180 }
      ]
    ].map((invalid) => [invalid])
  )('rechaza turnos inválidos o solapados %j', (invalid) =>
    expect(validWeeklyShifts(invalid)).toBe(false)
  );
  it('acepta turnos adyacentes sin solaparlos', () =>
    expect(
      validWeeklyShifts([
        { day: 1, start: 480, end: 900 },
        { day: 1, start: 900, end: 1380 }
      ])
    ).toBe(true));
  it('rechaza intervalos temporales invertidos', () =>
    expect(() => workingSeconds(5, 1, shifts)).toThrow());
});

describe('mediciones y rangos comparten una sola regla', () => {
  const inbound = (id: string, time: string) => ({
    conversationId: id,
    createdAt: new Date(at('2026-10-20', time)).toISOString(),
    direction: 'inbound',
    senderType: 'contact'
  });
  const reply = (id: string, time: string, senderType = 'agent') => ({
    ...inbound(id, time),
    direction: 'outbound',
    senderType
  });
  it.each([
    ['08:04', 'under'],
    ['08:05', 'between'],
    ['08:10', 'between'],
    ['08:11', 'over']
  ])('clasifica el límite %s', (time, bucket) =>
    expect(
      measureResponses([inbound('a', '08:00'), reply('a', time)], '2026-10-01', shifts)[0].bucket
    ).toBe(bucket)
  );
  it('ignora el bot y conserva el último mensaje entrante previo como el cálculo existente', () => {
    const result = measureResponses(
      [
        inbound('a', '08:00'),
        reply('a', '08:01', 'automation'),
        inbound('a', '08:02'),
        reply('a', '08:05'),
        reply('a', '08:09')
      ],
      '2026-10-01',
      shifts
    );
    expect(result).toHaveLength(1);
    expect(result[0].seconds).toBe(180);
    expect(result[0].basis).toBe('working');
  });
  it('etiqueta explícitamente el tiempo corrido sin historia', () =>
    expect(
      measureResponses([inbound('a', '08:00'), reply('a', '08:05')], '2026-10-01')[0]
    ).toMatchObject({ basis: 'elapsed', seconds: 300, elapsedSeconds: 300 }));
  it('sin respuesta humana no crea una medición', () =>
    expect(
      measureResponses(
        [inbound('a', '08:00'), reply('a', '08:05', 'automation')],
        '2026-10-01',
        shifts
      )
    ).toEqual([]));
});

describe('fecha de creación de prerreservas', () => {
  it('una revisión posterior no mueve la creación de día', () => {
    const draft = normalizeDraft({
      id: 1,
      created_at: '2026-10-18T15:00:00Z',
      comprobante_revision_at: '2026-10-20T15:00:00Z'
    });
    expect(summarizeDraftDays([draft], '2026-10-18')).toEqual([{ date: '2026-10-18', total: 1 }]);
    expect(summarizeDraftDays([draft], '2026-10-20')).toEqual([{ date: '2026-10-20', total: 0 }]);
  });
  it('la madrugada UTC se agrupa en el día anterior en México', () =>
    expect(
      summarizeDraftDays([normalizeDraft({ created_at: '2026-10-20T05:59:00Z' })], '2026-10-19')[0]
        .total
    ).toBe(1));
  it('no inventa creación a partir de revisión o actualización', () =>
    expect(
      normalizeDraft({
        comprobante_revision_at: '2026-10-20T15:00:00Z',
        updated_at: '2026-10-20T15:00:00Z'
      }).entroEn
    ).toBeNull());
});
