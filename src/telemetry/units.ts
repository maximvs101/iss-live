/**
 * Units and formatting of telemetry values.
 *
 * The PUIList.xml catalogue dates from 2011 and its UNITS field is frequently wrong: "CNT" (raw
 * counts) for degrees Celsius, "DEGF" for values already in Celsius, "FT-LB" for N·m, "RAD" for
 * degrees. Where the description spells the unit out in brackets — "CMG Control Torque - Roll
 * (N-m)" — that is what counts.
 *
 * Numbers are never converted: NASA already publishes calibrated values. Only the displayed unit
 * label is corrected, and every correction carries its level of certainty.
 */
import type { PuiSymbol } from '../data/catalog'

export interface UnitOverride {
  /** Label shown to the user. */
  unit: string
  /**
   * `description` — the unit is spelled out in the catalogue description.
   * `measured`    — confirmed against live values from the stream on 28/07/2026.
   * `inferred`    — deduced from magnitudes and operational usage, not yet seen confirmed.
   */
  confidence: 'description' | 'measured' | 'inferred'
  note?: string
}

const DEG_C: UnitOverride = { unit: '°C', confidence: 'description' }
const PERCENT_MEASURED: UnitOverride = {
  unit: '%',
  confidence: 'measured',
  note: 'Fluid quantity published as a percentage of tank capacity.',
}
const MMHG_MEASURED: UnitOverride = {
  unit: 'mmHg',
  confidence: 'measured',
  note: 'The catalogue says PSIA, but live values (~168 for ppO₂) are the mmHg used on the ETHOS console.',
}
const VOLT_MEASURED: UnitOverride = {
  unit: 'V',
  confidence: 'measured',
  note: 'The catalogue publishes raw counts; live values range from about 151 V to 161 V, consistent with the station’s primary bus.',
}
const AMP_MEASURED: UnitOverride = {
  unit: 'A',
  confidence: 'measured',
  note: 'Not published: the channel holds at exactly zero. The ISS Mimic telemetry guide marks the same reading "not working".',
}

export const UNIT_OVERRIDES: Record<string, UnitOverride> = {
  // --- Attitude (ADCO): the catalogue claims imperial units, the description does not ---
  USLAB000006: { unit: 'N·m', confidence: 'description' },
  USLAB000007: { unit: 'N·m', confidence: 'description' },
  USLAB000008: { unit: 'N·m', confidence: 'description' },
  USLAB000009: { unit: 'N·m·s', confidence: 'description' },
  USLAB000038: { unit: 'N·m·s', confidence: 'description' },
  USLAB000022: { unit: '°', confidence: 'description' },
  USLAB000023: { unit: '°', confidence: 'description' },
  USLAB000024: { unit: '°', confidence: 'description' },
  USLAB000025: { unit: '°/s', confidence: 'description' },
  USLAB000026: { unit: '°/s', confidence: 'description' },
  USLAB000027: { unit: '°/s', confidence: 'description' },
  USLAB000032: { unit: 'km', confidence: 'description' },
  USLAB000033: { unit: 'km', confidence: 'description' },
  USLAB000034: { unit: 'km', confidence: 'description' },
  USLAB000035: { unit: 'm/s', confidence: 'description' },
  USLAB000036: { unit: 'm/s', confidence: 'description' },
  USLAB000037: { unit: 'm/s', confidence: 'description' },
  USLAB000045: DEG_C,
  USLAB000046: DEG_C,
  USLAB000047: DEG_C,
  USLAB000048: DEG_C,
  USLAB000049: DEG_C,
  USLAB000050: DEG_C,
  USLAB000051: DEG_C,
  USLAB000052: DEG_C,

  // --- External cooling loops (SPARTAN) ---
  P1000001: { unit: 'kg/h', confidence: 'description' },
  S1000001: { unit: 'kg/h', confidence: 'description' },
  P1000002: { unit: 'kPa', confidence: 'description' },
  S1000002: { unit: 'kPa', confidence: 'description' },
  P1000003: DEG_C,
  S1000003: DEG_C,

  // --- Internal environment (ETHOS) ---
  USLAB000059: { unit: '°C', confidence: 'measured', note: 'Cabin temperature published in Celsius.' },
  USLAB000060: DEG_C,
  USLAB000061: DEG_C,
  NODE2000006: DEG_C,
  NODE2000007: DEG_C,
  NODE3000012: DEG_C,
  NODE3000013: DEG_C,
  USLAB000053: MMHG_MEASURED,
  USLAB000054: MMHG_MEASURED,
  USLAB000055: MMHG_MEASURED,
  NODE3000001: MMHG_MEASURED,
  NODE3000002: MMHG_MEASURED,
  NODE3000003: MMHG_MEASURED,
  USLAB000056: PERCENT_MEASURED,
  USLAB000057: PERCENT_MEASURED,
  NODE2000001: PERCENT_MEASURED,
  NODE2000002: PERCENT_MEASURED,
  NODE3000017: PERCENT_MEASURED,
  NODE3000019: PERCENT_MEASURED,

  // Cabin and airlock pressures. The catalogue says PSI, but the live values read 749 — and the
  // partial pressures of the same cabin sum to the same figure. These are millimetres of mercury.
  USLAB000058: {
    unit: 'mmHg',
    confidence: 'measured',
    note: 'The catalogue says PSI; the live value of 749 matches the sum of the cabin partial pressures, so it is mmHg.',
  },
  AIRLOCK000054: {
    unit: 'mmHg',
    confidence: 'measured',
    note: 'Same correction as the cabin pressure: the catalogue says PSI, the values are mmHg.',
  },
  AIRLOCK000049: {
    unit: 'mmHg',
    confidence: 'measured',
    note: 'Crewlock pressure, published in mmHg like the rest of the pressures.',
  },

  // --- Power channels (SPARTAN). The catalogue publishes raw counts for both. ---
  S4000001: VOLT_MEASURED,
  S4000004: VOLT_MEASURED,
  S6000004: VOLT_MEASURED,
  S6000001: VOLT_MEASURED,
  P4000001: VOLT_MEASURED,
  P4000004: VOLT_MEASURED,
  P6000004: VOLT_MEASURED,
  P6000001: VOLT_MEASURED,
  // The catalogue gives no unit for the cross-elevation axis, though it does for the elevation
  // axis of the same antenna (Z1000014, DEG). Both read as angles in the same range.
  Z1000015: {
    unit: '°',
    confidence: 'inferred',
    note: 'The catalogue leaves this one blank; the elevation axis of the same antenna is published in degrees.',
  },

  S4000002: AMP_MEASURED,
  S4000005: AMP_MEASURED,
  S6000005: AMP_MEASURED,
  S6000002: AMP_MEASURED,
  P4000002: AMP_MEASURED,
  P4000005: AMP_MEASURED,
  P6000005: AMP_MEASURED,
  P6000002: AMP_MEASURED,
}

/** Catalogue units that mean nothing to a reader: they are not displayed. */
const OPAQUE_UNITS = new Set(['CNT', 'ND', 'N/A', 'INTEGR'])

const UNIT_LABELS: Record<string, string> = {
  DEG: '°',
  DEGF: '°F',
  DEGC: '°C',
  PCT: '%',
  PSI: 'psi',
  PSIA: 'psi',
  KG: 'kg',
  'LBM/D': 'lb/day',
  'RAD/S': 'rad/s',
  RAD: 'rad',
  RPM: 'rpm',
  AMP: 'A',
  VOLT: 'V',
  G: 'g',
  M: 'm',
  'M/S': 'm/s',
  S: 's',
  MS: 'ms',
  YR: 'yr',
  FT: 'ft',
  'FT/S': 'ft/s',
}

/** Unit label to display, or null when the source publishes nothing usable. */
export function resolveUnit(symbol: PuiSymbol): string | null {
  const override = UNIT_OVERRIDES[symbol.pui]
  if (override) return override.unit
  if (!symbol.units || OPAQUE_UNITS.has(symbol.units)) return null
  return UNIT_LABELS[symbol.units] ?? symbol.units.toLowerCase()
}

export function unitNote(pui: string): string | undefined {
  return UNIT_OVERRIDES[pui]?.note
}

/** True when the displayed unit is our deduction, not something the source states. */
export function isUnitInferred(pui: string): boolean {
  return UNIT_OVERRIDES[pui]?.confidence === 'inferred'
}

export interface FormattedValue {
  /** Formatted value, or null when no data is available. */
  text: string | null
  unit: string | null
  /** Decoded state label (e.g. "STANDBY") when the symbol is enumerated. */
  state: string | null
}

/**
 * Formats a raw value received from the stream.
 * Missing data stays missing: never a placeholder zero.
 */
/**
 * @param year the station's own published year, for the one symbol that needs it. It is a
 * parameter rather than a lookup so this stays a function of its arguments: the clock names a day
 * of the year and nothing else, and the year it belongs to is a second reading, not a guess from
 * this machine's calendar.
 */
export function formatValue(
  symbol: PuiSymbol,
  raw: string | null | undefined,
  year?: number | null,
): FormattedValue {
  const unit = resolveUnit(symbol)
  if (raw === null || raw === undefined || raw === '') {
    return { text: null, unit, state: null }
  }

  if (symbol.pui === 'TIME_000001') return formatOnboardTime(raw, year ?? null)

  if (symbol.values) {
    // States arrive sometimes as "2" and sometimes as "2.00", depending on the sensor.
    const key = String(Number.parseFloat(raw))
    const state = symbol.values[key] ?? symbol.values[raw.trim()] ?? null
    if (state) return { text: state, unit: null, state }
  }

  const numeric = Number.parseFloat(raw)
  if (Number.isNaN(numeric)) {
    return { text: raw, unit, state: null }
  }

  const precision = symbol.precision ?? defaultPrecision(numeric)
  return { text: numeric.toFixed(precision), unit, state: null }
}

/**
 * Onboard GMT, published as milliseconds — but not from the start of the year.
 *
 * Raw, it reads "18126959000 ms", which tells a reader nothing. Divided by the length of a day
 * it gives the day of the year and the time within it, which is all this function does.
 *
 * The origin is 31 December 00:00 UTC of the *previous* year, the same convention the stream's
 * `TimeStamp` field uses where hour 24 is 1 January — see `onboardTimestampToDate`. That is why
 * a plain `floor` lands on the ordinal date rather than one short of it, and it is worth stating
 * because the obvious reading costs a day: measured on 31 August 2026, 21044500918 ms read as
 * elapsed since 1 January gives **1 September**, and read from 31 December gives 31 August,
 * 2.9 s behind this machine's clock, which is the broadcast lag.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatOnboardTime(raw: string, year: number | null): FormattedValue {
  const milliseconds = Number.parseFloat(raw)
  if (Number.isNaN(milliseconds)) return { text: raw, unit: null, state: null }

  const days = milliseconds / 86_400_000
  const dayOfYear = Math.floor(days)
  const secondsIntoDay = (days - dayOfYear) * 86_400
  const hh = Math.floor(secondsIntoDay / 3600)
  const mm = Math.floor((secondsIntoDay % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = `${pad(hh)}:${pad(mm)}`

  /*
   * No seconds, deliberately.
   *
   * This symbol arrives **twenty times a second** — measured over 40 s on the live stream — and it
   * is 2.9 s behind the wall clock by the time it gets here, so the seconds digit was a number
   * nobody could read, changing faster than the eye, and wrong by three anyway. That the stream is
   * alive is already said in the header, in the words a reader would use for it.
   */
  /*
   * No unit either, once the text carries a date.
   *
   * `GMT` sat after the value and again in the label, and the row is the widest in its tab: at a
   * 309 px track — three columns on a 1366 laptop — label, gap and value came to 359 and the date
   * wrapped onto a second line, which spent the row that removing the year had just saved.
   */
  if (year === null) return { text: `Day ${dayOfYear} · ${clock}`, unit: null, state: null }

  /*
   * The calendar date, from the year the station publishes beside the clock.
   *
   * Built by adding the raw value to the origin rather than by adding days to 1 January, which is
   * the same arithmetic the origin comment above describes and gets leap years right for nothing:
   * day 60 of 2028 comes out 29 February because the Date arithmetic knows that February had one.
   *
   * The year printed is the one the instant lands in rather than the one that was passed, so that
   * the date and the day of the year cannot disagree at the turn of a year.
   */
  const at = new Date(Date.UTC(year - 1, 11, 31) + milliseconds)
  const date = `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`

  return { text: `Day ${dayOfYear} · ${date} · ${clock}`, unit: null, state: null }
}

function defaultPrecision(value: number): number {
  // Counts arrive as whole numbers and read badly with decimals: "4 gyroscopes online", not "4.00".
  if (Number.isInteger(value)) return 0
  const magnitude = Math.abs(value)
  if (magnitude >= 1000) return 0
  if (magnitude >= 10) return 1
  return 2
}
