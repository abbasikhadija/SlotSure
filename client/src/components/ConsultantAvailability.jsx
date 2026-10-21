import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { appointmentLabel } from '../lib/schedule.js';
import { SlotPicker } from './SlotPicker.jsx';

const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const times = Array.from(
  { length: 49 },
  (_, index) =>
    `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
);
const draftHours = (hours) =>
  weekdays.map((_, index) => {
    const rule = hours.find((item) => item.weekday === index + 1);
    return {
      weekday: index + 1,
      enabled: Boolean(rule),
      startTime: rule?.startTime ?? '09:00',
      endTime: rule?.endTime ?? '17:00',
    };
  });

export function ConsultantAvailability() {
  const [hours, setHours] = useState(null);
  const [draft, setDraft] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [hours, blocks] = await Promise.all([
          api('/api/provider/hours', { signal: controller.signal }),
          api('/api/provider/blocks', { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setHours(hours);
          setDraft(draftHours(hours.hours));
          setBlocks(blocks.blocks);
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
  }, []);

  function change(index, key, value) {
    setDraft((rules) =>
      rules.map((rule, i) => (i === index ? { ...rule, [key]: value } : rule)),
    );
  }
  async function refreshBlocks() {
    try {
      const result = await api('/api/provider/blocks');
      setBlocks(result.blocks);
    } catch (error) {
      setError(error.message);
    }
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/api/provider/hours', {
        method: 'PUT',
        body: {
          hours: draft
            .filter((rule) => rule.enabled)
            .map(({ weekday, startTime, endTime }) => ({
              weekday,
              startTime,
              endTime,
            })),
        },
      });
      setHours(result);
      setDraft(draftHours(result.hours));
      setRevision((value) => value + 1);
      setMessage('Weekly hours saved. Existing reservations are unchanged.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function unblock(id) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/provider/blocks/${id}`, { method: 'DELETE', body: {} });
      await refreshBlocks();
      setRevision((value) => value + 1);
      setMessage('Appointment unblocked.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="provider-schedule">
      <section className="schedule-card" aria-labelledby="hours-title">
        <p className="eyebrow">YOUR REGULAR WEEK</p>
        <h2 id="hours-title">Weekly working hours</h2>
        {loading ? (
          <p role="status">Loading your schedule…</p>
        ) : (
          hours && (
            <>
              <p className="note">
                All times in {hours.timeZone}. One continuous interval per day.
                Uncheck a day to mark it unavailable.
              </p>
              <form onSubmit={save}>
                {draft.map((rule, index) => (
                  <fieldset
                    className="hours-row"
                    key={rule.weekday}
                    disabled={busy}
                  >
                    <legend>{weekdays[index]}</legend>
                    <label className="day-toggle">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) =>
                          change(index, 'enabled', event.target.checked)
                        }
                      />
                      Available
                    </label>
                    <label>
                      Start
                      <select
                        aria-label={`${weekdays[index]} start`}
                        value={rule.startTime}
                        disabled={!rule.enabled}
                        onChange={(event) =>
                          change(index, 'startTime', event.target.value)
                        }
                      >
                        {times.slice(0, -1).map((time) => (
                          <option key={time}>{time}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      End
                      <select
                        aria-label={`${weekdays[index]} end`}
                        value={rule.endTime}
                        disabled={!rule.enabled}
                        onChange={(event) =>
                          change(index, 'endTime', event.target.value)
                        }
                      >
                        {times.slice(1).map((time) => (
                          <option key={time}>{time}</option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                ))}
                <button type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : 'Save weekly hours'}
                </button>
              </form>
              {hours.outsideHoursCount > 0 && (
                <p className="feedback warning" role="status">
                  {hours.outsideHoursCount} existing future reservation(s) fall
                  outside these hours. They remain valid and have not been
                  changed.
                </p>
              )}
            </>
          )
        )}
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
      <SlotPicker key={revision} consultant onBlocked={refreshBlocks} />
      <section className="schedule-card" aria-labelledby="blocks-title">
        <h2 id="blocks-title">Blocked appointments</h2>
        <p className="note">
          Blocks within the current 14-day window, including blocks outside your
          latest weekly hours.
        </p>
        {loading ? (
          <p role="status">Loading blocks…</p>
        ) : blocks.length ? (
          <ul className="block-list">
            {blocks.map((block) => (
              <li key={block.id}>
                <span>{appointmentLabel(block.startsAt, hours.timeZone)}</span>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => unblock(block.id)}
                >
                  Unblock
                  <span className="sr-only">
                    {' '}
                    {appointmentLabel(block.startsAt, hours.timeZone)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">No blocked appointments in this window.</p>
        )}
      </section>
    </div>
  );
}
