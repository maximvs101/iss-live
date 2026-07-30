/**
 * Loading of the NASA 3D model.
 *
 * Loading is done by hand rather than through React's suspension machinery: when a component
 * suspends inside a 3D canvas, the whole scene stops being painted. Here the scene keeps running,
 * the interface can show real progress, and the model appears the moment it is ready.
 *
 * The file is downloaded once per session, however many times the component mounts.
 */
import { useEffect, useState } from 'react'
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
}

export function useIssModel(): ModelState {
  const [state, setState] = useState<ModelState>({
    scene: null,
    loading: true,
    progress: sharedProgress,
    error: null,
  })

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
  }, [])

  return state
}
