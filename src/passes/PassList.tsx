/**
 * Every pass in the window, the ones worth going outside for drawn and the rest in a line each.
 *
 * An invisible pass is not hidden: saying "Thursday 13:52 — daylight" is what tells a reader the
 * station did come over and why they will not see it, which no other pass list says.
 */
import { useState } from 'react'
import type { Pass } from './findPasses.ts'
import { brightnessOf } from './brightness.ts'
import { describePass, reasonText, summarise } from './describe.ts'
import { downloadIcs, passUid, toIcs } from './ics.ts'
import { placeId, placeLabel, placeTimeZone, type Place } from './place.ts'
import { MiniChart, SkyChart } from './SkyChart.tsx'
import { formatDay, formatTime } from './time.ts'

const SITE = 'https://iss-live.pages.dev'

export function PassList({ passes, place, now }: { passes: Pass[]; place: Place; now: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const tz = placeTimeZone(place)
  const today = new Date(now)
  const upcoming = passes.filter((p) => p.set.date.getTime() >= now)

  if (upcoming.length === 0) {
    return (
      <p className="passes__summary">The station does not come over {placeLabel(place)} in the next five days.</p>
    )
  }

  if (!upcoming.some((p) => p.visible)) {
    const count = (reason: Pass['reason']) => upcoming.filter((p) => p.reason === reason).length
    const parts = [
      count('daylight') && `${count('daylight')} in daylight`,
      count('shadow') && `${count('shadow')} in the Earth’s shadow`,
      count('low') && `${count('low')} too low`,
      count('brief') && `${count('brief')} seen for under a minute`,
    ].filter(Boolean)
    return (
      <p className="passes__summary">
        None of the next {upcoming.length} passes can be seen from {placeLabel(place)}: {parts.join(', ')}.
      </p>
    )
  }

  const addToCalendar = (pass: Pass) => {
    const v = pass.visible!
    const link = place.kind === 'city' ? `${SITE}/passes/?city=${place.city.slug}` : `${SITE}/passes/`
    const text = toIcs({
      start: v.start.date,
      end: v.end.date,
      title: `ISS pass — ${brightnessOf(v.magnitude)}`,
      location: placeLabel(place),
      description: `${describePass(pass, tz)}\nA reboost not yet published can move a pass by minutes: check again on the day.\n${link}`,
      uid: passUid(placeId(place), v.start.date),
    })
    downloadIcs(text, `iss-pass-${v.start.date.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.ics`)
  }

  return (
    <ol className="passes__list">
      {upcoming.map((pass) => {
        const id = pass.rise.date.toISOString()
        const v = pass.visible
        // Dated by the part that can be seen: a pass rising at 23:59 and seen from 00:00 belongs to
        // the next day, whose times it shows.
        const day = formatDay(v ? v.start.date : pass.rise.date, tz, today)
        if (!v) {
          return (
            <li key={id} className="pass pass--off">
              {day} · {formatTime(pass.rise.date, tz)} · {reasonText(pass)}
            </li>
          )
        }
        const word = brightnessOf(v.magnitude)
        const expanded = open === id
        const start = formatTime(v.start.date, tz)
        return (
          <li key={id} className="pass">
            <button
              type="button"
              className="pass__main"
              aria-expanded={expanded}
              aria-controls={`chart-${id}`}
              onClick={() => setOpen(expanded ? null : id)}
            >
              <MiniChart pass={pass} />
              <span className="pass__text">
                <span className="pass__when">
                  {day} · {start} → {formatTime(v.end.date, tz)}
                </span>
                <span className="pass__how">
                  <span
                    className={`pass__brightness pass__brightness--${word.replace(/ /g, '-')}`}
                    title={`≈ ${v.magnitude.toFixed(1)} magnitude, give or take one`}
                  >
                    {word}
                  </span>{' '}
                  · {summarise(pass)}
                </span>
                {v.startsLate && <span className="pass__note">appears out of the Earth’s shadow</span>}
                {v.endsInShadow && <span className="pass__note">ends in the Earth’s shadow</span>}
              </span>
            </button>
            <button
              type="button"
              className="pass__calendar"
              aria-label={`Add the ${day} ${start} pass to your calendar`}
              onClick={() => addToCalendar(pass)}
            >
              📅
            </button>
            {expanded && <SkyChart id={`chart-${id}`} pass={pass} timeZone={tz} />}
          </li>
        )
      })}
    </ol>
  )
}
