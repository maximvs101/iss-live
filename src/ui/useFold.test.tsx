// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useFold } from './useFold'

afterEach(cleanup)

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

function Panel({ storage }: { storage: Storage | null }) {
  const fold = useFold('freshness', storage)
  return (
    <details open={fold.open} onToggle={fold.onToggle}>
      <summary>Data freshness</summary>
      <p>grid</p>
    </details>
  )
}

describe('useFold', () => {
  it('starts closed, and remembers being opened', () => {
    const storage = memoryStorage()
    const { container } = render(<Panel storage={storage} />)
    const details = container.querySelector('details')!
    expect(details.open).toBe(false)
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(storage.getItem('iss-live.fold.freshness')).toBe('1')
  })

  it('opens as it was left', () => {
    const { container } = render(<Panel storage={memoryStorage({ 'iss-live.fold.freshness': '1' })} />)
    expect(container.querySelector('details')!.open).toBe(true)
  })

  // Review focus 5
  it('works with storage blocked', () => {
    const blocked = new Proxy({} as Storage, {
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    const { container } = render(<Panel storage={blocked} />)
    const details = container.querySelector('details')!
    expect(details.open).toBe(false)
    details.open = true
    expect(() => fireEvent(details, new Event('toggle'))).not.toThrow()
  })
})
