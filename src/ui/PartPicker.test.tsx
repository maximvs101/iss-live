// @vitest-environment jsdom
/**
 * Tests for choosing a part without a mouse.
 *
 * This control exists because the 3D scene had no other way in — `onClick` on a mesh and nothing
 * else — so what is being pinned is precisely that it *is* an alternative: reachable by name,
 * operable from the keyboard, and covering every part rather than the photogenic ones.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PartPicker } from './PartPicker'
import { useSelectionStore } from './selection'
import { PARTS } from '../scene/parts'
import { PART_CATEGORY_LABELS } from './InspectorPanel'

afterEach(() => {
  cleanup()
  useSelectionStore.getState().select(null)
})

describe('PartPicker', () => {
  it('offers every part in the inventory', () => {
    // Not a curated subset: a part the scene can show but the picker cannot name would be
    // unreachable for anyone without a pointer, which is the whole fault being fixed.
    render(<PartPicker />)
    const values = [...screen.getByRole('combobox').querySelectorAll('option')]
      .map((option) => option.getAttribute('value'))
      .filter(Boolean)

    expect(values.sort()).toEqual(Object.keys(PARTS).sort())
  })

  /**
   * The mirror of the check above, on the other list that enumerates categories by hand.
   *
   * The picker groups by category and the inspector names the category, and the two lists were
   * written separately: the inspector was missing robotics, science and platform, so six parts —
   * Canadarm2, Dextre, the Mobile Transporter, AMS and the two stowage platforms — printed the raw
   * identifier under their name. It also carried `attitude`, which no part has ever used.
   */
  it('names every category the inventory actually uses, and no others', () => {
    const used = [...new Set(Object.values(PARTS).map((part) => part.category))].sort()
    expect(Object.keys(PART_CATEGORY_LABELS).sort()).toEqual(used)
  })

  it('groups them under headings', () => {
    render(<PartPicker />)
    const groups = [...screen.getByRole('combobox').querySelectorAll('optgroup')].map((g) =>
      g.getAttribute('label'),
    )
    expect(groups).toContain('Pressurised modules')
    expect(groups).toContain('Truss')
    // Forty-seven flat options would be a wall; the grouping is what makes it scannable.
    expect(groups.length).toBeGreaterThan(4)
  })

  it('selects a part by name', () => {
    render(<PartPicker />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cupola' } })
    expect(useSelectionStore.getState().selected).toBe('cupola')
  })

  it('clears the selection through the empty option', () => {
    useSelectionStore.getState().select('cupola')
    render(<PartPicker />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(useSelectionStore.getState().selected).toBeNull()
  })

  it('shows what the scene has selected', () => {
    // Clicking a mesh must move this control too, or the two disagree about what is on screen.
    useSelectionStore.getState().select('zvezda')
    render(<PartPicker />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('zvezda')
  })

  it('carries a label a screen reader can announce', () => {
    render(<PartPicker />)
    expect(screen.getByLabelText(/part/i)).toBe(screen.getByRole('combobox'))
  })

  it('names parts by their common name, not their identifier', () => {
    render(<PartPicker />)
    const option = [...screen.getByRole('combobox').querySelectorAll('option')].find(
      (o) => o.getAttribute('value') === 'truss-s0',
    )
    expect(option?.textContent).toBe(PARTS['truss-s0'].name)
    expect(option?.textContent).not.toContain('truss-s0')
  })
})
