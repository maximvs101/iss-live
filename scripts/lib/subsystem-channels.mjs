/**
 * The channels the application declares, read out of `subsystems.ts` as text.
 *
 * The module cannot be imported here: it reaches for `import.meta.env`, which does not exist
 * outside Vite. The declarations are regular enough to parse — but not with one pattern spanning
 * two lines of an entry, which is how this was first written and how it broke.
 *
 * `pui: '…',` followed by `label: '…'` with at most a newline between them matches every entry but
 * one. `TIME_000001` carries a comment on the line between the two, so it never matched — and
 * TIME_000001 is the station's clock, the timebase every age in every report is measured against.
 * Losing it failed nothing: ages came back null for the other 162 channels, printed as "age
 * unknown", and the stalled-sensor section of `verify:telemetry` reported **[ok] every continuous
 * measurement is less than a day old** over an empty list while the page counted thirteen stopped
 * sensors on the same stream. `verify:plottable` had the same pattern and marked every offered
 * channel `[FAIL] no timestamp` for the same reason.
 *
 * So: find each `pui`, then the first `label` before the next one — what the structure actually
 * promises — and do it in one place, because two scripts parsing the same file with two different
 * patterns is how one of them gets fixed and the other does not.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The station's own clock, in milliseconds into the year: the timebase for every age. */
export const CLOCK = 'TIME_000001'

/**
 * Every declared channel, deduplicated, in declaration order.
 *
 * Each entry carries the two flags a report has to agree with the application about: `holds` (the
 * timestamp dates a change, not a measurement) and `neverZero` (a zero is the broadcast dropping
 * out, not a reading). Split any other way and a report contradicts the page it describes.
 */
export function subsystemChannels() {
  const source = readFileSync(resolve(root, 'src/telemetry/subsystems.ts'), 'utf8')
  const matches = [...source.matchAll(/pui: '([A-Z0-9_]+)'/g)]
  const channels = matches.map((match, index) => {
    const from = match.index + match[0].length
    const until = index + 1 < matches.length ? matches[index + 1].index : source.length
    const slice = source.slice(from, until)
    const label = /label: '([^']*)'/.exec(slice)
    return {
      pui: match[1],
      label: label ? label[1] : match[1],
      holds: /holds: true/.test(slice),
      neverZero: /neverZero: true/.test(slice),
      hidden: /hidden: true/.test(slice),
    }
  })

  const unique = [...new Map(channels.map((channel) => [channel.pui, channel])).values()]

  // The clock is what makes every age computable; losing it is silent otherwise.
  if (!unique.some((channel) => channel.pui === CLOCK)) {
    throw new Error(`${CLOCK} is not among the declared channels — no age could be computed`)
  }
  return unique
}
