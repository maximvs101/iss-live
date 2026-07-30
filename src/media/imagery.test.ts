/**
 * Tests for the photograph lookup and its ranking.
 *
 * Two things are being pinned. The parsing is defensive because the catalogue is not uniform —
 * `photographer` is often absent, `description` sometimes is, and the `links` array carries
 * captions and metadata alongside the images; a photograph is an illustration beside real
 * telemetry and must never be the thing that throws. The ranking is a heuristic over somebody
 * else's index, so the examples below are taken verbatim from it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PHOTO_QUERY, findPhotos, photoScore } from './imagery'
import { PARTS } from '../scene/parts'

/** A response shaped like the one `images-api.nasa.gov` actually returns. */
function reply(items: unknown[]) {
  return { ok: true, json: async () => ({ collection: { items } }) } as Response
}

/**
 * A result shaped like the catalogue's.
 *
 * The default `nasa_id` is an ISS frame number, because every fixture has to pass the ISS filter
 * to reach the code under test — which is itself worth stating: the filter runs before anything
 * else, so a fixture that forgets it will silently test nothing.
 */
function item(title: string, extra: Record<string, unknown> = {}, links?: unknown[]) {
  return {
    data: [{ title, nasa_id: `iss001e${title.replace(/\W+/g, '')}`, ...extra }],
    links: links ?? [
      { href: 'https://example.test/caption.srt', rel: 'captions' },
      { href: `https://example.test/${encodeURIComponent(title)}.jpg`, rel: 'preview', render: 'image' },
    ],
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('PHOTO_QUERY', () => {
  it('names only parts that exist', () => {
    // A renamed part would otherwise leave a query that can never fire, and no photograph would
    // ever appear for it — silently.
    for (const part of Object.keys(PHOTO_QUERY)) expect(PARTS).toHaveProperty(part)
  })

  it('leaves out the parts the catalogue genuinely cannot find', () => {
    // The radiators were tried and dropped — `radiator` returns a picture titled "Radiation
    // Tomatoes" — and S5 is a short spacer segment with no photograph of its own, unlike every
    // other truss segment. Both are absences that were measured, not assumed.
    for (const part of ['radiator-port', 'radiator-stbd', 'truss-s5']) {
      expect(PHOTO_QUERY).not.toHaveProperty(part)
    }
  })

  it('offers a fallback phrase wherever the first one runs dry', () => {
    // Each of these was measured: "Tranquility module" finds 3 photographs against two dozen for
    // "Node 3", and "AMS-02" finds exactly 1 because the catalogue mostly writes it "AMS-2".
    for (const part of ['tranquility', 'beam', 'ams'] as const) {
      expect(Array.isArray(PHOTO_QUERY[part])).toBe(true)
    }
  })
})

describe('photoScore', () => {
  it('puts a picture of the module above a picture taken inside it', () => {
    // Both titles are real results for the same query. The first is the overview shot.
    expect(photoScore('Destiny laboratory', 'Destiny Laboratory')).toBeGreaterThan(
      photoScore('Destiny laboratory', 'Polansky in Destiny laboratory module'),
    )
    expect(photoScore('Cupola', 'Cupola Module')).toBeGreaterThan(
      photoScore('Cupola', 'Hire in the Cupola'),
    )
  })

  it('is not fooled by a short crew title', () => {
    // "Thomas floats through Zvezda" is four words and beat the ranking's first version, which
    // rewarded brevity without asking where the subject was named.
    expect(photoScore('Zvezda', 'Thomas floats through Zvezda')).toBeLessThan(
      photoScore('Zvezda', 'Zvezda Service Module'),
    )
  })

  it('rewards a title that names the subject first', () => {
    expect(photoScore('Quest airlock', 'Quest airlock')).toBeGreaterThan(
      photoScore('Quest airlock', 'ISS Assembly Sequence with the Quest airlock'),
    )
  })

  it('recognises an explicit view', () => {
    expect(photoScore('Unity node', 'View of the Unity node')).toBeGreaterThan(
      photoScore('Unity node', 'Wilson in Node 1 Unity'),
    )
  })

  it('scores a title that never names the subject lowest of all', () => {
    expect(photoScore('Kibo', 'Sunrise over the Pacific')).toBeLessThan(photoScore('Kibo', 'Kibo'))
  })
})

describe('the ISS filter', () => {
  it('drops the Moon', async () => {
    // The reported bug, in its exact form: a module name is not unique to the station, and
    // "Tranquility" is a place on the Moon before it is a Node 3.
    vi.stubGlobal('fetch', async () =>
      reply([
        item('jsc2008e040725 - Panorama view of Apollo 11 Lunar Module', {
          description: 'Panorama of the Apollo 11 landing site at Tranquility Base.',
          nasa_id: 'jsc2008e040725',
        }),
        item('NASA astronaut works inside the Tranquility module', {
          description: 'aboard the International Space Station',
          nasa_id: 'iss074e0000030',
        }),
      ]),
    )
    const titles = (await findPhotos('Tranquility module')).map((photo) => photo.title)
    expect(titles).toHaveLength(1)
    expect(titles[0]).toContain('Tranquility module')
  })

  it('keeps a photograph whose identifier is an ISS frame even with a bare caption', async () => {
    // "Flag in the Cupola" says nothing about the station; `iss061e027858` says all of it.
    vi.stubGlobal('fetch', async () =>
      reply([item('Flag in the Cupola', { description: '', nasa_id: 'iss061e027858' })]),
    )
    expect(await findPhotos('Cupola')).toHaveLength(1)
  })

  it('keeps the Shuttle assembly flights, hyphen or no hyphen', async () => {
    // A real STS-88 photograph of Zarya was thrown out by the first version of this filter,
    // because the catalogue writes the identifier `STS088-359-005` with no hyphen at all.
    vi.stubGlobal('fetch', async () =>
      reply([
        item('Newman and Krikalev in the FGB/Zarya module', {
          description: 'STS088-359-005 (4-15 Dec. 1998) --- Cosmonaut Sergei K. Krikalev',
          nasa_id: 'sts088-359-005',
        }),
        item('Wilson in Node 1 Unity', { description: '', nasa_id: 's131e008502' }),
      ]),
    )
    expect(await findPhotos('Zarya')).toHaveLength(2)
  })

  it('returns nothing rather than something irrelevant', async () => {
    vi.stubGlobal('fetch', async () =>
      reply([item('Sea of Tranquility', { description: 'Lunar surface.', nasa_id: 'as11-40-5874' })]),
    )
    expect(await findPhotos('Tranquility module')).toEqual([])
  })
})

describe('findPhotos', () => {
  it('searches titles, not free text', async () => {
    // The distinction that made these queries work: over full text, "Harmony" returned a
    // photograph titled *HTV-4*, because NASA captions name half the station apiece.
    const fetchMock = vi.fn(async (_url: string) => reply([item('Destiny Laboratory')]))
    vi.stubGlobal('fetch', fetchMock)

    await findPhotos('Destiny laboratory')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('title')).toBe('Destiny laboratory')
    expect(url.searchParams.get('q')).toBeNull()
    expect(url.searchParams.get('media_type')).toBe('image')
  })

  it('ranks the pool rather than trusting the catalogue’s order', async () => {
    vi.stubGlobal('fetch', async () =>
      reply([item('Polansky in Destiny laboratory module'), item('Destiny Laboratory')]),
    )
    const photos = await findPhotos('Destiny laboratory')
    expect(photos[0].title).toBe('Destiny Laboratory')
  })

  it('drops repeats of the same title', async () => {
    // The catalogue files the same frame several times; a gallery of one picture four times over
    // is worse than a gallery of one.
    vi.stubGlobal('fetch', async () =>
      reply([item('Cupola Module'), item('Cupola Module'), item('Gerst in Cupola')]),
    )
    const photos = await findPhotos('Cupola')
    expect(photos).toHaveLength(2)
  })

  it('returns no more than asked for', async () => {
    vi.stubGlobal('fetch', async () =>
      reply(Array.from({ length: 12 }, (_, i) => item(`Cupola view ${i}`))),
    )
    expect(await findPhotos('Cupola', 3)).toHaveLength(3)
  })

  it('prefers the preview image and ignores non-images', async () => {
    vi.stubGlobal('fetch', async () =>
      reply([
        item('Destiny Laboratory', {}, [
          { href: 'https://e.test/meta.json', rel: 'metadata' },
          { href: 'https://e.test/medium.jpg', rel: 'alternate', render: 'image' },
          { href: 'https://e.test/thumb.jpg', rel: 'preview', render: 'image' },
        ]),
      ]),
    )
    expect((await findPhotos('Destiny laboratory'))[0].src).toBe('https://e.test/thumb.jpg')
  })

  it('falls back to any renderable image when there is no preview', async () => {
    vi.stubGlobal('fetch', async () =>
      reply([item('X', {}, [{ href: 'https://e.test/only.jpg', rel: 'alternate', render: 'image' }])]),
    )
    expect((await findPhotos('X'))[0].src).toBe('https://e.test/only.jpg')
  })

  it('reads the caption, the credit and the year', async () => {
    vi.stubGlobal('fetch', async () =>
      reply([
        item('Destiny Laboratory', {
          description: 'A view of the Destiny US Laboratory aboard the ISS.',
          photographer: 'David Saint-Jacques',
          date_created: '2019-01-20T00:00:00Z',
          nasa_id: 'iss058e004610',
        }),
      ]),
    )
    const photo = (await findPhotos('Destiny laboratory'))[0]
    expect(photo.credit).toBe('David Saint-Jacques')
    expect(photo.date?.getUTCFullYear()).toBe(2019)
    expect(photo.page).toContain('iss058e004610')
  })

  it('survives the fields that are routinely missing', async () => {
    vi.stubGlobal('fetch', async () => reply([item('Untitled')]))
    const photo = (await findPhotos('x'))[0]
    expect(photo.credit).toBeNull()
    expect(photo.date).toBeNull()
    expect(photo.description).toBe('')
  })

  it('skips a result with no image at all', async () => {
    vi.stubGlobal('fetch', async () => reply([item('No image', {}, []), item('Has one')]))
    const photos = await findPhotos('x')
    expect(photos.map((photo) => photo.title)).toEqual(['Has one'])
  })

  it('only consults a second phrase when the first comes up short', async () => {
    // One request in the common case. The extra phrases are a fallback, not a broader net.
    const fetchMock = vi.fn(async (_url: string) =>
      reply(Array.from({ length: 6 }, (_, i) => item(`Cupola view ${i}`))),
    )
    vi.stubGlobal('fetch', fetchMock)

    await findPhotos(['Cupola', 'Node 3'], 5)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls through to the next phrase and keeps the first one in front', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('Tranquility')
        ? reply([item('Fincke works inside the Tranquility module')])
        : reply([item('Behnken in Node 3'), item('Hire in Node 3')]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const titles = (await findPhotos(['Tranquility module', 'Node 3'], 5)).map((p) => p.title)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The specific phrase's single result leads; the broader phrase fills in behind it.
    expect(titles[0]).toContain('Tranquility module')
    expect(titles).toHaveLength(3)
  })

  it('does not repeat a photograph found by both phrases', async () => {
    vi.stubGlobal('fetch', async () => reply([item('S0 truss and mobile transporter')]))
    expect(await findPhotos(['Mobile Transporter', 'S0 Truss'], 5)).toHaveLength(1)
  })

  it('carries the full-resolution original alongside the preview', async () => {
    // Two different answers: `page` is the catalogue entry, `original` is the frame itself. The
    // preview is 640 px and the canonical one 3072 — linking to the preview would be pointless.
    vi.stubGlobal('fetch', async () =>
      reply([
        item('Hire in the Cupola', {}, [
          { href: 'https://e.test/thumb.jpg', rel: 'preview', render: 'image', width: 640, height: 437 },
          { href: 'https://e.test/orig.jpg', rel: 'canonical', render: 'image', width: 3072, height: 2098 },
        ]),
      ]),
    )
    const photo = (await findPhotos('Cupola'))[0]
    expect(photo.src).toBe('https://e.test/thumb.jpg')
    expect(photo.original).toEqual({ href: 'https://e.test/orig.jpg', width: 3072, height: 2098 })
  })

  it('falls back to the widest image when nothing is marked canonical', async () => {
    vi.stubGlobal('fetch', async () =>
      reply([
        item('Cupola Module', {}, [
          { href: 'https://e.test/small.jpg', rel: 'preview', render: 'image', width: 640 },
          { href: 'https://e.test/large.jpg', rel: 'alternate', render: 'image', width: 1920 },
        ]),
      ]),
    )
    expect((await findPhotos('Cupola'))[0].original?.href).toBe('https://e.test/large.jpg')
  })

  it('reports no original rather than guessing one', async () => {
    vi.stubGlobal('fetch', async () => reply([item('Cupola Module', {}, [])]))
    expect(await findPhotos('Cupola')).toEqual([])
  })

  it('never throws when the network or the service fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    expect(await findPhotos('x')).toEqual([])

    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503 }) as Response)
    expect(await findPhotos('x')).toEqual([])
  })

  it('is not answering junk in place of a list', async () => {
    // An HTML error page served with a 200 is the classic quiet failure.
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ collection: {} }) }) as Response)
    expect(await findPhotos('x')).toEqual([])
  })
})
