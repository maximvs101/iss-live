/**
 * Whether this device can be trusted with the full station.
 *
 * Not a preference and not a screen size: a memory question, answered as directly as the platform
 * allows. Decoded, the desktop model occupies about **739 MB** — 577 of texture once 108 images at
 * 1024×1024 become RGBA with mipmaps, and 162 of vertex attributes for 4.8 M vertices. Every
 * browser on iOS is WebKit underneath, Chrome included, and WebKit ends a tab's renderer somewhere
 * between 250 and 400 MB. So on an iPhone this is not a slow load, it is an execution that cannot
 * finish, and the tab dies without a message.
 *
 * `navigator.deviceMemory` would answer it and Safari does not implement it, so the signal used is
 * the one that is actually there: a coarse pointer with a small viewport is a phone. A tablet with
 * a large screen is left on the full model, which is the right way round — the cost of being wrong
 * is a slightly softer texture, against a tab that closes itself.
 */

/** Below this width, a touch device is treated as a phone. */
const PHONE_WIDTH = 820

export interface DeviceBudget {
  /** The model to fetch: the 256px textures build, or the full one. */
  light: boolean
  /** Why, in one phrase, for the interface to say out loud rather than decide silently. */
  reason: string
}

/**
 * The reduced copy of a planet texture, where the budget calls for one.
 *
 * The station was halved for the phone and the planet was not, which left the asymmetry this
 * repairs: `deviceBudget` switched a 739 MB model for a 200 MB one and then loaded 444 MB of
 * planet on top of it either way. The day map alone is 297 MB decoded. `build:earth:mobile`
 * writes the halved copies — 74, 19 and 8 MB against 297, 74 and 33 — and this is the one place
 * that decides to ask for them.
 *
 * Only the images that are *looked at* have a light copy. The roughness map is read as data and
 * the detail tile exists to be sharper than the map beneath it, so both are loaded at full size
 * on every device; between them they are 40 MB, and the reasoning is in `build:earth:mobile`.
 */
export function lightTexture(name: string): string {
  return deviceBudget().light ? name.replace(/\.jpg$/, '-light.jpg') : name
}

export function deviceBudget(): DeviceBudget {
  if (typeof window === 'undefined') return { light: false, reason: 'no window' }

  /*
   * An explicit override, because the guess above can be wrong in both directions.
   *
   * `?model=light` on a machine that was given the full one, `?model=full` on a phone whose owner
   * would rather find out. It is also the only way to exercise either path on a device that is not
   * the one being targeted, which is how the reduced build was checked at all.
   */
  const forced = new URLSearchParams(window.location.search).get('model')
  if (forced === 'light') return { light: true, reason: 'forced by ?model=light' }
  if (forced === 'full') return { light: false, reason: 'forced by ?model=full' }

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= PHONE_WIDTH

  if (coarse && narrow) {
    return { light: true, reason: 'phone-sized touch screen' }
  }
  return { light: false, reason: 'desktop or tablet' }
}
