'use client';
import { useEffect, useState } from 'react';
import type { ResponseDetailList } from '@chat-zernio/contracts';
import { formatOperationalDateTime } from '../lib/operational-time';

export default function ResponseWaitDetails({
  bucket,
  label,
  asOf,
  date,
  days,
  onClose,
  onOpenConversation
}: {
  bucket: 'under' | 'between' | 'over';
  label: string;
  asOf?: string;
  date: string | null;
  days: number;
  onClose: () => void;
  onOpenConversation: (id: string) => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ResponseDetailList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      bucket,
      ...(asOf ? { asOf } : {}),
      page: String(page),
      ...(date ? { date } : { days: String(days) })
    });
    void (async () => {
      try {
        const response = await fetch(`/api/metrics/responses?${query}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? 'No fue posible leer las conversaciones.');
        if (!controller.signal.aborted) setData(payload);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'No fue posible cargar.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [bucket, date, days, page, asOf]);
  const duration = (seconds: number) => `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return (
    <section className="response-wait-details" aria-label="Conversaciones por tiempo de espera">
      <div className="response-wait-heading">
        <h4>Conversaciones · {label}</h4>
        <button type="button" onClick={onClose}>
          Cerrar detalle
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Cargando conversaciones…</p>
      ) : (
        data && (
          <>
            <p>
              {data.total} conversaciones{data.truncated ? ' como mínimo · lectura limitada' : ''}.
              El rango corresponde a la primera respuesta humana registrada.
            </p>
            {data.items.length === 0 ? (
              <p>No hay conversaciones en este rango.</p>
            ) : (
              <ul>
                {data.items.map((item, index) => (
                  <li key={item.conversationId}>
                    <div>
                      <strong>
                        {item.contactName ??
                          `Conversación ${(page - 1) * data.pageSize + index + 1}`}
                      </strong>
                      <span>Cliente: {formatOperationalDateTime(item.inboundAt)}</span>
                      <span>Primera respuesta: {formatOperationalDateTime(item.respondedAt)}</span>
                    </div>
                    <div>
                      <strong>{duration(item.seconds)}</strong>
                      <span>
                        {item.basis === 'working'
                          ? 'Dentro de horario'
                          : 'Tiempo corrido · sin historial de horario'}
                      </span>
                      <span>Tiempo total: {duration(item.elapsedSeconds)}</span>
                    </div>
                    <button
                      type="button"
                      disabled={opening !== null}
                      onClick={() => {
                        setOpening(item.conversationId);
                        setError(null);
                        void onOpenConversation(item.conversationId)
                          .catch((e) =>
                            setError(e instanceof Error ? e.message : 'No fue posible abrir.')
                          )
                          .finally(() => setOpening(null));
                      }}
                    >
                      {opening === item.conversationId ? 'Abriendo…' : 'Abrir conversación'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="response-wait-pagination">
              <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                type="button"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
