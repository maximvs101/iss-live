/**
 * Flat map view.
 *
 * Drawn as SVG rather than through the 3D renderer. A map has no camera to place, no depth to
 * sort and no lighting to model, and vector strokes stay crisp at any size — the charts elsewhere
 * in the application are built the same way. It also answers a question the globe cannot: where
 * the station is *relative to everywhere else*, with no half of the world hidden behind the near
 * side.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useElementWidth } from '../../ui/useElementWidth'
import { useOrbitStore } from '../../orbit/useOrbit'
import { landPolygons } from './coastlines'
import { MapAnnouncement } from './MapAnnouncement'
import { IssMarker, IssShape } from './IssMarker'
import {
  footprintPoints,
  latToY,
  lonToX,
  nightRegion,
  splitAtAntimeridian,
  trackHeading,
  trackTicks,
  type TrackTick,
  type MapSize,
} from './projection'

/** Map coordinates. The SVG scales to its container; these are just the aspect ratio. */
const SIZE: MapSize = { width: 720, height: 360 }

/** Parallels and meridians drawn, and now labelled. The equator carries no letter. */
const GRATICULE_LAT = [-60, -30, 0, 30, 60]
const GRATICULE_LON = [-120, -60, 0, 60, 120]

/**
 * Coastlines, projected once, as outlines and as fills.
 *
 * Filling is trivial here in a way it was not on the globe — SVG closes and fills a path itself,
 * where the 3D version needed the polygon triangulated.
 *
 * The awkward case is a ring that crosses the antimeridian, Eurasia above all. Cutting it into
 * runs leaves open shapes that fill into a slab across the map; skipping it leaves the largest
 * landmass on Earth as a bare outline. Instead the longitudes are unwrapped so the ring stays a
 * single closed shape running past ±180°, and it is drawn twice — once as-is and once shifted a
 * full turn — so whichever part falls outside the map is clipped and the other completes the
 * picture at the opposite edge.
 */
function useCoastPaths(): { outlines: string[]; fills: string[] } {
  return useMemo(() => {
    const outlines: string[] = []
    const fills: string[] = []

    const toPath = (run: { latitude: number; longitude: number }[], shiftDegrees = 0) =>
      run
        .map(
          (point, i) =>
            `${i === 0 ? 'M' : 'L'} ${lonToX(point.longitude + shiftDegrees, SIZE).toFixed(1)},${latToY(point.latitude, SIZE).toFixed(1)}`,
        )
        .join(' ')

    for (const ring of landPolygons()) {
      const points = ring.map(([longitude, latitude]) => ({ latitude, longitude }))
      for (const run of splitAtAntimeridian(points)) outlines.push(toPath(run))
      if (points.length <= 3) continue

      // Unwrap: run longitude continuously past ±180 rather than jumping.
      const unwrapped: typeof points = []
      let offset = 0
      for (let i = 0; i < points.length; i += 1) {
        if (i > 0) {
          const delta = points[i].longitude - points[i - 1].longitude
          if (delta > 180) offset -= 360
          else if (delta < -180) offset += 360
        }
        unwrapped.push({ latitude: points[i].latitude, longitude: points[i].longitude + offset })
      }

      const minLon = Math.min(...unwrapped.map((p) => p.longitude))
      const maxLon = Math.max(...unwrapped.map((p) => p.longitude))
      fills.push(`${toPath(unwrapped)} Z`)
      // Only worth a second copy when the shape actually leaves the map.
      if (maxLon > 180) fills.push(`${toPath(unwrapped, -360)} Z`)
      else if (minLon < -180) fills.push(`${toPath(unwrapped, 360)} Z`)
    }
    return { outlines, fills }
  }, [])
}

export function MapView() {
  const state = useOrbitStore((store) => store.state)
  const track = useOrbitStore((store) => store.track)
  const coastPaths = useCoastPaths()

  // The terminator moves; recomputing once a minute is far more often than the eye needs.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const night = useMemo(() => nightRegion(now, SIZE), [now])
  /**
   * The track, split four ways: past or ahead, and sunlit or eclipsed.
   *
   * The eclipse is the station's own, not the ground's, and the two do not coincide — which is
   * the point of drawing it. At 420 km the station stays in sunlight for about ten minutes after
   * the ground below it has gone dark, so the eclipsed stretch begins well inside the night side
   * of the map. That gap is exactly what makes the station visible from the ground at dusk.
   */
  const trackRuns = useMemo(() => {
    if (track.length < 2) return { past: [], future: [], pastShadow: [], futureShadow: [] }
    const nowMs = Date.now()
    const cut = track.findIndex((point) => point.date.getTime() >= nowMs)
    const index = cut === -1 ? track.length : cut
    const past = track.slice(0, index + 1)
    const future = track.slice(index)

    // Runs are cut wherever the lighting changes, so each one is entirely lit or entirely dark.
    const byLighting = (points: typeof track, eclipsed: boolean) => {
      const runs: (typeof track)[] = []
      let current: typeof track = []
      for (const point of points) {
        if (point.shadow >= 0.5 === eclipsed) current.push(point)
        else {
          if (current.length > 1) runs.push(current)
          current = []
        }
      }
      if (current.length > 1) runs.push(current)
      return runs.flatMap((run) => splitAtAntimeridian(run))
    }

    return {
      past: byLighting(past, false),
      pastShadow: byLighting(past, true),
      future: byLighting(future, false),
      futureShadow: byLighting(future, true),
    }
  }, [track])

  const footprint = useMemo(() => {
    if (!state) return []
    const points = footprintPoints(state.latitude, state.longitude, state.footprintKm)
    return splitAtAntimeridian(points)
  }, [state])

  /**
   * Where the station will be, every quarter hour.
   *
   * Recomputed with the track rather than every second: the ticks mark fixed points on the ground,
   * and a label that crept along the curve between refreshes would be worse than one that steps.
   */
  const ticks = useMemo(() => trackTicks(track, new Date()), [track])

  /**
   * Which way the station is pointing, taken from the two track samples that straddle now.
   *
   * The marker is a silhouette rather than a dot, so it has an orientation to get right — and the
   * right one is free: in LVLH the modules lie along the velocity vector, which on the map is the
   * ground track's own direction.
   */
  const heading = useMemo(() => {
    if (track.length < 2) return 0
    const cut = track.findIndex((point) => point.date.getTime() >= Date.now())
    const index = cut <= 0 ? 1 : cut
    return trackHeading(track[index - 1], track[index], SIZE)
  }, [track])

  const toPath = (run: { latitude: number; longitude: number }[]) =>
    run
      .map(
        (point, i) =>
          `${i === 0 ? 'M' : 'L'} ${lonToX(point.longitude, SIZE).toFixed(1)},${latToY(point.latitude, SIZE).toFixed(1)}`,
      )
      .join(' ')

  /*
   * How many viewBox units one CSS pixel is worth, so that the type can be sized in pixels.
   *
   * The drawing is 720 units wide and the layout gives it anything from 438 px on a 1280×720
   * laptop to 1472 px on a tall desktop, so an 8-unit label reached the reader at 4.9 px in the
   * first case and 16.4 px in the second. Neither is a size anyone chose. The charts solved this
   * by drawing at the width they occupy — the map cannot, because its viewBox *is* its projection
   * — so it does the other half of the same trick and counter-scales the type instead.
   *
   * The `- 2` is the SVG's own border, which `box-sizing` takes out of the drawing but not out of
   * the box; a fifth of a percent, and cheaper to write than to explain the discrepancy later.
   */
  const [frame, frameWidth] = useElementWidth<HTMLDivElement>()
  const unit = frameWidth > 2 ? SIZE.width / (frameWidth - 2) : 1

  return (
    <div className="map-view">
      {/* Carries the map's width so the SVG can be measured, and holds the scale for the type. */}
      <div className="map-view__frame" ref={frame} style={{ '--map-unit': unit } as CSSProperties}>
        <svg
          viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
          className="map-view__svg"
          role="img"
          aria-label="World map with the station's ground track and the day/night terminator"
        >
          {/*
            A console map, not a school atlas.

            The ocean was a saturated blue and the land a bright green, which read as geography
            first and as an instrument second — and against the darker chrome they now sit in,
            they glowed. Both are near-black here, the coastline is a hairline, and the only
            saturated colour left on the map is the track: green for where the station is going,
            slate for where it has been, which is the same green that means "current" everywhere
            else on the page.
          */}
          <rect width={SIZE.width} height={SIZE.height} fill="#0a1622" />

          {/* Graticule every 30 degrees. */}
          <g stroke="#1d3040" strokeWidth={0.4} opacity={0.9}>
            {GRATICULE_LAT.map((lat) => (
              <line key={lat} x1={0} x2={SIZE.width} y1={latToY(lat, SIZE)} y2={latToY(lat, SIZE)} />
            ))}
            {GRATICULE_LON.map((lon) => (
              <line key={lon} y1={0} y2={SIZE.height} x1={lonToX(lon, SIZE)} x2={lonToX(lon, SIZE)} />
            ))}
          </g>

          {/*
            The graticule, named.
          
            Unlabelled lines every 30° tell you the grid is regular and nothing else — you cannot read
            a longitude off them. Drawn under the geography so a label never sits on top of a
            coastline, and over the ocean fill so it stays legible where there is no land.
          */}
          <g className="map-graticule" aria-hidden="true">
            {GRATICULE_LAT.filter((lat) => lat !== 0).map((lat) => (
              <text key={lat} x={4} y={latToY(lat, SIZE) - 3}>
                {Math.abs(lat)}° {lat > 0 ? 'N' : 'S'}
              </text>
            ))}
            {GRATICULE_LON.map((lon) => (
              <text key={lon} x={lonToX(lon, SIZE) + 3} y={SIZE.height - 4}>
                {lon === 0 ? '0°' : `${Math.abs(lon)}° ${lon > 0 ? 'E' : 'W'}`}
              </text>
            ))}
          </g>

          <g fill="#111e28" fillOpacity={1} stroke="none">
            {coastPaths.fills.map((path, i) => (
              <path key={`fill-${i}`} d={path} />
            ))}
          </g>

          <g fill="none" stroke="#31536b" strokeWidth={0.7} strokeLinejoin="round">
            {coastPaths.outlines.map((path, i) => (
              <path key={`line-${i}`} d={path} />
            ))}
          </g>

          {/* Night, over the geography rather than under it: it has to dim the coastlines too,
              which is the whole point — on the globe, leaving them lit made the terminator
              invisible. */}
          <path d={night.path} fill="#01050a" opacity={0.5} />

          {/* Where the Sun is directly overhead — the centre of the lit hemisphere. */}
          <g>
            <title>
              {`Sun overhead — ${Math.abs(night.subsolar.latitude).toFixed(1)}° ${night.subsolar.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(night.subsolar.longitude).toFixed(1)}° ${night.subsolar.longitude >= 0 ? 'E' : 'W'}`}
            </title>
            <circle
              cx={lonToX(night.subsolar.longitude, SIZE)}
              cy={latToY(night.subsolar.latitude, SIZE)}
              r={4}
              fill="#4ade80"
              opacity={0.9}
            />
            <circle
              cx={lonToX(night.subsolar.longitude, SIZE)}
              cy={latToY(night.subsolar.latitude, SIZE)}
              r={9}
              fill="none"
              stroke="#4ade80"
              strokeWidth={0.6}
              opacity={0.4}
            />
          </g>

          {footprint.map((run, i) => (
            <path key={`fp-${i}`} d={toPath(run)} fill="#4ade80" fillOpacity={0.06} stroke="#4ade80" strokeWidth={0.6} opacity={0.5} />
          ))}

          <g fill="none" strokeLinecap="round">
            {trackRuns.past.map((run, i) => (
              <path key={`past-${i}`} d={toPath(run)} stroke="#4a5c70" strokeWidth={1} opacity={0.5} />
            ))}
            {trackRuns.pastShadow.map((run, i) => (
              <path key={`past-dark-${i}`} d={toPath(run)} stroke="#3a4a5c" strokeWidth={1} opacity={0.45} strokeDasharray="3 3" />
            ))}
            {trackRuns.future.map((run, i) => (
              <path key={`future-${i}`} d={toPath(run)} stroke="#4ade80" strokeWidth={1.2} opacity={0.9} />
            ))}
            {/* Dashed where the station itself is in the Earth's shadow — which starts later than
                the map's night, and is the difference the eye should catch. */}
            {trackRuns.futureShadow.map((run, i) => (
              <path key={`future-dark-${i}`} d={toPath(run)} stroke="#2f8f63" strokeWidth={1.2} opacity={0.85} strokeDasharray="3 3" />
            ))}
          </g>

          {/* Quarter-hour marks on the track ahead. Under the station marker so it stays on top. */}
          <g>
            {ticks.map((tick) => (
              <TrackTickMark key={tick.minutes} tick={tick} />
            ))}
          </g>

          {state && (
            <g>
              <title>
                {`Station — ${Math.abs(state.latitude).toFixed(2)}° ${state.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(state.longitude).toFixed(2)}° ${state.longitude >= 0 ? 'E' : 'W'}`}
              </title>
              <IssMarker
                x={lonToX(state.longitude, SIZE)}
                y={latToY(state.latitude, SIZE)}
                heading={heading}
              />
            </g>
          )}
        </svg>
      </div>

      {/* `role="img"` on the SVG collapses everything inside it, so the live data is announced
          here instead. See MapAnnouncement. */}
      <MapAnnouncement />

      <MapLegend subsolar={night.subsolar} />
    </div>
  )
}

/**
 * A quarter-hour mark on the track ahead.
 *
 * Labelled with **elapsed minutes, not a clock time**. A time printed on a map is ambiguous unless
 * the map also says which zone it is in — and this one is drawn in longitude, where every reader
 * has a different answer. "+30 min" needs no zone and no explanation. The exact moment is still on
 * the tooltip, where there is room to say which clock it belongs to.
 *
 * Only every half hour carries text: six labels along a curve that doubles back on itself collide
 * with each other and with the track, while the unlabelled dots keep the rhythm.
 */
function TrackTickMark({ tick }: { tick: TrackTick }) {
  const x = lonToX(tick.longitude, SIZE)
  const y = latToY(tick.latitude, SIZE)
  const labelled = tick.minutes % 30 === 0
  const local = tick.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <g>
      <title>{`In ${tick.minutes} minutes — ${local} in this browser's time zone`}</title>
      <circle cx={x} cy={y} r={2} fill="#4ade80" stroke="#01050a" strokeWidth={0.8} />
      {labelled && (
        <text
          x={x}
          y={y - 6}
          className="map-tick"
          // Flipped at the edges so a label never runs off the map.
          textAnchor={x < 40 ? 'start' : x > SIZE.width - 40 ? 'end' : 'middle'}
        >
          +{tick.minutes} min
        </text>
      )}
    </g>
  )
}

/**
 * What each mark on the map means.
 *
 * Added because the subsolar marker was genuinely unreadable without it — a yellow dot in the
 * middle of the ocean explains nothing on its own, and the map carries three different circles.
 */
function MapLegend({ subsolar }: { subsolar: { latitude: number; longitude: number } }) {
  const format = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(1)}° ${value >= 0 ? positive : negative}`

  return (
    <ul className="map-legend">
      <li>
        <span className="map-legend__swatch map-legend__swatch--sun" />
        Sun overhead — {format(subsolar.latitude, 'N', 'S')}, {format(subsolar.longitude, 'E', 'W')}
      </li>
      <li>
        {/* The real silhouette rather than a coloured square: the legend is only useful if what
            it shows is what the map draws. Turned across the row, which is also how the station
            appears whenever it is heading north or south. */}
        <svg className="map-legend__icon" viewBox="-10 -7 20 14" aria-hidden="true">
          <g transform="rotate(90)">
            <IssShape />
          </g>
        </svg>
        Station now — above the horizon from inside the circle
      </li>
      <li title="Where the station will be, marked every quarter hour and labelled every half hour">
        <span className="map-legend__swatch map-legend__swatch--future" />
        Ground track ahead, to +90 min
      </li>
      <li>
        <span className="map-legend__swatch map-legend__swatch--past" />
        Ground track behind
      </li>
      <li title="The station keeps seeing the Sun for about ten minutes after the ground below it has gone dark, so this begins well inside the night side">
        <span className="map-legend__swatch map-legend__swatch--eclipse" />
        Station in Earth’s shadow
      </li>
      <li>
        <span className="map-legend__swatch map-legend__swatch--night" />
        Night on the ground
      </li>
    </ul>
  )
}
