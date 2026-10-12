'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Reseñas de Google: el apartado donde una persona responde las que el bot no contesta solo.
 *
 * El bot contesta automáticamente las de cuatro y cinco estrellas. Las de una a tres llegan aquí,
 * porque una respuesta automática a una queja suena a plantilla y hace más daño que el silencio.
 *
 * Dos avisos que están en la pantalla a propósito:
 *   1. Google conserva **una sola** respuesta del propietario. Publicar otra reemplaza la anterior,
 *      incluida una escrita a mano en Google, así que no hay botón de "volver a responder": si la
 *      reseña ya tiene respuesta, no aparece en esta lista.
 *   2. El texto se publica tal cual, sin corregir. Por eso no hay envío al pulsar Enter: se escribe,
 *      se lee y se publica.
 */

type Review = {
  body: string | null;
  id: string;
  rating: number;
  repliedAt: string | null;
  reviewUpdatedAt: string;
  reviewerName: string | null;
  routedToHumanAt: string | null;
};

const stars = (rating: number): string => '★'.repeat(rating) + '☆'.repeat(5 - rating);

const fecha = (valor: string): string =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(valor)
  );

export default function GoogleReviewsPanel(): React.ReactNode {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [publicando, setPublicando] = useState<string | null>(null);
  const [publicadas, setPublicadas] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    try {
      const respuesta = await fetch('/api/reviews', { cache: 'no-store' });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        error?: string;
        items?: Review[];
      };
      if (!respuesta.ok) {
        setError(cuerpo.error ?? 'No fue posible cargar las reseñas.');
        setEstado('error');
        return;
      }
      setReviews(Array.isArray(cuerpo.items) ? cuerpo.items : []);
      setEstado('listo');
    } catch {
      setError('La API no está disponible.');
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const publicar = useCallback(
    async (review: Review) => {
      const texto = (borradores[review.id] ?? '').trim();
      if (!texto) {
        setError('Escribe la respuesta antes de publicarla.');
        return;
      }
      setPublicando(review.id);
      setError(null);
      try {
        const respuesta = await fetch(`/api/reviews/${review.id}/reply`, {
          body: JSON.stringify({ comment: texto }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        const cuerpo = (await respuesta.json().catch(() => ({}))) as {
          error?: string;
          repliedAt?: string;
        };
        if (!respuesta.ok) {
          setError(cuerpo.error ?? 'No fue posible publicar la respuesta.');
          return;
        }
        // La reseña sale de la lista porque ya está respondida: dejar que se pulse otra vez sería
        // ofrecer justo lo que Google no permite (una segunda respuesta).
        setPublicadas((previo) => ({
          ...previo,
          [review.id]: cuerpo.repliedAt ?? new Date().toISOString()
        }));
        setReviews((previo) => previo.filter((fila) => fila.id !== review.id));
      } catch {
        setError('La API no está disponible.');
      } finally {
        setPublicando(null);
      }
    },
    [borradores]
  );

  return (
    <section className="media-view" aria-label="Reseñas de Google">
      <header className="media-view-header">
        <div>
          <p className="eyebrow">REPUTACIÓN</p>
          <h1>Reseñas</h1>
          <p className="media-view-hint">
            Las de cuatro y cinco estrellas las contesta el bot. Aquí están las de una a tres, que
            responde una persona. Google guarda una sola respuesta por reseña: la que publiques es
            la que queda.
          </p>
        </div>
        <button className="ghost-button" onClick={() => void cargar()} type="button">
          Actualizar
        </button>
      </header>

      {error && <p className="form-error">{error}</p>}

      {estado === 'cargando' && <p className="empty-state">Cargando reseñas…</p>}

      {estado === 'listo' && reviews.length === 0 && (
        <p className="empty-state">
          No hay reseñas esperando respuesta. Las que el bot contesta solo no aparecen aquí.
        </p>
      )}

      {estado === 'listo' && reviews.length > 0 && (
        <ul className="review-list">
          {reviews.map((review) => (
            <li className="review-item" key={review.id}>
              <div className="review-head">
                <span aria-label={`${review.rating} de 5 estrellas`} className="review-stars">
                  {stars(review.rating)}
                </span>
                <strong>{review.reviewerName ?? 'Cliente sin nombre'}</strong>
                <span className="review-date">{fecha(review.reviewUpdatedAt)}</span>
              </div>
              <p className="review-body">
                {review.body?.trim() || 'Sin texto: solo dejó la puntuación.'}
              </p>
              <label className="review-field">
                <span>Tu respuesta</span>
                <textarea
                  onChange={(evento) =>
                    setBorradores((previo) => ({ ...previo, [review.id]: evento.target.value }))
                  }
                  placeholder="Gracias por contarnos…"
                  rows={3}
                  value={borradores[review.id] ?? ''}
                />
              </label>
              <div className="review-actions">
                <button
                  className="primary-button"
                  disabled={publicando === review.id}
                  onClick={() => void publicar(review)}
                  type="button"
                >
                  {publicando === review.id ? 'Publicando…' : 'Publicar respuesta'}
                </button>
                <span className="review-hint">
                  Se publica en Google tal como la escribas, sin corregir.
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {Object.keys(publicadas).length > 0 && (
        <p className="empty-state">
          {Object.keys(publicadas).length === 1
            ? 'Una reseña quedó respondida.'
            : `${Object.keys(publicadas).length} reseñas quedaron respondidas.`}
        </p>
      )}
    </section>
  );
}
