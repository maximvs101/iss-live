/**
 * The site's icon follows the site's colours.
 *
 * It was drawn at the start of the project, a satellite in amber on the old palette — and amber has
 * since become the colour of a warning, everywhere on the site. The icon is now the ground track the
 * home page draws: grey behind, the station's green ahead, on the console's ground.
 */
import { describe, expect, it } from 'vitest'
import svg from '../public/favicon.svg?raw'

describe('the favicon', () => {
  it('uses the station’s green and the console’s ground, never the warning amber', () => {
    expect(svg.toLowerCase()).not.toContain('#ffb03a')
    expect(svg.toLowerCase()).toContain('#4ade80')
    expect(svg.toLowerCase()).toContain('#05080c')
  })

  it('keeps its accessible name', () => {
    expect(svg).toContain('<title>ISS Live</title>')
    expect(svg).toContain('aria-label="ISS Live"')
  })
})
