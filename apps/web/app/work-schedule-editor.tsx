'use client';
import { useEffect, useState } from 'react';
import type { WorkSchedule } from '@chat-zernio/contracts';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const time = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const minutes = (text: string) => {
  const [hour, minute] = text.split(':').map(Number);
  return hour * 60 + minute;
};

export default function WorkScheduleEditor({ userId, label }: { userId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<WorkSchedule | null>(null);
  const [shifts, setShifts] = useState<WorkSchedule['shifts']>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setReady(false);
    setError(null);
    void (async () => {
      try {
        const response = await fetch('/api/work-schedules', {
          cache: 'no-store',
          signal: controller.signal
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'No fue posible cargar el horario.');
        if (controller.signal.aborted) return;
        const item =
          (payload.items as WorkSchedule[]).find((item) => item.userId === userId) ?? null;
        setReady(true);
        setCurrent(item);
        setShifts(item?.shifts ?? []);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Error al cargar.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, userId, reload]);
  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/work-schedules/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedId: current?.id ?? null, shifts })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No fue posible guardar el horario.');
      setCurrent(payload.item);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="work-schedule">
      <button
        type="button"
        className="channel-rename-trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Horario
      </button>
      {open && (
        <div className="work-schedule-content">
          <h5>Horario de {label}</h5>
          <p>
            Hora de Ciudad de México. Los cambios cuentan desde que se guardan; no modifican días
            anteriores.
          </p>
          {loading ? (
            <p>Cargando horario…</p>
          ) : !ready ? (
            <button type="button" onClick={() => setReload(reload + 1)}>
              Reintentar carga
            </button>
          ) : (
            <>
              {!current && (
                <p>Sin horario configurado. Agrega los turnos antes de medir la cobertura.</p>
              )}
              {current && (
                <p>
                  Vigente desde{' '}
                  {new Intl.DateTimeFormat('es-MX', {
                    timeZone: 'America/Mexico_City',
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }).format(new Date(current.effectiveAt))}
                  .
                </p>
              )}
              <fieldset disabled={saving}>
                {DAYS.map((day, index) => (
                  <div className="work-schedule-day" key={day}>
                    <strong>{day}</strong>
                    {shifts.filter((shift) => shift.day === index).length === 0 && (
                      <span>Descanso</span>
                    )}
                    {shifts.map(
                      (shift, i) =>
                        shift.day === index && (
                          <div className="work-schedule-shift" key={i}>
                            <label>
                              Entrada
                              <input
                                aria-label={`Entrada ${day} ${i + 1}`}
                                type="time"
                                required
                                value={time(shift.start)}
                                onChange={(event) => {
                                  setSaved(false);
                                  setShifts(
                                    shifts.map((s, j) =>
                                      j === i ? { ...s, start: minutes(event.target.value) } : s
                                    )
                                  );
                                }}
                              />
                            </label>
                            <label>
                              Salida
                              <input
                                aria-label={`Salida ${day} ${i + 1}`}
                                type="time"
                                required
                                value={time(shift.end === 1440 ? 0 : shift.end)}
                                onChange={(event) => {
                                  setSaved(false);
                                  setShifts(
                                    shifts.map((s, j) =>
                                      j === i ? { ...s, end: minutes(event.target.value) } : s
                                    )
                                  );
                                }}
                              />
                            </label>
                            {shift.end <= shift.start && <small>Termina al día siguiente</small>}
                            <button
                              type="button"
                              aria-label={`Quitar turno ${day} ${i + 1}`}
                              onClick={() => {
                                setSaved(false);
                                setShifts(shifts.filter((_, j) => j !== i));
                              }}
                            >
                              Quitar
                            </button>
                          </div>
                        )
                    )}
                    <button
                      type="button"
                      disabled={shifts.length >= 28}
                      onClick={() => {
                        setSaved(false);
                        setShifts([...shifts, { day: index, start: 480, end: 1020 }]);
                      }}
                    >
                      Agregar turno
                    </button>
                  </div>
                ))}
              </fieldset>
              <div className="work-schedule-actions">
                <button type="button" disabled={saving || loading} onClick={() => void save()}>
                  {saving ? 'Guardando…' : 'Guardar horario'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSaved(false);
                    setReload(reload + 1);
                  }}
                >
                  Recargar
                </button>
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          {saved && <p role="status">Horario guardado.</p>}
        </div>
      )}
    </section>
  );
}
