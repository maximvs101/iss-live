/**
 * Loading of the NASA 3D model.
 *
 * Loading is done by hand rather than through React's suspension machinery: when a component
 * suspends inside a 3D canvas, the whole scene stops being painted. Here the scene keeps running,
 * the interface can show real progress, and the model appears the moment it is ready.
 *
 * The file is downloaded once per session, however many times the component mounts.
 */
import { useCallback, useEffect, useState } from 'react'
import { Group } from 'three'

export const ISS_MODEL_URL = '/models/iss-igoal.glb'

/**
 * Draco decoder served by the application itself: by default three would fetch it from a Google
 * CDN, which would make displaying the station depend on a third party.
 */
const DRACO_DECODER_PATH = '/draco/'

/** Compressed size of the model, used to report progress when the server sends no length. */
const MODEL_BYTES = 14.9 * 1024 * 1024

let pending: Promise<Group> | null = null
/** Progress of the shared download, so a second mount does not restart from zero. */
let sharedProgress = 0
const progressListeners = new Set<(value: number) => void>()

function loadModel(): Promise<Group> {
  if (pending) return pending

  // The glTF and Draco loaders are imported here rather than at module scope so they are not
  // part of the initial download. They are only ever needed by the Station view; a visitor who
  // stays on the orbital view never fetches them. Both views share three.js itself, so that
  // cannot be deferred — these two can.
  pending = (async () => {
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
    ])

    return new Promise<Group>((resolve, reject) => {
      const draco = new DRACOLoader()
      draco.setDecoderPath(DRACO_DECODER_PATH)

      const loader = new GLTFLoader()
      loader.setDRACOLoader(draco)

      loader.load(
        ISS_MODEL_URL,
        (gltf) => {
          draco.dispose()
          sharedProgress = 1
          for (const listener of progressListeners) listener(1)
          resolve(gltf.scene)
        },
        (event) => {
          const total = event.total || MODEL_BYTES
          sharedProgress = Math.min(0.99, event.loaded / total)
          for (const listener of progressListeners) listener(sharedProgress)
        },
        (error) => {
          draco.dispose()
          pending = null
          reject(error)
        },
      )
    })
  })()

  // A failed import must not leave a rejected promise cached, or every later mount reuses it.
  pending.catch(() => {
    pending = null
  })

  return pending
}

export interface ModelState {
  scene: Group | null
  /** True while the file is neither loaded nor failed. */
  loading: boolean
  /** Download progress, 0 to 1. Decoding happens after it reaches 1. */
  progress: number
  error: Error | null
  /**
   * Try the download again after a failure.
   *
   * Without this the only way out of a failed load was reloading the page — which throws away the
   * telemetry session and the orbital state to recover from what is usually a dropped packet on a
   * 15 MB file. The failure path already clears the cached promise, so this is a real second
   * attempt rather than a replay of the first one's rejection.
   */
  retry: () => void
}

export function useIssModel(): ModelState {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<Omit<ModelState, 'retry'>>({
    scene: null,
    loading: true,
    progress: sharedProgress,
    error: null,
  })

  const retry = useCallback(() => {
    setState({ scene: null, loading: true, progress: 0, error: null })
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    const onProgress = (progress: number) => {
      if (!cancelled) setState((current) => ({ ...current, progress }))
    }
    progressListeners.add(onProgress)

    loadModel()
      .then((scene) => {
        if (!cancelled) setState({ scene, loading: false, progress: 1, error: null })
      })
      .catch((error: Error) => {
        console.error('[scene] NASA model failed to load:', error)
        if (!cancelled) setState({ scene: null, loading: false, progress: 0, error })
      })

    return () => {
      cancelled = true
      progressListeners.delete(onProgress)
    }
  }, [attempt])

  return { ...state, retry }
}
