import PDFDocument from 'pdfkit';
import { DateTime } from 'luxon';
import { fileURLToPath } from 'node:url';
import { bookingId } from './booking-management.js';
import { SLOT_MINUTES } from './slots.js';
import { HttpError } from '../http-error.js';

const font = fileURLToPath(
  new URL('../../assets/fonts/DejaVuSans.ttf', import.meta.url),
);
// Names/email are plain text, never PDF markup or control characters.
const plainText = (value) => String(value).replace(/[\p{Cc}\p{Cf}]/gu, ' ');

export function renderConfirmation(row, timeZone) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      font,
      info: { Title: 'SlotSure appointment record', Author: 'SlotSure' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const reference = `SS-${row.id.padStart(6, '0')}`;
      const start = DateTime.fromJSDate(row.starts_at, {
        zone: timeZone,
      }).setLocale('en-GB');
      const formatInstant = (instant) =>
        DateTime.fromJSDate(instant, { zone: timeZone })
          .setLocale('en-GB')
          .toFormat('dd LLL yyyy, HH:mm ZZZZ');
      const canceled = row.status === 'canceled';
      const width = doc.page.width - 96;
      doc.fillColor('#123b36').fontSize(25).text('SlotSure');
      doc
        .fontSize(10)
        .fillColor('#576864')
        .text('Book your time. No clashes, no confusion.');
      doc
        .moveDown(1.5)
        .fontSize(21)
        .fillColor('#123b36')
        .text('Appointment record');
      doc
        .moveDown(0.5)
        .fontSize(12)
        .fillColor(canceled ? '#9a3029' : '#49641e')
        .text(`Status: ${canceled ? 'CANCELED' : 'CONFIRMED'}`);
      doc
        .moveDown(0.5)
        .fontSize(10)
        .fillColor('#576864')
        .text(
          canceled
            ? 'This appointment was canceled. This record does not reserve a time.'
            : 'This appointment was confirmed at the status check below.',
        );
      doc.moveDown(1);
      function field(label, value) {
        doc
          .fontSize(9)
          .fillColor('#576864')
          .text(label.toUpperCase(), { width });
        doc.fontSize(12).fillColor('#123b36').text(plainText(value), { width });
        doc.moveDown(0.65);
      }
      field('Booking reference', reference);
      field('Customer', row.customer_name);
      field('Customer email', row.customer_email);
      field('Consultant', row.consultant_name);
      field('Appointment date', start.toFormat('cccc, dd LLLL yyyy'));
      field(
        'Appointment time',
        `${start.toFormat('HH:mm ZZZZ')} - ${start.plus({ minutes: SLOT_MINUTES }).toFormat('HH:mm ZZZZ')}`,
      );
      field('Time zone / duration', `${timeZone} / ${SLOT_MINUTES} minutes`);
      if (canceled) field('Canceled at', formatInstant(row.canceled_at));
      doc
        .fontSize(9)
        .fillColor('#576864')
        .text(`Status checked: ${formatInstant(row.checked_at)}`, { width })
        .moveDown(0.4)
        .text(
          'This is a snapshot, not a live status guarantee. Check My bookings for the current status.',
          { width },
        );
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}

export function createConfirmationService({ pool, timeZone }) {
  return {
    async download(customerId, id) {
      bookingId(id);
      // One statement gives identity, ownership and status a consistent snapshot.
      const { rows } = await pool.query(
        `SELECT b.id,b.starts_at,b.status,b.canceled_at,
          customer.name AS customer_name,customer.email AS customer_email,
          provider.name AS consultant_name,statement_timestamp() AS checked_at
         FROM bookings b JOIN users customer ON customer.id=b.customer_id
         CROSS JOIN users provider
         WHERE b.id=$1 AND b.customer_id=$2 AND customer.role='customer'
           AND provider.role='consultant'`,
        [id, customerId],
      );
      if (!rows.length)
        throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      return {
        filename: `SlotSure-SS-${id.padStart(6, '0')}.pdf`,
        buffer: await renderConfirmation(rows[0], timeZone),
      };
    },
  };
}
