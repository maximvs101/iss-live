/**
 * NASA photographs of the selected part.
 *
 * The 3D model says where a thing is; a photograph says what it looks like. A single photograph
 * was the first version and it was not enough: for some modules the catalogue's best-titled result
 * is an overview shot, and for others — Zvezda, Zarya, Unity — every result is a crew snapshot
 * taken inside. Ranking puts the most representative one first (see `media/imagery.ts`); stepping
 * through a handful gets past it when the ranking had nothing better to offer.
 *
 * Only parts with a curated search show anything, and the component renders nothing at all when
 * there is no match, rather than a placeholder announcing its own absence.
 */
import { useEffect, useState } from 'react'
import { PHOTO_QUERY, findPhotos, type Photo } from '../media/imagery'
import type { PartId } from '../scene/parts'

/** Enough to escape a bad first pick, few enough that stepping through is not a chore. */
const COUNT = 5

export function PartPhoto({ part }: { part: PartId }) {
  const query = PHOTO_QUERY[part]
  const [photos, setPhotos] = useState<Photo[]>([])
  const [shown, setShown] = useState(0)

  useEffect(() => {
    setPhotos([])
    setShown(0)
    if (!query) return

    // Aborted on change, so clicking quickly through parts cannot land an earlier, slower response
    // on a later selection — the classic way a panel ends up captioned with the wrong module.
    const controller = new AbortController()
    findPhotos(query, COUNT, controller.signal).then((found) => {
      if (!controller.signal.aborted) setPhotos(found)
    })
    return () => controller.abort()
  }, [query])

  const photo = photos[shown]
  if (!photo) return null

  // Wraps rather than stopping at the ends: with five pictures and no scrollbar to show position,
  // a dead arrow reads as a broken one.
  const step = (by: number) => setShown((current) => (current + by + photos.length) % photos.length)

  return (
    <figure className="part-photo">
      <div className="part-photo__frame">
        {/* `key` on the image so React swaps the element rather than mutating `src` in place,
            which would leave the previous photograph on screen until the new one decoded. */}
        <img key={photo.src} src={photo.src} alt={photo.title} loading="lazy" />

        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="part-photo__arrow part-photo__arrow--back"
              onClick={() => step(-1)}
              aria-label="Previous photograph"
            >
              ‹
            </button>
            <button
              type="button"
              className="part-photo__arrow part-photo__arrow--next"
              onClick={() => step(1)}
              aria-label="Next photograph"
            >
              ›
            </button>
            <span className="part-photo__count">
              {shown + 1} / {photos.length}
            </span>
          </>
        )}
      </div>

      {/*
        Two links, because they answer different questions: the title goes to NASA's catalogue
        entry — caption, keywords, every size they hold — and the second fetches the frame itself
        at full resolution. Its dimensions are printed so nobody opens a 3 MB JPEG blind.
      */}
      <figcaption>
        <a href={photo.page} target="_blank" rel="noreferrer noopener">
          {photo.title}
        </a>
        <span className="part-photo__credit">
          NASA
          {photo.credit ? ` · ${photo.credit}` : ''}
          {photo.date ? ` · ${photo.date.getUTCFullYear()}` : ''}
          {photo.original && (
            <>
              {' · '}
              <a
                className="part-photo__original"
                href={photo.original.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                original
                {photo.original.width && photo.original.height
                  ? ` ${photo.original.width}×${photo.original.height}`
                  : ''}
              </a>
            </>
          )}
        </span>
      </figcaption>
    </figure>
  )
}
