import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { slotLabel, appointmentLabel } from '../lib/schedule.js';

export function SlotPicker({ consultant = false, onBlocked }) {
  const [date, setDate] = useState('');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await api(
          `/api/availability${date ? `?date=${encodeURIComponent(date)}` : ''}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message);
          setLoading(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [date, refresh]);

  function reload() {
    setLoading(true);
    setSelected('');
    setError('');
    setMessage('');
    setRefresh((value) => value + 1);
  }
  async function block() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/api/provider/blocks', {
        method: 'POST',
        body: { startsAt: selected },
      });
      setSelected('');
      setLoading(true);
      setRefresh((value) => value + 1);
      setMessage('Appointment blocked.');
      onBlocked();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Only show a selection while it remains in the current availability response.
  const hasData = data && !loading && !error && (!date || data.date === date);
  const current =
    hasData && data.slots.find((slot) => slot.startsAt === selected);
  return (
    <section
      className="schedule-card"
      aria-labelledby={consultant ? 'block-picker-title' : 'slot-picker-title'}
    >
      <p className="eyebrow">
        {consultant ? 'PROTECT YOUR TIME' : 'FIND YOUR NEXT CONVERSATION'}
      </p>
      <h2 id={consultant ? 'block-picker-title' : 'slot-picker-title'}>
        {consultant ? 'Block an appointment' : 'Choose a consultation time'}
      </h2>
      {data && (
        <>
          <p className="note">
            30 minutes · All times in {data.timeZone}. Choose from{' '}
            {data.minDate} through {data.maxDate}.
          </p>
          <label>
            Consultation date
            <input
              type="date"
              value={date || data.date}
              min={data.minDate}
              max={data.maxDate}
              disabled={busy}
              onChange={(event) => {
                setDate(event.target.value);
                setLoading(true);
                setSelected('');
                setError('');
                setMessage('');
              }}
            />
          </label>
        </>
      )}
      {loading ? (
        <p role="status">Loading available times…</p>
      ) : (
        hasData && (
          <div
            className="slot-grid"
            role="group"
            aria-label="Available appointment times"
          >
            {data.slots.length ? (
              data.slots.map((slot) => (
                <button
                  type="button"
                  className="slot-button"
                  key={slot.startsAt}
                  aria-pressed={selected === slot.startsAt}
                  disabled={busy}
                  onClick={() => {
                    setSelected(slot.startsAt);
                    setMessage('');
                  }}
                >
                  {slotLabel(slot.startsAt, data.timeZone)}
                </button>
              ))
            ) : (
              <p className="note">
                No available times on this date. Try another day.
              </p>
            )}
          </div>
        )
      )}
      {!loading && current && (
        <div className="selection-note" role="status">
          <p>Selected: {appointmentLabel(current.startsAt, data.timeZone)}</p>
          {consultant ? (
            <button type="button" onClick={block} disabled={busy}>
              {busy ? 'Blocking…' : 'Block selected time'}
            </button>
          ) : (
            <p className="note">
              This time is selected, but no reservation has been made. Booking
              will be available soon.
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="text-button"
        onClick={reload}
        disabled={busy || loading}
      >
        Refresh available times
      </button>
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
