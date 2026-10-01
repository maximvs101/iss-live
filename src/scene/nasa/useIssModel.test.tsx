// @vitest-environment jsdom
/**
 * The failure path of the model download, which nothing had ever taken.
 *
 * Loading the 15 MB station model works, and that is the only thing anyone checks: you open the
 * Station view and it appears. The branch underneath — the file does not arrive — was written,
 * styled, and never once executed, which is how it came to sit in the corner of the canvas with a
 * transparent background and no way out but reloading the page.
 *
 * Blocking the download in a browser found all three defects at once. These tests hold the part of
 * that which can be held without one: that a failure surfaces, that the retry is a real second
 * attempt rather than a replay of the first rejection, and that succeeding on the second try
 * actually delivers the model.
 *
 * The loaders are mocked because the real ones want a WebGL context and a Draco decoder; what is
 * under test is the caching and retry logic in this file, not three's ability to parse glTF.
 */
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Group } from 'three'

/** Attempts made through the mocked loader, and what each one should do. */
let attempts = 0
let outcomes: ('fail' | 'succeed' | 'hang')[] = []
/** The progress callback of the last download, for a test to report chunks through. */
let reportProgress: ((event: { loaded: number; total: number }) => void) | null = null
/** What the hook handed the Draco loader as its decoder. */
let decoderPath: unknown = null

vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACO_GLTF_CONFIG: { js: 'gltf/wrapper.js', wasm: 'gltf/decoder.wasm' },
  DRACOLoader: class {
    setDecoderPath(path: unknown) {
      decoderPath = path
    }
    dispose() {}
  },
}))

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader() {}
    load(
      _url: string,
      onLoad: (gltf: { scene: Group }) => void,
      onProgress: (event: { loaded: number; total: number }) => void,
      onError: (error: Error) => void,
    ) {
      const outcome = outcomes[attempts] ?? 'succeed'
      attempts += 1
      reportProgress = onProgress
      if (outcome === 'hang') return
      // Asynchronous like the real one, so the hook goes through its loading state.
      queueMicrotask(() => {
        if (outcome === 'fail') onError(new Error('Failed to fetch'))
        else onLoad({ scene: new Group() })
      })
    }
  },
}))

/** Shows which of the hook's three states it is in, so a query can tell them apart. */
function Probe() {
  const { scene, loading, error, retry } = useIssModel()
  return (
    <div>
      <span data-testid="state">{error ? 'error' : loading ? 'loading' : scene ? 'loaded' : 'idle'}</span>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  )
}

let useIssModel: typeof import('./useIssModel').useIssModel

beforeEach(async () => {
  attempts = 0
  outcomes = []
  decoderPath = null
  reportProgress = null
  // A fresh module each time: the download is cached in a module-level promise on purpose, and a
  // test that inherited the previous one would be asserting against the last test's result.
  vi.resetModules()
  ;({ useIssModel } = await import('./useIssModel'))
})

afterEach(cleanup)

/** Lets the mocked loader's microtask and React's resulting render both run. */
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('loading the NASA model', () => {
  it('reports the failure rather than staying on a loading bar for ever', async () => {
    outcomes = ['fail']
    render(<Probe />)
    await settle()
    expect(screen.getByTestId('state').textContent).toBe('error')
    expect(attempts).toBe(1)
  })

  it('retries for real, instead of replaying the first rejection', async () => {
    // The trap this guards: the failed promise is cached in a module-level variable. If the error
    // path does not clear it, every retry resolves instantly from the same rejection and the
    // button does nothing at all — while looking as though it works.
    outcomes = ['fail', 'fail']
    render(<Probe />)
    await settle()
    expect(attempts).toBe(1)

    await act(async () => {
      screen.getByRole('button', { name: 'Try again' }).click()
    })
    await settle()

    expect(attempts).toBe(2)
    expect(screen.getByTestId('state').textContent).toBe('error')
  })

  it('recovers when the second attempt succeeds', async () => {
    outcomes = ['fail', 'succeed']
    render(<Probe />)
    await settle()
    expect(screen.getByTestId('state').textContent).toBe('error')

    await act(async () => {
      screen.getByRole('button', { name: 'Try again' }).click()
    })
    await settle()

    expect(attempts).toBe(2)
    expect(screen.getByTestId('state').textContent).toBe('loaded')
  })

  it('downloads once however many components ask for it', async () => {
    // Two mounts of the Station view must not mean two 15 MB downloads.
    outcomes = ['succeed']
    render(
      <>
        <Probe />
        <Probe />
      </>,
    )
    await settle()
    expect(attempts).toBe(1)
  })

  it('re-renders on whole percents, not on every chunk of the download', async () => {
    // A 15 MB file arrives in hundreds of chunks; each re-render reaches the whole 3D scene.
    outcomes = ['hang']
    let renders = 0
    function Counter() {
      useIssModel()
      renders += 1
      return null
    }
    render(<Counter />)
    await settle()
    const before = renders
    // 0 → 10 % in two hundred chunks, each arriving on its own like network reads.
    for (let i = 1; i <= 200; i += 1) {
      await act(async () => reportProgress?.({ loaded: i * 500, total: 1_000_000 }))
    }
    expect(renders - before).toBeLessThanOrEqual(10)
  })

  it('decodes with the glTF decoder three.js ships, not a copy of its own', async () => {
    // A path string here would mean a hand-kept copy again — and three falls back to a CDN when
    // such a path 404s. The config object is the decoder Vite emits from three's own package.
    render(<Probe />)
    await settle()
    expect(decoderPath).toEqual({ js: 'gltf/wrapper.js', wasm: 'gltf/decoder.wasm' })
  })
})
