import { describe, expect, it } from 'vitest';
import { WHATSAPP_SERVICE_WINDOW_MS, whatsappServiceWindow } from './whatsapp-window';

const entrante = '2026-10-07T18:00:00.000Z';
const instante = (iso: string) => Date.parse(iso);

describe('ventana de servicio de WhatsApp', () => {
  it('las 24 horas son las que dice la politica', () => {
    expect(WHATSAPP_SERVICE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('esta abierta dentro del plazo y dice cuando cierra', () => {
    const ventana = whatsappServiceWindow(entrante, instante('2026-10-08T10:00:00.000Z'));
    expect(ventana).toEqual({
      expiresAt: '2026-10-08T18:00:00.000Z',
      lastInboundAt: entrante,
      open: true
    });
  });

  it('se cierra en cuanto pasan las 24 horas', () => {
    expect(whatsappServiceWindow(entrante, instante('2026-10-08T18:00:01.000Z'))?.open).toBe(false);
  });

  it('en el limite exacto ya esta cerrada: a las 24 horas Meta no admite mensajes libres', () => {
    expect(whatsappServiceWindow(entrante, instante('2026-10-08T18:00:00.000Z'))?.open).toBe(false);
  });

  it('un minuto antes sigue abierta', () => {
    expect(whatsappServiceWindow(entrante, instante('2026-10-08T17:59:00.000Z'))?.open).toBe(true);
  });

  it('sin mensaje entrante no hay ventana que afirmar', () => {
    // Varias variantes del mismo caso: vacio, nulo, ausente y basura.
    for (const valor of [null, undefined, '', '   ', 'ayer']) {
      expect(
        whatsappServiceWindow(valor, instante('2026-10-08T10:00:00.000Z')),
        String(valor)
      ).toBeNull();
    }
  });

  it('normaliza los instantes que devuelve el proveedor con desplazamiento', () => {
    expect(
      whatsappServiceWindow('2026-10-07T12:00:00-06:00', instante('2026-10-08T10:00:00.000Z'))
    ).toMatchObject({ expiresAt: '2026-10-08T18:00:00.000Z', open: true });
  });

  it('manda el entrante mas reciente cuando quien llama elige cual pasar', () => {
    const reciente = whatsappServiceWindow(
      '2026-10-08T09:00:00.000Z',
      instante('2026-10-08T10:00:00.000Z')
    );
    const antiguo = whatsappServiceWindow(entrante, instante('2026-10-08T10:00:00.000Z'));
    expect(reciente?.open).toBe(true);
    expect(antiguo?.open).toBe(true);
    // Y con el mismo "ahora", el antiguo cierra antes.
    expect(instante(reciente!.expiresAt)).toBeGreaterThan(instante(antiguo!.expiresAt));
  });
});
