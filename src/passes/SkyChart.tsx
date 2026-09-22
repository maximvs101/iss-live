/**
 * The pass drawn on the sky, and the same pass in a sentence.
 *
 * Seen lying on your back, head to the north: east on the left. The page says so under the chart,
 * because a reader used to maps will otherwise hold it the wrong way round. The visible stretch is
 * solid green; the rest of the pass, which exists but will not be seen, is dashed grey.
 */
import type { Pass, SkyPoint } from './findPasses.ts'
import { describePass } from './describe.ts'
import { project } from './sky.ts'
import { formatTime } from './time.ts'

const R = 100

function runs(track: SkyPoint[]): { visible: boolean; points: SkyPoint[] }[] {
  const out: { visible: boolean; points: SkyPoint[] }[] = []
  for (const point of track) {
    const last = out[out.length - 1]
    if (last && last.visible === point.visible) last.points.push(point)
    else out.push({ visible: point.visible, points: last ? [last.points[last.points.length - 1], point] : [point] })
  }
  return out
}

function path(points: SkyPoint[]): string {
  return points
    .map((p, i) => {
      const { x, y } = project(p.azimuth, p.elevation)
      return `${i === 0 ? 'M' : 'L'} ${(x * R).toFixed(1)} ${(y * R).toFixed(1)}`
    })
    .join(' ')
}

function Trajectory({ pass, width }: { pass: Pass; width: number }) {
  return (
    <>
      {runs(pass.track).map((run, i) => (
        <path
          key={i}
          d={path(run.points)}
          className={run.visible ? 'sky__seen' : 'sky__unseen'}
          strokeWidth={width}
          fill="none"
        />
      ))}
    </>
  )
}

export function MiniChart({ pass }: { pass: Pass }) {
  return (
    <svg className="sky sky--mini" viewBox="-105 -105 210 210" aria-hidden="true">
      <circle r={R} className="sky__horizon" />
      <Trajectory pass={pass} width={9} />
    </svg>
  )
}

export function SkyChart({ id, pass, timeZone }: { id: string; pass: Pass; timeZone: string }) {
  const sentence = describePass(pass, timeZone)
  const v = pass.visible
  const mark = (point: SkyPoint, label: string, strong = false) => {
    const { x, y } = project(point.azimuth, point.elevation)
    return (
      <g key={label}>
        <circle cx={x * R} cy={y * R} r={strong ? 4 : 3} className={strong ? 'sky__peak' : 'sky__end'} />
        <text x={x * R + 6} y={y * R - 6} className="sky__time">
          {label}
        </text>
      </g>
    )
  }
  return (
    <figure id={id} className="sky-figure">
      <svg className="sky" viewBox="-125 -125 250 250" role="img" aria-label={`Sky chart. ${sentence}`}>
        <circle r={R} className="sky__horizon" />
        <circle r={(R * 2) / 3} className="sky__ring" />
        <circle r={R / 3} className="sky__ring" />
        <text x={3} y={-(R * 2) / 3 - 3} className="sky__scale">
          30°
        </text>
        <text x={3} y={-R / 3 - 3} className="sky__scale">
          60°
        </text>
        <text x={0} y={-106} className="sky__cardinal">
          N
        </text>
        <text x={0} y={116} className="sky__cardinal">
          S
        </text>
        <text x={-112} y={4} className="sky__cardinal">
          E
        </text>
        <text x={112} y={4} className="sky__cardinal">
          W
        </text>
        <Trajectory pass={pass} width={2} />
        {v && [
          mark(v.start, formatTime(v.start.date, timeZone)),
          mark(v.peak, `${formatTime(v.peak.date, timeZone)} · ${Math.round(v.peak.elevation)}°`, true),
          mark(v.end, formatTime(v.end.date, timeZone)),
        ]}
      </svg>
      <figcaption>
        <p>{sentence}</p>
        <p className="note">
          The sky as seen lying on your back with your head to the north, so east is on the left.
          {v && ` Brightness ≈ ${v.magnitude.toFixed(1).replace('-', '−')} magnitude, give or take one.`}
        </p>
      </figcaption>
    </figure>
  )
}
