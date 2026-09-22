/**
 * Times in the place being observed, which is not always the place doing the looking.
 *
 * Someone in Paris planning an evening in Tokyo needs Tokyo's clock. `Intl` carries the time-zone
 * database, clock changes included, so there is no table here to go stale.
 */
const timeFormats = new Map<string, Intl.DateTimeFormat>()
const dayFormats = new Map<string, Intl.DateTimeFormat>()
const dateKeys = new Map<string, Intl.DateTimeFormat>()

function cached(map: Map<string, Intl.DateTimeFormat>, zone: string, make: () => Intl.DateTimeFormat) {
  let format = map.get(zone)
  if (!format) map.set(zone, (format = make()))
  return format
}

export function formatTime(date: Date, timeZone: string): string {
  return cached(timeFormats, timeZone, () =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }),
  ).format(date)
}

/** yyyy-mm-dd in the zone: a calendar date to compare, not a string to show. */
function localDate(date: Date, timeZone: string): string {
  return cached(dateKeys, timeZone, () => new Intl.DateTimeFormat('en-CA', { timeZone })).format(date)
}

export function formatDay(date: Date, timeZone: string, now: Date): string {
  const day = localDate(date, timeZone)
  if (day === localDate(now, timeZone)) return 'Today'
  // Noon to noon is always one calendar day later, whatever the clock does overnight.
  const tomorrow = new Date(Date.parse(`${localDate(now, timeZone)}T12:00:00Z`) + 86_400_000)
  if (day === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow'
  return cached(dayFormats, timeZone, () =>
    new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone }),
  ).format(date)
}
