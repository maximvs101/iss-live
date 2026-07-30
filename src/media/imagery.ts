/**
 * Photographs of the station, from NASA's Image and Video Library.
 *
 * The 3D twin shows where a part is and the telemetry shows what it is doing; neither shows what
 * it looks like. `images-api.nasa.gov` closes that gap — no key, CORS open (verified 30/07/2026),
 * and the assets are served over HTTPS from `images-assets.nasa.gov`.
 *
 * **Queries are curated and checked, not derived.** Each is a title phrase picked by running it
 * against the live catalogue and reading what came back; `npm run verify:media` re-runs all of
 * them. A part with no entry shows no photograph, which is a better answer than a wrong one.
 */
import type { PartId } from '../scene/parts'

const SEARCH = 'https://images-api.nasa.gov/search'

/**
 * The title to search for, per part.
 *
 * Matched against **titles**, not free text. Searching everything looked fine and was not: NASA's
 * captions name half the station apiece, so "Harmony" over full text returned a photograph titled
 * *HTV-4*, and "Rassvet" returned some chemistry-education hardware. Restricting the match to the
 * title makes each of these land on its own subject.
 *
 * Deliberately incomplete. Pressurised modules and large external hardware are photographed
 * constantly and are named in titles; truss segments and rotary joints are not. The radiators were
 * tried and dropped — no phrase found them, and `radiator` returns a picture titled *Radiation
 * Tomatoes*. A plausible photograph of the wrong object is worse than no photograph.
 */
export const PHOTO_QUERY: Partial<Record<PartId, string | string[]>> = {
  // --- Pressurised modules ---
  destiny: 'Destiny laboratory',
  unity: 'Unity node',
  harmony: 'Harmony Node 2',
  // 'Tranquility module' finds only three photographs; 'Node 3' finds two dozen of the same room.
  tranquility: ['Tranquility module', 'Node 3'],
  cupola: 'Cupola',
  columbus: 'Columbus module',
  'kibo-pm': 'Kibo',
  'kibo-ef': 'Kibo Exposed Facility',
  'kibo-elm': 'Experiment Logistics Module',
  quest: 'Quest airlock',
  bishop: 'Bishop airlock',
  // Not bare 'Leonardo': that matched a photograph of a technician called Leonardo Barreda.
  leonardo: 'Leonardo module',
  beam: ['Bigelow Expandable', 'BEAM'],
  zarya: 'Zarya',
  zvezda: 'Zvezda',
  poisk: 'Poisk',
  rassvet: 'Rassvet',
  // Genuinely thin — two photographs, and no other phrase finds more. 'Multipurpose Laboratory
  // Module' looks like the answer and is not: it returns Node 2, which was also Italian-built.
  nauka: 'Nauka',
  prichal: 'Prichal',

  // --- Mating adapters, each with its own number ---
  'pma-1': 'PMA-1',
  'pma-2': 'PMA-2',
  'pma-3': 'PMA-3',

  // --- Truss, segment by segment. S5 is absent: it is a short spacer and has none. ---
  'truss-z1': 'Z1 Truss',
  'truss-s0': 'S0 Truss',
  'truss-s1': 'S1 Truss',
  'truss-s3': 'S3 Truss',
  'truss-s4': 'S4 Truss',
  'truss-s6': 'S6 Truss',
  'truss-p1': 'P1 Truss',
  'truss-p3': 'P3 Truss',
  'truss-p4': 'P4 Truss',
  'truss-p5': 'P5 Truss',
  'truss-p6': 'P6 Truss',

  // --- Power and external hardware ---
  // The eight wings are identical hardware and are not photographed by channel name, so they
  // share one query. Better the right kind of object than nothing.
  'saw-1a': 'solar array wing',
  'saw-1b': 'solar array wing',
  'saw-2a': 'solar array wing',
  'saw-2b': 'solar array wing',
  'saw-3a': 'solar array wing',
  'saw-3b': 'solar array wing',
  'saw-4a': 'solar array wing',
  'saw-4b': 'solar array wing',
  'sarj-port': 'Solar Alpha Rotary Joint',
  'sarj-stbd': 'Solar Alpha Rotary Joint',
  'mobile-transporter': 'Mobile Transporter',
  canadarm: 'Canadarm2 robotic arm',
  dextre: 'Dextre',
  // 'AMS-02' matches exactly one photograph; the catalogue mostly writes it 'AMS-2'.
  ams: ['AMS-2', 'AMS-02'],
}

export interface Photo {
  /** `nasa_id`, and the reason the gallery is not the same frame four times over. */
  id: string
  title: string
  /** NASA's own caption, often long; the panel trims it. */
  description: string
  credit: string | null
  date: Date | null
  /** A preview-sized JPEG on `images-assets.nasa.gov`. */
  src: string
  /** The catalogue page: caption, keywords, every size NASA holds. */
  page: string
  /**
   * The full-resolution frame as NASA scanned or downlinked it.
   *
   * Carried separately from `page` because they answer different questions — one is "tell me
   * about this photograph", the other is "give me the photograph". Its size is kept alongside so
   * the link can say what it costs before anyone clicks a 3 MB JPEG.
   */
  original: { href: string; width: number | null; height: number | null } | null
}

/**
 * Words that mark a crew snapshot rather than a picture of the hardware.
 *
 * Measured, not guessed. A title search for a module returns page after page of the Johnson Space
 * Center crew collection — *Wilson in Node 1 Unity*, *Krikalev in Zvezda*, *Hire in the Cupola*.
 * Fine photographs, and not what someone who has just clicked on a module wants to see first.
 */
const CREW = /\b(in|with|during|aboard|floats?|works?|poses?|holds?|uses?)\b/i

/** Words that mark a picture *of* the thing rather than one taken inside it. */
const SUBJECT = /\b(view|exterior|overview|installed|module)\b/i

/**
 * Does this photograph actually have anything to do with the ISS?
 *
 * It has to be asked, because module names are not unique to the station. *Tranquility* returned a
 * panorama of **Apollo 11 at Tranquility Base** — a perfectly good photograph of the Moon, filed
 * under a name this application means as a Node 3. *Unity*, *Harmony* and *Destiny* are ordinary
 * English words with the same problem waiting in them.
 *
 * Two signals, either sufficient, chosen by measuring them across all nineteen queries: the text
 * names the station or a mission that visited it, or the frame's own identifier is an ISS or
 * Shuttle number. Together they dropped 8 of 343 results — the Apollo panorama, six Kennedy
 * ground-processing shots, and one straggler.
 *
 * The hyphen in `sts-?` and the `sts\d` id are not decoration: a genuine STS-88 photograph of
 * Zarya was being thrown out, because the catalogue writes it `STS088-359-005` with no hyphen.
 */
const ISS_TEXT = /international space station|\biss\b|expedition\s*\d|\bsts[- ]?\d/i
const ISS_ID = /^(iss\d|sts\d|s\d{2,3}e\d)/i

export function looksLikeIss(title: string, description: string, id: string): boolean {
  return ISS_TEXT.test(`${title} ${description}`) || ISS_ID.test(id)
}

/**
 * How well a result answers "show me this module".
 *
 * The strongest signal turned out to be **where the subject is named**. A photograph of the
 * Destiny lab is titled *Destiny Laboratory*; one of an astronaut inside it is *Polansky in
 * Destiny laboratory module*. Subject first is the overview shot near enough every time, and a
 * title that buries the module behind a surname and a verb is a crew snapshot.
 *
 * Exported so it can be tested. This is a heuristic over somebody else's catalogue, and the only
 * honest way to hold it in place is with examples taken from that catalogue.
 */
export function photoScore(query: string, title: string, description = ''): number {
  const subject = query.toLowerCase().split(/\s+/)[0]
  const words = title.toLowerCase().split(/[\s/,.]+/).filter(Boolean)
  const position = words.findIndex((word) => word.includes(subject))

  let score = 0
  if (position === 0) score += 4
  else if (position === 1) score += 2
  else if (position > 1) score -= position
  if (SUBJECT.test(title)) score += 3
  if (CREW.test(title)) score -= 3
  if (words.length <= 3) score += 1
  if (/\bview\b/i.test(description.slice(0, 200))) score += 1
  return score
}

interface RawLink {
  href?: string
  rel?: string
  render?: string
  width?: number
  height?: number
}

interface RawItem {
  href?: string
  data?: {
    title?: string
    description?: string
    photographer?: string
    secondary_creator?: string
    date_created?: string
    nasa_id?: string
  }[]
  links?: RawLink[]
}

/**
 * The preview image for a search result.
 *
 * `rel: 'preview'` is the thumbnail the API guarantees; the `alternate` sizes are usually present
 * too but not always, so the preview is taken first and anything renderable second. Non-image
 * links (captions, metadata) are excluded — they are in the same array.
 */
function previewOf(links: RawLink[] | undefined): string | null {
  if (!links) return null
  const images = links.filter((link) => link.render === 'image' && link.href)
  const preview = images.find((link) => link.rel === 'preview') ?? images[0]
  return preview?.href ?? null
}

/**
 * The original frame, at whatever resolution NASA holds.
 *
 * `rel: 'canonical'` is the catalogue's own word for it — 3072 × 2098 where the preview is
 * 640 × 437. Falling back to the widest image is for the handful of entries that publish sizes
 * without naming one canonical.
 */
function originalOf(links: RawLink[] | undefined): Photo['original'] {
  if (!links) return null
  const images = links.filter((link) => link.render === 'image' && link.href)
  const widest = images.reduce<RawLink | null>(
    (best, link) => (!best || (link.width ?? 0) > (best.width ?? 0) ? link : best),
    null,
  )
  const canonical = images.find((link) => link.rel === 'canonical') ?? widest
  if (!canonical?.href) return null
  return { href: canonical.href, width: canonical.width ?? null, height: canonical.height ?? null }
}

function toPhoto(item: RawItem): Photo | null {
  const data = item.data?.[0]
  const src = previewOf(item.links)
  if (!data?.title || !src) return null

  const created = data.date_created ? new Date(data.date_created) : null
  return {
    id: data.nasa_id ?? src,
    title: data.title,
    description: data.description ?? '',
    credit: data.photographer ?? data.secondary_creator ?? null,
    date: created && !Number.isNaN(created.getTime()) ? created : null,
    src,
    original: originalOf(item.links),
    page: data.nasa_id
      ? `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`
      : 'https://images.nasa.gov/',
  }
}

/** How many results to rank over. Deep enough to reach past the crew collection. */
const POOL = 24

/** One search, filtered to the ISS, de-duplicated, and ranked against its own phrase. */
async function search(query: string, signal?: AbortSignal): Promise<Photo[]> {
  const url = `${SEARCH}?title=${encodeURIComponent(query)}&media_type=image&page_size=${POOL}`

  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return []

    const body = (await response.json()) as { collection?: { items?: RawItem[] } }
    const items = body.collection?.items
    if (!Array.isArray(items)) return []

    const photos: Photo[] = []
    // The catalogue holds genuine duplicates — the same frame filed several times under the same
    // title — and a gallery showing one picture four times is worse than showing one picture.
    const seen = new Set<string>()
    for (const item of items) {
      const photo = toPhoto(item)
      if (!photo) continue
      if (!looksLikeIss(photo.title, photo.description, photo.id)) continue
      const key = photo.title.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      photos.push(photo)
    }

    return photos.sort(
      (a, b) =>
        photoScore(query, b.title, b.description) - photoScore(query, a.title, a.description),
    )
  } catch {
    return []
  }
}

/**
 * Photographs for a part, best first.
 *
 * Several, not one, because ranking cannot conjure a photograph the catalogue does not hold. For
 * Destiny or the Cupola the top result is a clean overview; for Zvezda, Zarya and Unity every
 * result is a crew snapshot, because that is all NASA has filed under those titles. Offering a few
 * lets the reader find the useful one where the ranking has nothing to find.
 *
 * A part may name **more than one phrase**, and the extra ones are consulted only when the first
 * comes up short. That is what they are for: `Tranquility module` matches three photographs while
 * `Node 3` matches two dozen of the same room, and `AMS-02` matches exactly one while the
 * catalogue mostly writes it `AMS-2`. Running them in sequence rather than together keeps the
 * common case at one request and keeps the most specific phrase's results in front.
 *
 * Ranked **per phrase**, not across the merged list. Scoring a `Node 3` result against the words
 * "Tranquility module" would mark it down for never naming a subject it was never asked about.
 *
 * Never throws. A photograph is an illustration: if the search fails, the part's description and
 * its telemetry are still the point of the panel.
 */
export async function findPhotos(
  query: string | string[],
  limit = 5,
  signal?: AbortSignal,
): Promise<Photo[]> {
  const queries = Array.isArray(query) ? query : [query]
  const merged: Photo[] = []
  const seen = new Set<string>()

  for (const phrase of queries) {
    if (merged.length >= limit) break
    for (const photo of await search(phrase, signal)) {
      const key = photo.title.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(photo)
      if (merged.length >= limit) break
    }
  }

  return merged
}
