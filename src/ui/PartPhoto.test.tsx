// @vitest-environment jsdom
/**
 * The first rendering test in this project, and it exists because of a blind spot.
 *
 * `PartPhoto` only appears once a part has been selected in the 3D scene, so every check of it so
 * far stopped at the network: the search returns the right photographs, the URLs resolve, the
 * images decode. Whether the component then *draws* them — both links, the arrows, the counter,
 * the wrap at the ends — was never verified by anything but a pair of eyes.
 *
 * jsdom is opted into per file rather than globally: the other 209 tests are pure functions over
 * data and have no business paying for a DOM.
 */
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PartPhoto } from './PartPhoto'

/** Search results shaped like the catalogue's, with `n` distinct photographs. */
function reply(titles: string[]) {
  return {
    ok: true,
    json: async () => ({
      collection: {
        items: titles.map((title) => ({
          data: [{ title, nasa_id: `iss001e${title.replace(/\W+/g, '')}`, description: 'aboard the ISS' }],
          links: [
            { href: `https://e.test/${encodeURIComponent(title)}~thumb.jpg`, rel: 'preview', render: 'image' },
            {
              href: `https://e.test/${encodeURIComponent(title)}~orig.jpg`,
              rel: 'canonical',
              render: 'image',
              width: 4256,
              height: 2832,
            },
          ],
        })),
      },
    }),
  } as Response
}

/** Lets the pending `findPhotos` promise settle and React commit its state. */
const settle = () => act(async () => {})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PartPhoto', () => {
  it('draws nothing at all for a part with no curated search', async () => {
    // Truss S5 is deliberately absent from PHOTO_QUERY — no phrase finds it. The component must
    // render nothing rather than an empty frame announcing its own absence.
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<PartPhoto part="truss-s5" />)
    await settle()

    expect(container.innerHTML).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('draws nothing when the search comes back empty', async () => {
    vi.stubGlobal('fetch', async () => reply([]))
    const { container } = render(<PartPhoto part="cupola" />)
    await settle()
    expect(container.innerHTML).toBe('')
  })

  it('draws nothing when the search fails', async () => {
    // A photograph is an illustration beside real telemetry; a failure here must be silent.
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    const { container } = render(<PartPhoto part="cupola" />)
    await settle()
    expect(container.innerHTML).toBe('')
  })

  it('shows the photograph, captioned and credited', async () => {
    vi.stubGlobal('fetch', async () => reply(['Cupola Module']))
    render(<PartPhoto part="cupola" />)
    await settle()

    const image = screen.getByRole('img')
    // The alt text is the caption, not "photograph of the Cupola": a screen reader should hear
    // what NASA says the picture is.
    expect(image.getAttribute('alt')).toBe('Cupola Module')
    expect(image.getAttribute('src')).toContain('~thumb.jpg')
    expect(image.getAttribute('loading')).toBe('lazy')
  })

  it('offers both NASA links, and says what the original costs', async () => {
    vi.stubGlobal('fetch', async () => reply(['Cupola Module']))
    render(<PartPhoto part="cupola" />)
    await settle()

    const entry = screen.getByRole('link', { name: 'Cupola Module' })
    expect(entry.getAttribute('href')).toContain('images.nasa.gov/details/')

    // Dimensions in the link text, so nobody opens four megapixels blind.
    const original = screen.getByRole('link', { name: /original/ })
    expect(original.textContent).toBe('original 4256×2832')
    expect(original.getAttribute('href')).toContain('~orig.jpg')

    for (const link of [entry, original]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  })

  it('leaves the dimensions off when the catalogue does not publish them', async () => {
    // A real case: some entries carry a canonical image with no width or height at all.
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        collection: {
          items: [
            {
              data: [{ title: 'Hopkins in Cupola', nasa_id: 'iss037e011232', description: 'ISS' }],
              links: [
                { href: 'https://e.test/a~thumb.jpg', rel: 'preview', render: 'image' },
                { href: 'https://e.test/a~orig.jpg', rel: 'canonical', render: 'image' },
              ],
            },
          ],
        },
      }),
    }))
    render(<PartPhoto part="cupola" />)
    await settle()
    expect(screen.getByRole('link', { name: /original/ }).textContent).toBe('original')
  })

  it('hides the arrows when there is only one photograph', async () => {
    vi.stubGlobal('fetch', async () => reply(['Cupola Module']))
    render(<PartPhoto part="cupola" />)
    await settle()

    expect(screen.queryByLabelText('Next photograph')).toBeNull()
    expect(screen.queryByText('1 / 1')).toBeNull()
  })

  it('steps through the gallery and wraps at both ends', async () => {
    const titles = ['Cupola Module', 'Gerst in Cupola', 'Hopkins in Cupola']
    vi.stubGlobal('fetch', async () => reply(titles))
    render(<PartPhoto part="cupola" />)
    await settle()

    const shown = () => screen.getByRole('img').getAttribute('alt')
    const counter = () => screen.getByText(/\d+ \/ \d+/).textContent

    expect(counter()).toBe('1 / 3')
    expect(shown()).toBe('Cupola Module')

    fireEvent.click(screen.getByLabelText('Next photograph'))
    expect(shown()).toBe('Gerst in Cupola')
    expect(counter()).toBe('2 / 3')

    // Backwards past the first: with no scrollbar to show position, a dead arrow reads as broken.
    fireEvent.click(screen.getByLabelText('Previous photograph'))
    fireEvent.click(screen.getByLabelText('Previous photograph'))
    expect(shown()).toBe('Hopkins in Cupola')
    expect(counter()).toBe('3 / 3')

    fireEvent.click(screen.getByLabelText('Next photograph'))
    expect(shown()).toBe('Cupola Module')
  })

  it('starts again from the first photograph when the part changes', async () => {
    vi.stubGlobal('fetch', async () => reply(['Cupola Module', 'Gerst in Cupola']))
    const { rerender } = render(<PartPhoto part="cupola" />)
    await settle()

    fireEvent.click(screen.getByLabelText('Next photograph'))
    expect(screen.getByText(/\d+ \/ \d+/).textContent).toBe('2 / 2')

    // Carrying index 2 into a new part would caption the wrong module, or show nothing at all if
    // the new one has fewer photographs.
    vi.stubGlobal('fetch', async () => reply(['Destiny Laboratory']))
    rerender(<PartPhoto part="destiny" />)
    await settle()

    expect(screen.getByRole('img').getAttribute('alt')).toBe('Destiny Laboratory')
  })
})
