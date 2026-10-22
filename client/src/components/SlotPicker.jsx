import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { slotLabel, appointmentLabel } from '../lib/schedule.js';
import { BookingConfirmation } from './BookingConfirmation.jsx';

export function SlotPicker({
  consultant = false,
  customer = false,
  onBlocked,
  onBooked,
}) {
  const [date, setDate] = useState('');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const submitting = useRef(false);
  const bookingRequest = useRef(null);
  useEffect(() => () => bookingRequest.current?.abort(), []);
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
          setLoadError('');
          setLoading(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error.message);
          setLoading(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [date, refresh]);

  function reload() {
    setConfirmation(null);
    setLoading(true);
    setSelected('');
    setError('');
    setLoadError('');
    setMessage('');
    setRefresh((value) => value + 1);
  }
  async function book() {
    if (!selected || submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    bookingRequest.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/api/bookings', {
        method: 'POST',
        body: { startsAt: selected },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setConfirmation(result.booking);
        setSelected('');
        onBooked?.();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setSelected('');
      setLoading(true);
      setRefresh((value) => value + 1);
      setError(
        error.status === undefined || error.status >= 500
          ? `We could not confirm the outcome for ${appointmentLabel(selected, data.timeZone)}. Your booking may have been saved. Check My bookings before trying again.`
          : error.status === 401
            ? 'Please sign in again before booking. Reload this page to refresh your account.'
            : `${error.message} Available times have been refreshed. Choose another appointment.`,
      );
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function block() {
    if (!selected || submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    bookingRequest.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/api/provider/blocks', {
        method: 'POST',
        body: { startsAt: selected },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setSelected('');
      setLoading(true);
      setRefresh((value) => value + 1);
      setMessage('Appointment blocked.');
      await onBlocked?.();
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(error.message);
      setSelected('');
      setLoading(true);
      setRefresh((value) => value + 1);
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  // Only show a selection while it remains in the current availability response.
  const hasData =
    data && !loading && !loadError && (!date || data.date === date);
  const current =
    hasData && data.slots.find((slot) => slot.startsAt === selected);
  if (confirmation)
    return (
      <BookingConfirmation booking={confirmation} onChooseAnother={reload} />
    );
  return (
    <section
      className="schedule-card"
      aria-busy={loading || busy}
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
              aria-describedby="date-help"
              onChange={(event) => {
                setDate(event.target.value);
                setLoading(true);
                setSelected('');
                setError('');
                setLoadError('');
                setMessage('');
              }}
            />
          </label>
          <p className="note" id="date-help">
            Choose a date, then a time below. Selection alone does not reserve
            an appointment.
          </p>
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
                    setError('');
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
          ) : customer ? (
            <button type="button" disabled={busy} onClick={book}>
              {busy ? 'Booking…' : 'Book consultation'}
            </button>
          ) : (
            <p className="note">
              <a href="#account">Sign in or create an account</a> to reserve
              this consultation.
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
          {customer && (
            <>
              {' '}
              <a href="#bookings">Check My bookings</a>
            </>
          )}
        </p>
      )}
      {loadError && (
        <p className="feedback error" role="alert">
          {loadError} Use Refresh available times to try again.
        </p>
      )}
    </section>
  );
}
