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
export function formatValue(symbol: PuiSymbol, raw: string | null | undefined): FormattedValue {
  const unit = resolveUnit(symbol)
  if (raw === null || raw === undefined || raw === '') {
    return { text: null, unit, state: null }
  }

  if (symbol.pui === 'TIME_000001') return formatOnboardTime(raw)

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
 * Onboard GMT, published as milliseconds elapsed since the start of the year.
 *
 * Raw, it reads "18126959000 ms", which tells a reader nothing. Divided by the length of a day
 * it gives the day of the year and the time within it — checked against this machine's UTC
 * clock and agreeing to within six seconds.
 */
function formatOnboardTime(raw: string): FormattedValue {
  const milliseconds = Number.parseFloat(raw)
  if (Number.isNaN(milliseconds)) return { text: raw, unit: null, state: null }

  const days = milliseconds / 86_400_000
  const dayOfYear = Math.floor(days)
  const secondsIntoDay = (days - dayOfYear) * 86_400
  const hh = Math.floor(secondsIntoDay / 3600)
  const mm = Math.floor((secondsIntoDay % 3600) / 60)
  const ss = Math.floor(secondsIntoDay % 60)
  const pad = (n: number) => String(n).padStart(2, '0')

  return { text: `Day ${dayOfYear} · ${pad(hh)}:${pad(mm)}:${pad(ss)}`, unit: 'GMT', state: null }
}

function defaultPrecision(value: number): number {
  // Counts arrive as whole numbers and read badly with decimals: "4 gyroscopes online", not "4.00".
  if (Number.isInteger(value)) return 0
  const magnitude = Math.abs(value)
  if (magnitude >= 1000) return 0
  if (magnitude >= 10) return 1
  return 2
}
