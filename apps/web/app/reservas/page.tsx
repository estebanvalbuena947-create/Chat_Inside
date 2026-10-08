'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Actividad de Reservas.
 *
 * Lee el tablero por la ruta interna del propio sitio (`/api/reservations/board`), que resuelve la
 * sesion. Quien puede verlo lo decide la API: aqui solo se pinta, y si el rol no alcanza se dice con
 * las palabras que devuelve.
 *
 * Primera version: KPIs, el aviso de retenciones por vencer y la lista de pre-reservas. Los filtros y
 * las decisiones vienen en los cortes siguientes.
 */

type Draft = {
  actualizadaEn: string | null;
  cerradaEn: string | null;
  entroEn: string | null;
  estado: string;
  estadoMostrado: string;
  horarioProgramado: string | null;
  id: number | null;
  monto: number;
  nombre: string | null;
  servicio: string | null;
  telefono: string | null;
};

type Board = {
  actualizadoEn: string;
  kpis: {
    comprobantesPorRevisar: number;
    confirmadasHoy: number;
    enConfirmacion: number;
    montoConfirmadoHoy: number;
    montoPendiente: number;
    pendientes: number;
    porGestionar: number;
    porRevisar: number;
    proximas24h: number;
    rechazadas: number;
    retencionesPorVencer: Array<{ borradorId: number | null; expiraEn: string; nombre: string | null }>;
  };
  preReservas: Draft[];
};

const ESTADOS: Record<string, string> = {
  confirmed: 'Confirmada',
  info: 'Información solicitada',
  pending: 'Pendiente de pago',
  processing: 'En confirmación',
  rejected: 'Comprobante rechazado',
  review: 'Por revisar'
};

const COLORES: Record<string, string> = {
  confirmed: '#1f7a4d',
  info: '#946200',
  pending: '#8a6d3b',
  processing: '#2c6e9b',
  rejected: '#b3261e',
  review: '#946200'
};

function dinero(valor: number): string {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency'
  }).format(valor);
}

function fecha(valor: string | null): string {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(fecha);
}

/** Cuando vence una retencion: si vence, se libera el horario y se pierde la reserva. */
function enPalabras(valor: string): string {
  const minutos = Math.max(0, Math.round((new Date(valor).getTime() - Date.now()) / 60000));
  return minutos <= 1 ? 'menos de 1 min' : `${minutos} min`;
}

export default function ReservasPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch('/api/reservations/board', { cache: 'no-store' });
      const payload = (await respuesta.json().catch(() => ({}))) as { error?: string } & Board;
      if (!respuesta.ok) {
        setError(payload.error ?? 'No fue posible cargar el tablero de reservas.');
        return;
      }
      setBoard(payload);
    } catch {
      setError('El tablero de reservas no está disponible.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const tarjetas = board
    ? [
        { etiqueta: 'Por gestionar', valor: String(board.kpis.porGestionar) },
        { etiqueta: 'Pendientes de pago', valor: String(board.kpis.pendientes) },
        { etiqueta: 'Por revisar', valor: String(board.kpis.porRevisar) },
        { etiqueta: 'En confirmación', valor: String(board.kpis.enConfirmacion) },
        { etiqueta: 'Confirmadas hoy', valor: String(board.kpis.confirmadasHoy) },
        { etiqueta: 'Cobrado hoy', valor: dinero(board.kpis.montoConfirmadoHoy) },
        { etiqueta: 'Monto pendiente', valor: dinero(board.kpis.montoPendiente) },
        { etiqueta: 'Comprobantes por revisar', valor: String(board.kpis.comprobantesPorRevisar) },
        { etiqueta: 'Citas en 24 h', valor: String(board.kpis.proximas24h) }
      ]
    : [];

  return (
    <main style={{ background: '#fcfbf6', minHeight: '100vh', padding: '28px' }}>
      <header style={{ alignItems: 'baseline', display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Actividad de Reservas</h1>
        <button
          onClick={() => void cargar()}
          style={{
            background: 'transparent',
            border: '1px solid #d9d3c4',
            borderRadius: '6px',
            cursor: 'pointer',
            padding: '4px 10px'
          }}
          type="button"
        >
          Actualizar
        </button>
        {board && (
          <span style={{ color: '#7a7466', fontSize: '13px' }}>
            Leído {fecha(board.actualizadoEn)}
          </span>
        )}
      </header>

      {cargando && <p style={{ color: '#7a7466' }}>Cargando el tablero…</p>}
      {error && (
        <p role="alert" style={{ color: '#b3261e' }}>
          {error}
        </p>
      )}

      {board && !cargando && (
        <>
          {board.kpis.retencionesPorVencer.length > 0 && (
            <section
              style={{
                background: '#fdf1ef',
                border: '1px solid #d1453b',
                borderRadius: '8px',
                marginBottom: '20px',
                padding: '12px 16px'
              }}
            >
              <strong style={{ color: '#b3261e' }}>
                {board.kpis.retencionesPorVencer.length === 1
                  ? 'Una reserva está por liberarse'
                  : `${board.kpis.retencionesPorVencer.length} reservas están por liberarse`}
              </strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                {board.kpis.retencionesPorVencer.map((retencion) => (
                  <li key={String(retencion.borradorId) + retencion.expiraEn}>
                    {retencion.nombre ?? 'Sin nombre'} · vence en {enPalabras(retencion.expiraEn)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            style={{
              display: 'grid',
              gap: '10px',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              marginBottom: '24px'
            }}
          >
            {tarjetas.map((tarjeta) => (
              <div
                key={tarjeta.etiqueta}
                style={{
                  background: '#fff',
                  border: '1px solid #e6e0d2',
                  borderRadius: '8px',
                  padding: '12px 14px'
                }}
              >
                <p style={{ color: '#7a7466', fontSize: '12px', margin: 0 }}>{tarjeta.etiqueta}</p>
                <p style={{ fontSize: '22px', margin: '4px 0 0' }}>{tarjeta.valor}</p>
              </div>
            ))}
          </section>

          <h2 style={{ fontSize: '18px', margin: '0 0 8px' }}>Pre-reservas</h2>
          {board.preReservas.length === 0 ? (
            <p style={{ color: '#7a7466' }}>No hay pre-reservas en el proyecto de reservas.</p>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={celdaCabecera}>Cliente</th>
                  <th style={celdaCabecera}>Servicio</th>
                  <th style={celdaCabecera}>Cita</th>
                  <th style={celdaCabecera}>Estado</th>
                  <th style={{ ...celdaCabecera, textAlign: 'right' }}>Monto</th>
                  <th style={celdaCabecera}>Entró</th>
                </tr>
              </thead>
              <tbody>
                {board.preReservas.map((fila) => (
                  <tr key={String(fila.id)} style={{ borderTop: '1px solid #ece6d8' }}>
                    <td style={celda}>
                      {fila.nombre ?? 'Sin nombre'}
                      {fila.telefono && (
                        <span style={{ color: '#7a7466', display: 'block', fontSize: '12px' }}>
                          {fila.telefono}
                        </span>
                      )}
                    </td>
                    <td style={celda}>{fila.servicio ?? '—'}</td>
                    <td style={celda}>{fecha(fila.horarioProgramado)}</td>
                    <td style={celda}>
                      <span
                        style={{
                          color: COLORES[fila.estadoMostrado] ?? '#4a4a4a',
                          fontWeight: 600
                        }}
                      >
                        {ESTADOS[fila.estadoMostrado] ?? fila.estadoMostrado}
                      </span>
                    </td>
                    <td style={{ ...celda, textAlign: 'right' }}>{dinero(fila.monto)}</td>
                    <td style={celda}>{fecha(fila.entroEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}

const celda: React.CSSProperties = {
  fontSize: '14px',
  padding: '8px 10px 8px 0',
  verticalAlign: 'top'
};

const celdaCabecera: React.CSSProperties = {
  color: '#7a7466',
  fontSize: '12px',
  fontWeight: 600,
  padding: '0 10px 6px 0',
  textTransform: 'uppercase'
};
