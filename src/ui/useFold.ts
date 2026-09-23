/**
 * Whether a folding panel is open, remembered in this browser.
 *
 * The side column had four panels stacked and the pages that explain them below the fold. Two of
 * the four fold, closed by default with the one thing worth knowing in their summary line, and a
 * reader who opens one finds it open next time. Storage may be blocked (a private window): the
 * panel then simply starts closed.
 */
import { useState, type SyntheticEvent } from 'react'

const PREFIX = 'iss-live.fold.'

function defaultStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function useFold(key: string, storage: Storage | null = defaultStorage()) {
  const [open, setOpen] = useState(() => {
    try {
      return storage?.getItem(PREFIX + key) === '1'
    } catch {
      return false
    }
  })
  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open
    setOpen(next)
    try {
      storage?.setItem(PREFIX + key, next ? '1' : '0')
    } catch {
      // Blocked or full: it opens closed next time, which is the default anyway.
    }
  }
  return { open, onToggle }
}
