/**
 * What the photograph panel actually shows first, part by part.
 *
 * `photoScore` ranks on titles and captions, which is all a browser can read. Whether the frame it
 * puts first is a wide view of the module or an astronaut's portrait taken inside it is a question
 * about the *image*, and nothing in the pipeline has ever looked at one.
 *
 * This prints the ranked top few per part with their preview URLs, so the images can be opened and
 * judged. It changes nothing; it exists to find out whether the ranking needs help before anyone
 * writes more of it.
 *
 *     node scripts/audit-photos.mjs            # every part with a query
 *     node scripts/audit-photos.mjs cupola destiny   # just these
 */
import { PHOTO_QUERY, photosForPart } from '../src/media/imagery.ts'

const wanted = process.argv.slice(2)
const parts = Object.keys(PHOTO_QUERY).filter((p) => wanted.length === 0 || wanted.includes(p))
const TOP = Number(process.env.TOP ?? 3)

console.log(`part\trank\ttitle\turl`)
for (const part of parts) {
  let photos = []
  try {
    photos = await photosForPart(part, TOP)
  } catch (error) {
    console.log(`${part}\t-\tERREUR ${String(error).slice(0, 60)}\t`)
    continue
  }
  if (photos.length === 0) {
    console.log(`${part}\t-\t(aucune)\t`)
    continue
  }
  photos.forEach((photo, index) => {
    console.log(`${part}\t${index + 1}\t${photo.title.replace(/\s+/g, ' ')}\t${photo.src}`)
  })
}
