export function slotLabel(instant, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  }).format(new Date(instant));
}

export function appointmentLabel(instant, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  }).format(new Date(instant));
}
