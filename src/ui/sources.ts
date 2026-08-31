/**
 * Every place this application gets something from.
 *
 * Data rather than markup, in its own module: the dialog renders it, the unit tests assert on it,
 * and neither has to parse the other. An application that asserts a cabin pressure or an orbital
 * position owes an answer to "says who?", and this is that answer in one list.
 */

export interface Source {
  name: string
  href: string
  used: string
  /** How it is reached, and anything about that worth knowing. */
  note: string
}

/**
 * The attributes every outbound link carries.
 *
 * A named constant rather than four repeated attributes, so "do external links open safely" is a
 * property of one object a test can assert on, instead of a habit that has to hold in every place
 * an anchor is written.
 */
export const EXTERNAL_LINK = { target: '_blank', rel: 'noreferrer noopener' } as const

export const DATA: Source[] = [
  {
    // Not `isslive.com`, which is a parked domain, and not `isslive.nasa.gov`, which no longer
    // resolves. Lightstreamer's reference client is the entry point that still works, and it is
    // where `PUIList.xml` comes from.
    name: 'NASA ISS telemetry, via Lightstreamer',
    href: 'https://demos.lightstreamer.com/ISSLive/',
    used: '163 live telemetry parameters — power, life support, thermal, attitude, communications',
    note: 'Public broadcast, subscribed straight from the browser. No key, no backend.',
  },
  {
    name: 'Celestrak',
    href: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json',
    used: 'Orbital elements for NORAD object 25544, propagated here with SGP4',
    note: 'This is what keeps the map alive when the telemetry stream goes quiet.',
  },
  {
    name: 'NASA 3D Resources',
    href: 'https://github.com/nasa/NASA-3D-Resources',
    used: 'The station model — the IGOAL build, structured by module and by joint',
    note: 'Prepared once and served as a static file. The science.nasa.gov pages offer only FBX and 7z archives; the GitHub repository publishes usable GLB.',
  },
  {
    name: 'NASA Image and Video Library',
    href: 'https://images.nasa.gov/',
    used: 'A photograph of the module or instrument selected in the 3D view',
    note: 'Searched by title rather than free text — NASA captions name half the station apiece, so a full-text search for “Harmony” returned a photograph of a cargo vehicle.',
  },
  {
    name: 'Natural Earth, via world-atlas',
    href: 'https://www.naturalearthdata.com/',
    used: 'Coastlines, and the country outlines behind “now over…”',
    note: 'Bundled at 1:110,000,000, so the map needs no network to draw itself.',
  },
]

export const CODE: Source[] = [
  {
    name: 'satellite.js',
    href: 'https://github.com/shashwatak/satellite-js',
    used: 'SGP4 propagation, and the geometry of the Sun, Earth and station',
    note: 'The orbital position is computed in the browser, not fetched from a tracking service.',
  },
  {
    name: 'three.js and react-three-fiber',
    href: 'https://threejs.org/',
    used: 'The 3D station view',
    note: 'Loaded on demand: the map opens without any of it.',
  },
  {
    name: 'Lightstreamer Web Client',
    href: 'https://lightstreamer.com/',
    used: 'The telemetry subscription',
    note: 'NASA publishes the stream through Lightstreamer; this is its official client.',
  },
]
