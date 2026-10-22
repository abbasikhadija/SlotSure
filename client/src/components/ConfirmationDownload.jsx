import { useEffect, useRef, useState } from 'react';

export function ConfirmationDownload({ bookingId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function download() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/bookings/${bookingId}/confirmation.pdf`,
        { credentials: 'same-origin', signal: controller.signal },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.error?.message ?? 'Could not download the appointment record.',
        );
      }
      if (!response.headers.get('content-type')?.startsWith('application/pdf'))
        throw new Error('The server did not return a PDF. Please try again.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SlotSure-SS-${bookingId.padStart(6, '0')}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      // Let the browser start reading the blob before releasing its temporary URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="confirmation-download">
      <button
        type="button"
        className="text-button"
        onClick={download}
        disabled={busy}
        aria-label={`Download PDF for booking SS-${bookingId.padStart(6, '0')}`}
      >
        {busy ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
