/** The station part currently selected or hovered in the 3D scene. */
import { create } from 'zustand'
import type { PartId } from '../scene/parts'

/** Cursor position in the page, so the hover label can follow it. */
export interface ScreenPoint {
  x: number
  y: number
}

interface SelectionStore {
  selected: PartId | null
  hovered: PartId | null
  hoverPoint: ScreenPoint | null
  select: (part: PartId | null) => void
  hover: (part: PartId | null, point?: ScreenPoint | null) => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selected: null,
  hovered: null,
  hoverPoint: null,
  select: (selected) => set({ selected }),
  hover: (hovered, point = null) =>
    set((state) =>
      // Skip the update when nothing changed: pointer moves fire on every frame.
      state.hovered === hovered && state.hoverPoint?.x === point?.x && state.hoverPoint?.y === point?.y
        ? state
        : { hovered, hoverPoint: hovered ? point : null },
    ),
}))
