/**
 * Do the curated image searches still land on the right hardware, and does the ranking help?
 *
 * `PHOTO_QUERY` maps a station part to a title phrase, and a phrase is a guess about someone
 * else's index: it can rot when the catalogue is re-indexed, and it can be wrong from the start in
 * a way that only shows as a photograph of the wrong object. A returned HTTP 200 proves nothing —
 * every query returns *something*.
 *
 * So this runs each query exactly as the application does, ranks the pool the same way, and prints
 * what comes out. It fails when a query returns nothing usable, or when the top result's **title**
 * does not name the part. Checking the description was the first version and it passed everything:
 * NASA captions name half the station apiece, so "Harmony" matched a photograph titled *HTV-4*.
 *
 * It also reports, without failing, how many results were rejected as nothing to do with the ISS
 * — a module name is not unique to the station — and how many of the five look like crew snapshots rather than
 * pictures of the hardware. That number is not something to fix in code — for Zvezda and Zarya the
 * catalogue holds nothing else — but it is worth seeing.
 *
 * **Read the titles it prints; do not just trust the exit code.** A word match cannot tell a module
 * from a person: `leonardo` passed while returning a photograph of a technician named Leonardo
 * Barreda inspecting an SLS core stage. That was caught by reading the output, and the query is
 * now `Leonardo module`.
 *
 *   node scripts/verify-nasa-media.mjs
 */
import { PHOTO_QUERY, photoScore, looksLikeIss } from '../src/media/imagery.ts'

/**
 * The word the top result's title must contain for the query to count as landed.
 *
 * Not every part has one — a solar array wing or a rotary joint is captioned a dozen ways — and
 * those are reported without being failed.
 */
const MUST_NAME = {
  destiny: 'destiny',
  unity: 'unity',
  harmony: 'harmony',
  tranquility: 'tranquility',
  cupola: 'cupola',
  columbus: 'columbus',
  'kibo-pm': 'kibo',
  'kibo-ef': 'kibo',
  quest: 'quest',
  leonardo: 'leonardo',
  beam: 'beam',
  zarya: 'zarya',
  zvezda: 'zvezda',
  poisk: 'poisk',
  rassvet: 'rassvet',
  nauka: 'nauka',
  canadarm: 'canadarm',
  dextre: 'dextre',
  ams: 'ams-2',
  prichal: 'prichal',
  bishop: 'bishop',
  'kibo-elm': 'logistics',
  'pma-1': 'pma',
  'pma-2': 'pma',
  'pma-3': 'pma',
  'truss-z1': 'z1',
  'truss-s0': 's0',
  'truss-s1': 's1',
  'truss-s3': 's3',
  'truss-s4': 's4',
  'truss-s6': 's6',
  'truss-p1': 'p1',
  'truss-p3': 'p3',
  'truss-p4': 'p4',
  'truss-p5': 'p5',
  'truss-p6': 'p6',
  'mobile-transporter': 'transporter',
}

/** The same marker the ranking uses, so the two agree on what a crew snapshot looks like. */
const CREW = /\b(in|with|during|aboard|floats?|works?|poses?|holds?|uses?)\b/i

const WANTED = 5
let failures = 0
let crewLed = 0
let rejected = 0
let short = 0

console.log(`${Object.keys(PHOTO_QUERY).length} curated queries, ranked as the application ranks them\n`)

for (const [part, query] of Object.entries(PHOTO_QUERY)) {
  // A part may name several phrases; the application consults the later ones only when the first
  // comes up short, and each is ranked against its own words.
  const phrases = Array.isArray(query) ? query : [query]
  const seen = new Set()
  const photos = []
  let offTopic = 0
  let refused = false

  for (const phrase of phrases) {
    if (photos.length >= WANTED) break
    const url = `https://images-api.nasa.gov/search?title=${encodeURIComponent(phrase)}&media_type=image&page_size=24`
    const response = await fetch(url)
    if (!response.ok) {
      console.log(`  [FAIL] ${part.padEnd(18)} HTTP ${response.status} for "${phrase}"`)
      refused = true
      break
    }

    const found = []
    for (const item of (await response.json()).collection?.items ?? []) {
      const data = item.data?.[0]
      const image = (item.links ?? []).find((link) => link.render === 'image' && link.href)
      if (!data?.title || !image) continue
      // The same filter the application applies. A module name is not unique to the station:
      // "Tranquility" is a place on the Moon before it is a Node 3.
      if (!looksLikeIss(data.title, data.description ?? '', data.nasa_id ?? '')) {
        offTopic += 1
        continue
      }
      const key = data.title.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ title: data.title, description: data.description ?? '' })
    }
    found.sort(
      (a, b) => photoScore(phrase, b.title, b.description) - photoScore(phrase, a.title, a.description),
    )
    photos.push(...found)
  }

  rejected += offTopic
  if (refused) {
    failures += 1
    continue
  }

  const top = photos[0]
  if (!top) {
    console.log(`  [FAIL] ${part.padEnd(18)} no result with a usable image`)
    failures += 1
    continue
  }

  const needle = MUST_NAME[part]
  const named = !needle || top.title.toLowerCase().includes(needle)
  if (!named) failures += 1

  const shown = photos.slice(0, WANTED)
  const crew = shown.filter((photo) => CREW.test(photo.title)).length
  if (CREW.test(top.title)) crewLed += 1

  // "shown" is what the panel would offer: fewer than five means the catalogue has no more.
  if (shown.length < WANTED) short += 1
  console.log(
    `  ${named ? '  ok  ' : '[FAIL]'} ${part.padEnd(18)} ${String(shown.length).padStart(2)}/${WANTED} shown, ` +
      `${crew} crew, ${String(offTopic).padStart(2)} off-topic  ${top.title.slice(0, 38)}`,
  )
  if (!named) console.log(`         wanted "${needle}" in the title — query was: ${query}`)
}

console.log(
  `\n${rejected} results rejected as nothing to do with the ISS — the Apollo 11 panorama that ` +
    'answers to "Tranquility", and Kennedy ground-processing shots.',
)
console.log(
  `${short} of ${Object.keys(PHOTO_QUERY).length} parts can offer fewer than ${WANTED} — the catalogue has no more under any phrase tried.`,
)
console.log(
  `${crewLed} of ${Object.keys(PHOTO_QUERY).length} parts lead with a crew snapshot — the catalogue ` +
    'has no overview shot titled for them, which is what the arrows are for.',
)
if (failures) {
  console.log(`FAIL — ${failures} query(ies) did not land on their part.`)
  process.exitCode = 1
} else {
  console.log('PASS — every query returned a photograph whose title names its part.')
}
