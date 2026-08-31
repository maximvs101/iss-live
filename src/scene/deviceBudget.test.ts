// @vitest-environment jsdom
/**
 * Which build a device is given, and — since this file also decides it — which planet.
 *
 * The interesting failure is not the guess about phones, which is a judgement and stated as one.
 * It is the *naming*: `lightTexture` rewrites a filename, and a rewrite that produces a name
 * `build:earth:mobile` never wrote would 404 the planet on exactly the devices that cannot afford
 * to load it twice. So the names are pinned here against the ones the build script emits.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { deviceBudget, lightTexture } from './deviceBudget'

const at = (search: string) => window.history.replaceState({}, '', search || '/')

afterEach(() => at(''))

describe('the override', () => {
  it('forces the light build, and says so', () => {
    at('?model=light')
    expect(deviceBudget()).toEqual({ light: true, reason: 'forced by ?model=light' })
  })

  it('forces the full build on a phone, which is the only way to exercise it there', () => {
    at('?model=full')
    expect(deviceBudget().light).toBe(false)
  })
})

describe('the planet that comes with each build', () => {
  it('asks for the halved copies on the light path, by the names the build writes', () => {
    at('?model=light')
    // These four are `build:earth:mobile`'s output list. A typo here is a 404 on a phone.
    expect(lightTexture('earth-day-08.jpg')).toBe('earth-day-08-light.jpg')
    expect(lightTexture('earth-clouds.jpg')).toBe('earth-clouds-light.jpg')
    expect(lightTexture('earth-night.jpg')).toBe('earth-night-light.jpg')
  })

  it('leaves every name alone on the full path', () => {
    at('?model=full')
    for (const name of ['earth-day-08.jpg', 'earth-clouds.jpg', 'earth-night.jpg']) {
      expect(lightTexture(name)).toBe(name)
    }
  })

  it('rewrites the extension and nothing else', () => {
    at('?model=light')
    // A greedy or unanchored pattern would find `.jpg` inside a directory name one day.
    expect(lightTexture('earth-detail-05-06.jpg')).toBe('earth-detail-05-06-light.jpg')
    expect(lightTexture('earth-jpg-notes.png')).toBe('earth-jpg-notes.png')
  })
})
