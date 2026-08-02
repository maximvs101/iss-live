/**
 * NASA's official 3D model, driven by telemetry.
 *
 * The file comes from the (D) IGOAL model, reduced for the web by `npm run build:model`. It keeps
 * all 580 named nodes, which allows two things a merged mesh would rule out: clicking a module to
 * inspect it, and rotating the twelve joints from the angles the station publishes.
 *
 * With no data, the joints stay in their original position — the one the model was built in — and
 * nothing moves.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import {
  Box3,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { readNumber } from '../../telemetry/store'
import { useSelectionStore } from '../../ui/selection'
import type { PartId } from '../parts'
import { JOINT_BINDINGS, jointAngle, partOfNode, type JointBinding } from './nodeMapping'

/**
 * Real span of the station across the truss, in metres — the model's longest axis.
 *
 * This was 109 m, the figure most sources repeat, and NASA's own documents do not support it.
 * Three of them agree on 94: the current facts page ("Truss Length: 310 feet (94 meters)"), the
 * *Reference Guide to the ISS*, 2015 edition ("95 m (311 ft) from the P6 to S6 trusses") and
 * Boeing's EPS overview ("the ISS's 310-foot long truss").
 *
 * The model settles it, because the scale has one free parameter and the model has three axes.
 * Measured in the browser with the joints held at rest, at this scale:
 *
 * | | model | NASA |
 * |---|---|---|
 * | truss and modules, port to starboard | 92.6 m | 94 m |
 * | the arrays, fore to aft | 69.5 m | 73 m |
 * | structure, nadir to zenith | 29.0 m | radiators deployed, ~27 m |
 *
 * Every axis lands within 5 %. At 109 m they come out at 107.4 and 80.6, which is 14 % and 10 %
 * over. Only one number is chosen here; the others are checks, and they prefer 94.
 */
const ISS_SPAN_METERS = 94

/**
 * Joint diagnostic, enabled with `?rigtest=1` in development.
 *
 * It rotates the twelve joints continuously so one can check by eye that each pivots about the
 * right axis and carries the expected parts with it. This is not a telemetry simulation: the
 * values in the interface stay empty, only the model moves.
 */
const RIG_TEST =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('rigtest')

/** Local rotation axis, by axis name. */
const AXES = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
}

interface Joint {
  node: Object3D
  /** Orientation of the node in the original model, the basis for every rotation. */
  rest: Quaternion
  axis: Vector3
  pui: string
  /** The binding this joint came from, which carries its zero and its direction of travel. */
  binding: JointBinding
}

interface IssGltfProps {
  /** Already-loaded model (see useIssModel). */
  scene: Group
  /**
   * Rotation applied to the whole model to align it with the scene frame
   * (+X starboard, +Y zenith, +Z aft).
   */
  rotation?: [number, number, number]
}

export function IssGltf({ scene, rotation = [0, -Math.PI / 2, 0] }: IssGltfProps) {
  const selected = useSelectionStore((store) => store.selected)
  const hovered = useSelectionStore((store) => store.hovered)
  const select = useSelectionStore((store) => store.select)
  const hover = useSelectionStore((store) => store.hover)

  // The model is shared between mounts: work on a copy so materials can be tinted and joints
  // rotated without side effects.
  //
  // The copy is not enough on its own. `clone` shares materials with the original, and the file
  // reuses **42 materials across 506 meshes** — `MLI.Generic` alone covers 163 of them, spread
  // over the whole station. Tinting a mesh therefore tinted every mesh drawn with the same
  // material, which is why hovering Zvezda lit up most of the ISS. Each mesh gets its own
  // material here; textures stay shared, so the cost is 506 small objects rather than any extra
  // image memory, and the draw-call count is unchanged since the meshes were already separate.
  const model = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((object) => {
      if (!(object instanceof Mesh)) return
      // Every mesh both casts and receives: the station shades itself, and a wing that cast a
      // shadow without catching one would look lit from inside.
      object.castShadow = true
      object.receiveShadow = true
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone()
    })
    return copy
  }, [scene])

  // Those clones are ours to release; the textures they point at belong to the shared scene and
  // are deliberately left alone.
  useEffect(
    () => () => {
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) material.dispose()
      })
    },
    [model],
  )

  /** Scale factor bringing the model to the real dimensions of the station. */
  const scale = useMemo(() => {
    const box = new Box3().setFromObject(model)
    const size = box.getSize(new Vector3())
    const span = Math.max(size.x, size.y, size.z)
    return span > 0 ? ISS_SPAN_METERS / span : 1
  }, [model])

  /** Joints found in the model, with their resting orientation. */
  const joints = useMemo<Joint[]>(() => {
    const found: Joint[] = []
    for (const binding of JOINT_BINDINGS) {
      const node = model.getObjectByName(binding.node)
      if (!node) {
        console.warn(`[scene] joint missing from model: ${binding.node}`)
        continue
      }
      found.push({
        node,
        rest: node.quaternion.clone(),
        axis: AXES[binding.axis],
        pui: binding.pui,
        binding,
      })
    }
    return found
  }, [model])

  /** Mesh → inventory part association, computed once. */
  const meshParts = useMemo(() => {
    const map = new Map<Mesh, PartId>()
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      // A mesh inherits the part of the first recognised ancestor, itself included.
      let current: Object3D | null = object
      while (current) {
        const part = current.name ? partOfNode(current.name) : null
        if (part) {
          map.set(object, part)
          return
        }
        current = current.parent
      }
    })
    return map
  }, [model])

  /** Original materials, so the tint can be restored after a highlight. */
  const baseColors = useRef(new Map<MeshStandardMaterial, Color>())

  useEffect(() => {
    const colors = baseColors.current
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial && !colors.has(material)) {
          colors.set(material, material.emissive.clone())
        }
      }
    })
  }, [model])

  // Highlight of the selected or hovered part.
  useEffect(() => {
    const highlight = new Color('#ffb03a')
    const hoverColor = new Color('#2f6f9f')

    for (const [mesh, part] of meshParts) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue
        const original = baseColors.current.get(material)
        if (part === selected) {
          material.emissive.copy(highlight)
          material.emissiveIntensity = 0.45
        } else if (part === hovered) {
          material.emissive.copy(hoverColor)
          material.emissiveIntensity = 0.3
        } else if (original) {
          material.emissive.copy(original)
          material.emissiveIntensity = 1
        }
      }
    }
  }, [meshParts, selected, hovered])

  // Exposed for measurement in development. It goes in an effect rather than in the memo above:
  // React mounts components twice in development, and only the surviving mount runs its effects —
  // a copy taken during the memo can be an orphan that is never rendered. Measuring that orphan
  // once hid a wrong rotation axis behind plausible-looking numbers.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __issJoints?: Joint[] }).__issJoints = joints
  }, [joints])

  useFrame(() => {
    // Diagnostic sweep: with no telemetry, this is the only way to check that the declared
    // rotation axes are right. Development only, never active for the user.
    const sweep = RIG_TEST ? (Date.now() / 40) % 360 : null

    for (const joint of joints) {
      const angle = sweep ?? readNumber(joint.pui)
      if (angle === null) continue
      joint.node.quaternion
        .copy(joint.rest)
        .multiply(
          new Quaternion().setFromAxisAngle(
            joint.axis,
            MathUtils.degToRad(jointAngle(joint.binding, angle)),
          ),
        )
    }
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    // A drag that begins on the model still ends in a click, so rotating the view was selecting
    // whatever happened to be under the pointer when the button came up — noticed three times in
    // a row while turning the scene to look for something else. `delta` is how far the pointer
    // travelled between press and release; past a few pixels the gesture was a rotation.
    if (event.delta > 4) return
    const part = event.object instanceof Mesh ? meshParts.get(event.object) : undefined
    select(part && part !== selected ? part : null)
  }

  /**
   * Hover is tracked on pointer *move*, not on pointer *over*.
   *
   * The whole model is a single React object, so moving from one module to the next does not
   * necessarily produce a new "over" event — the pointer never left the primitive. Reading the
   * intersected mesh on every move is what makes the label follow the cursor across the 555
   * meshes.
   */
  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const part = (event.object instanceof Mesh ? meshParts.get(event.object) : null) ?? null
    hover(part, { x: event.clientX, y: event.clientY })
    document.body.style.cursor = part ? 'pointer' : 'auto'
  }

  const handleOut = () => {
    hover(null)
    document.body.style.cursor = 'auto'
  }

  return (
    /*
     * Ray casting straight against the triangles, with no acceleration structure.
     *
     * `three-mesh-bvh` was here and has been taken out. The cost is written down because it is not
     * small, and because the figure this file used to quote — "4 ms on average and over 20 at
     * worst" — was close enough to be believed and not close enough to decide on.
     *
     * Measured both ways over the same 1 008 pointer positions across the default view, against the
     * same object, 308 of them landing on the station:
     *
     *              with a BVH      without      ratio
     *     mean       0.217 ms      1.526 ms      7.0×
     *     median     0.2 ms        0.1 ms          —
     *     p95        0.6 ms        7.0 ms       11.7×
     *     worst      1.3 ms       28.0 ms       21.5×
     *
     * The median is unchanged, and that is the shape of it: most of the frame is empty sky and a
     * miss costs nothing either way. The whole bill lands on the hits, where 28 ms is nearly two
     * frames at 60 Hz — on an event that fires with every movement of the mouse.
     *
     * What it buys back is 41.9 kB of a 595 kB chunk, 13.4 kB over the wire, on a chunk that is
     * only fetched when this view is opened. Restoring it is one import and one wrapper.
     */
    <>
      <primitive
        object={model}
        scale={scale}
        rotation={rotation}
        onClick={handleClick}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
      />
    </>
  )
}
