/**
 * The home page's map: the static world drawn at build (/home-map.svg), and over it, in the same
 * 360 × 180 frame, the track behind (dim), the track ahead (green) and the station.
 */
import { latToY, lonToX, splitAtAntimeridian } from '../scene/map/projection.ts'

const SIZE = { width: 360, height: 180 }

interface Point {
  latitude: number
  longitude: number
  date: Date
}

function path(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${lonToX(p.longitude, SIZE).toFixed(1)} ${latToY(p.latitude, SIZE).toFixed(1)}`)
    .join('')
}

export function HomeMap({
  track,
  position,
  label,
  now,
}: {
  track: Point[]
  position: { latitude: number; longitude: number } | null
  label: string
  now: number
}) {
  // The track is sampled on whole minutes; the station is where it is now. Without it as the end of
  // one run and the start of the other, up to four degrees either side of the dot went undrawn.
  const here = position ? [{ ...position, date: new Date(now) }] : []
  const past = splitAtAntimeridian([...track.filter((p) => p.date.getTime() < now), ...here])
  const ahead = splitAtAntimeridian([...here, ...track.filter((p) => p.date.getTime() > now)])
  return (
    <div className="home-map">
      <img className="home-map__world" src="/home-map.svg" alt="" width={720} height={360} />
      <svg className="home-map__overlay" viewBox="0 0 360 180" role="img" aria-label={label} preserveAspectRatio="none">
        {past.map((run, i) => (
          <path key={`p${i}`} className="home-map__past" d={path(run)} />
        ))}
        {ahead.map((run, i) => (
          <path key={`a${i}`} className="home-map__ahead" d={path(run)} />
        ))}
        {position && (
          <circle
            className="home-map__station"
            cx={lonToX(position.longitude, SIZE)}
            cy={latToY(position.latitude, SIZE)}
            r={3.2}
          />
        )}
      </svg>
    </div>
  )
}
