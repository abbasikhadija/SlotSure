import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { appointmentLabel } from '../lib/schedule.js';
import { ConfirmationDownload } from './ConfirmationDownload.jsx';

export function BookingDashboard({ consultant = false, revision, onChanged }) {
  const [view, setView] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submission = useRef(null);
  useEffect(() => () => submission.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setData(null);
      try {
        const endpoint = consultant
          ? '/api/provider/bookings'
          : '/api/bookings/my';
        const result = await api(`${endpoint}?view=${view}&page=${page}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setData(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [consultant, view, page, refresh, revision]);

  async function cancel(booking) {
    if (submission.current) return;
    const controller = new AbortController();
    submission.current = controller;
    setBusy(booking.id);
    setError('');
    setMessage('');
    try {
      await api(`/api/bookings/${booking.id}/cancel`, {
        method: 'PATCH',
        body: {},
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        setMessage(
          `${booking.reference} is canceled. It remains in your history.`,
        );
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error.status === undefined || error.status >= 500
            ? 'The cancellation outcome is uncertain. Refresh your bookings to check the current status.'
            : error.message,
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy('');
        setPage(1);
        setRefresh((value) => value + 1);
        onChanged();
      }
      submission.current = null;
    }
  }
  return (
    <section
      className="schedule-card"
      aria-labelledby="bookings-title"
      aria-busy={loading || Boolean(busy)}
    >
      <p className="eyebrow">YOUR APPOINTMENTS</p>
      <h2 id="bookings-title">
        {consultant ? 'Consultant appointments' : 'My bookings'}
      </h2>
      <p className="note">
        Appointments last 30 minutes. All times use{' '}
        {data?.timeZone ?? 'the consultant’s time zone'}. Only future confirmed
        appointments can be canceled.
      </p>
      <div className="booking-controls">
        {['upcoming', 'history'].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            disabled={Boolean(busy)}
            onClick={() => {
              setView(option);
              setPage(1);
              setError('');
              setMessage('');
            }}
          >
            {option === 'upcoming' ? 'Upcoming' : 'History'}
          </button>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={loading || Boolean(busy)}
          onClick={() => {
            setError('');
            setRefresh((value) => value + 1);
          }}
        >
          Refresh bookings
        </button>
      </div>
      {message && (
        <p role="status" className="feedback">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading bookings…</p>
      ) : (
        data && (
          <>
            {!data.bookings.length && (
              <p>
                No{' '}
                {view === 'upcoming'
                  ? 'upcoming appointments'
                  : 'booking history'}{' '}
                on this page.
              </p>
            )}
            <ul className="booking-list">
              {data.bookings.map((booking) => (
                <li key={booking.id}>
                  <h3>
                    {appointmentLabel(booking.startsAt, booking.timeZone)}
                  </h3>
                  <p>
                    {booking.reference} ·{' '}
                    {booking.status === 'confirmed' ? 'Confirmed' : 'Canceled'}{' '}
                    · {booking.durationMinutes} minutes
                  </p>
                  <p>
                    {consultant
                      ? `${booking.customer.name} · ${booking.customer.email}`
                      : booking.consultantName}
                  </p>
                  {booking.canceledAt && (
                    <p className="note">
                      Canceled{' '}
                      {appointmentLabel(booking.canceledAt, booking.timeZone)}
                    </p>
                  )}
                  {booking.canCancel && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => cancel(booking)}
                      aria-label={`Cancel booking ${booking.reference}`}
                    >
                      {busy === booking.id
                        ? 'Canceling…'
                        : 'Cancel appointment'}
                    </button>
                  )}
                  {!consultant && (
                    <ConfirmationDownload bookingId={booking.id} />
                  )}
                </li>
              ))}
            </ul>
            <div className="booking-controls">
              <button
                type="button"
                disabled={page === 1 || Boolean(busy)}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous page
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                disabled={!data.hasMore || page === 9999 || Boolean(busy)}
                onClick={() => setPage((value) => value + 1)}
              >
                Next page
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
