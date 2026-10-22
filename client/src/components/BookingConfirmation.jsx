import { slotLabel } from '../lib/schedule.js';
import { ConfirmationDownload } from './ConfirmationDownload.jsx';

export function BookingConfirmation({ booking, onChooseAnother }) {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: booking.timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(booking.startsAt));
  return (
    <section
      className="schedule-card confirmation-card"
      aria-labelledby="confirmation-title"
    >
      <p className="eyebrow">TIME WELL RESERVED</p>
      <h2
        id="confirmation-title"
        tabIndex={-1}
        ref={(element) => element?.focus()}
      >
        Your consultation is confirmed
      </h2>
      <p className="form-intro">
        Your time has been reserved. Keep your booking reference for your
        records.
      </p>
      <dl className="confirmation-details">
        <div>
          <dt>Consultant</dt>
          <dd>{booking.consultantName}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{date}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>
            {slotLabel(booking.startsAt, booking.timeZone)} –{' '}
            {slotLabel(booking.endsAt, booking.timeZone)}
          </dd>
        </div>
        <div>
          <dt>Time zone</dt>
          <dd>{booking.timeZone}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{booking.durationMinutes} minutes</dd>
        </div>
        <div>
          <dt>Booking reference</dt>
          <dd className="booking-reference">{booking.reference}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className="role-badge">
              {booking.status === 'confirmed' ? 'Confirmed' : booking.status}
            </span>
          </dd>
        </div>
      </dl>
      <ConfirmationDownload bookingId={booking.id} />
      <button type="button" className="text-button" onClick={onChooseAnother}>
        Choose another appointment
      </button>
    </section>
  );
}
