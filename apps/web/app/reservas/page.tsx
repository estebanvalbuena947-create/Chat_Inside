'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Draft = {
  id: number | null;
  nombre: string | null;
  servicio: string | null;
  estadoMostrado: string;
  estado: string;
  monto: number;
  horarioProgramado: string | null;
};
type Receipt = {
  borradorId: number | null;
  estado: string;
  mediaUrl: string | null;
  monto: number;
  referencia: string | null;
};
type Decision = {
  id: number | null;
  borradorId: number | null;
  accion: string;
  autor: string | null;
  nota: string | null;
  creadaEn: string | null;
};
type Board = {
  actualizadoEn: string;
  kpis: {
    porGestionar: number;
    confirmadasHoy: number;
    montoConfirmadoHoy: number;
    comprobantesPorRevisar: number;
    retencionesPorVencer: Array<{
      borradorId: number | null;
      expiraEn: string;
      nombre: string | null;
    }>;
  };
  preReservas: Draft[];
  comprobantes: Receipt[];
  decisiones: Decision[];
};
type Tab = 'summary' | 'drafts' | 'receipts' | 'history';
const label: Record<string, string> = {
  confirmed: 'Confirmada',
  info: 'Información solicitada',
  pending: 'Pendiente',
  processing: 'En confirmación',
  rejected: 'Rechazada',
  review: 'Por revisar'
};
const money = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  }).format(value);
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value)
      )
    : '—';

export default function ReservationsPanel(): React.ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const integrated = pathname === '/';
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [selected, setSelected] = useState<Draft | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reservations/board', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) setError(payload.error ?? 'No fue posible cargar las reservas.');
      else setBoard(payload as Board);
    } catch {
      setError('El tablero de reservas no está disponible.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function openDecision(draft: Draft | null): void {
    setSelected(draft);
    setIdempotencyKey(draft ? crypto.randomUUID() : null);
  }
  async function decide(action: 'approved' | 'rejected' | 'needs_info') {
    if (!selected?.id) return;
    const key = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(key);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/drafts/${selected.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, idempotencyKey: key, note: note || null })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) setError(payload.error ?? 'No fue posible guardar la decisión.');
      else {
        openDecision(null);
        setNote('');
        await load();
      }
    } finally {
      setSaving(false);
    }
  }
  const visibleDrafts =
    tab === 'summary'
      ? board?.preReservas.filter((row) => row.estadoMostrado !== 'confirmed')
      : board?.preReservas;
  return (
    <section className={`reservations-view${integrated ? ' reservations-view-integrated' : ''}`}>
      <header className="reservations-header">
        <div>
          {integrated && (
            <button className="metrics-back" onClick={() => router.replace('/')} type="button">
              Volver a bandeja
            </button>
          )}
          <p className="reservations-kicker">OPERACIÓN DE RESERVAS</p>
          <h1>Buenos días</h1>
        </div>
        <button className="reservations-refresh" onClick={() => void load()} type="button">
          Actualizar
        </button>
      </header>
      <nav className="reservations-tabs" aria-label="Secciones de reservas">
        {(
          [
            ['summary', 'Resumen'],
            ['drafts', 'Pre-reservas'],
            ['receipts', 'Comprobantes'],
            ['history', 'Histórico']
          ] as Array<[Tab, string]>
        ).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? 'active' : ''}
            type="button"
          >
            {text}
          </button>
        ))}
      </nav>
      {loading && <p>Cargando el tablero…</p>}
      {error && (
        <p role="alert" className="reservations-error">
          {error}
        </p>
      )}
      {board && !loading && (
        <>
          <div className="reservations-cards">
            {[
              ['Pre-reservas por gestionar', board.kpis.porGestionar],
              ['Confirmadas hoy', board.kpis.confirmadasHoy],
              ['Ingresos confirmados hoy', money(board.kpis.montoConfirmadoHoy)],
              ['Comprobantes por revisar', board.kpis.comprobantesPorRevisar]
            ].map(([text, value]) => (
              <article key={String(text)}>
                <span>{text}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          {board.kpis.retencionesPorVencer.length > 0 && (
            <aside className="reservations-hold">
              Hay retenciones próximas a vencer. Revísalas antes de que se libere el horario.
            </aside>
          )}
          {(tab === 'summary' || tab === 'drafts') && (
            <Table rows={visibleDrafts ?? []} onManage={openDecision} />
          )}
          {tab === 'receipts' && (
            <section className="reservations-table">
              <h2>Comprobantes</h2>
              <table>
                <thead>
                  <tr>
                    <th>Pre-reserva</th>
                    <th>Referencia</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {board.comprobantes.map((row, i) => (
                    <tr key={`${row.borradorId}-${i}`}>
                      <td data-label="Pre-reserva">#{row.borradorId ?? '—'}</td>
                      <td data-label="Referencia">{row.referencia ?? '—'}</td>
                      <td data-label="Monto">{money(row.monto)}</td>
                      <td data-label="Estado">{row.estado}</td>
                      <td>
                        <button
                          onClick={() =>
                            openDecision(
                              board.preReservas.find((draft) => draft.id === row.borradorId) ?? null
                            )
                          }
                          type="button"
                        >
                          Gestionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {tab === 'history' && (
            <section className="reservations-table">
              <h2>Actividad reciente</h2>
              {board.decisiones.map((row, i) => (
                <article className="reservation-history" key={row.id ?? i}>
                  <strong>{row.accion}</strong> · pre-reserva #{row.borradorId ?? '—'}
                  <br />
                  <small>
                    {row.autor ?? 'Sistema'} · {date(row.creadaEn)}{' '}
                    {row.nota ? `· ${row.nota}` : ''}
                  </small>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {selected && (
        <DecisionModal
          draft={selected}
          receipt={board?.comprobantes.find((item) => item.borradorId === selected.id) ?? null}
          note={note}
          saving={saving}
          onClose={() => openDecision(null)}
          onNote={setNote}
          onDecide={decide}
        />
      )}
    </section>
  );
}
function Table({
  rows,
  onManage
}: {
  rows: Draft[];
  onManage: (row: Draft) => void;
}): React.ReactNode {
  return (
    <section className="reservations-table">
      <h2>Pre-reservas por gestionar</h2>
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Servicio</th>
            <th>Cita</th>
            <th>Valor</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? row.nombre}>
              {/* `data-label` repite el encabezado en cada celda: en el telefono la tabla se convierte
                  en tarjetas y cada dato necesita decir de que columna viene. */}
              <td data-label="Cliente">{row.nombre ?? 'Sin nombre'}</td>
              <td data-label="Servicio">{row.servicio ?? '—'}</td>
              <td data-label="Cita">{date(row.horarioProgramado)}</td>
              <td data-label="Valor">{money(row.monto)}</td>
              <td data-label="Estado">
                <span className={`reservation-status ${row.estadoMostrado}`}>
                  {label[row.estadoMostrado] ?? row.estado}
                </span>
              </td>
              <td>
                <button onClick={() => onManage(row)} type="button">
                  Gestionar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function DecisionModal({
  draft,
  receipt,
  note,
  saving,
  onClose,
  onNote,
  onDecide
}: {
  draft: Draft;
  receipt: Receipt | null;
  note: string;
  saving: boolean;
  onClose: () => void;
  onNote: (value: string) => void;
  onDecide: (action: 'approved' | 'rejected' | 'needs_info') => void;
}): React.ReactNode {
  return (
    <div className="reservations-modal" role="dialog" aria-modal="true">
      <div>
        <button className="modal-close" onClick={onClose} type="button">
          ×
        </button>
        <h2>{draft.nombre ?? 'Pre-reserva'}</h2>
        <p>
          {draft.servicio ?? 'Servicio no indicado'} · {money(draft.monto)}
        </p>
        {receipt?.mediaUrl && (
          <a href={receipt.mediaUrl} target="_blank" rel="noreferrer">
            Abrir comprobante
          </a>
        )}
        <label>
          Nota para el historial
          <textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            maxLength={1000}
          />
        </label>
        <div className="reservation-actions">
          <button disabled={saving} onClick={() => onDecide('approved')} type="button">
            Aprobar
          </button>
          <button disabled={saving} onClick={() => onDecide('needs_info')} type="button">
            Pedir información
          </button>
          <button disabled={saving} onClick={() => onDecide('rejected')} type="button">
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}
