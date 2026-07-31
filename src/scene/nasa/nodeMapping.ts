/**
 * Mapping between the NASA 3D model and the telemetry.
 *
 * The IGOAL model names its nodes after mission control conventions: rotary joints carry the
 * suffixes ALPHA (main solar rotation), BETA (orientation of each wing) and GAMMA (radiators), and
 * the wings are designated by their power channel — the same designations as the symbols NASA
 * publishes. The mapping is therefore direct, with nothing to interpret.
 */
import type { PartId } from '../parts'

export interface JointBinding {
  /** Exact node name in the glTF file. */
  node: string
  /** Symbol publishing the angle, in degrees. */
  pui: string
  /** Matching inventory part, for selection and the inspector. */
  part: PartId
  /**
   * Rotation axis, in the node's local frame.
   *
   * Determined from the model itself rather than assumed — `npm run inspect:joints` composes the
   * node transforms and reports which axis each joint's children extend along. A beta joint holds
   * a wing 1392 units long on Z, so it turns about Z; an alpha joint holds the outboard truss
   * offset by 785 on Z, so it turns about Z as well; a thermal joint holds a radiator whose three
   * panels spread along X, so it turns about X.
   */
  axis: 'x' | 'y' | 'z'
  /**
   * Degrees between the model's resting orientation and the joint's published zero.
   *
   * Needed because the two are not the same thing. The station publishes a beta gimbal angle
   * measured from the position where the blanket lies in the plane perpendicular to the truss —
   * that is what makes |BGA| equal |beta| when the arrays are tracking the Sun — while the model
   * was built with the blanket's normal lying *along* the truss, a quarter turn away.
   *
   * The figure is not fitted to make the picture look right. `npm run verify:arrays` sweeps each
   * joint for the rotation that puts its blanket perpendicular to the truss and finds **90.00°,
   * residual 0.00°, on all eight wings** — from the geometry alone, with no reference to where the
   * Sun is. The Sun then serves as the check rather than as the input.
   */
  zero?: number
  /**
   * Direction the published angle turns the joint, in the node's own frame.
   *
   * A single reading cannot tell this apart from `zero`: at any one instant, flipping the sign and
   * moving the zero to compensate produce exactly the same pose, and a fit is happy with either.
   * Only watching it move separates them. The port alpha angle *falls* at 3.79°/min while the
   * scene needs the joint to advance at the orbital rate, so the two must run opposite ways —
   * measured over three samples spanning 46° of travel, where the published change and the fitted
   * correction summed to **23.80° against 23.79° of orbit**, and the implied constant held at
   * 170.0°, 171.5°, 172.1°.
   *
   * This is why the angles are no longer applied raw. They were, and it looked defensible: the
   * eight wing planes came out 5° apart, which is what parallel arrays should do — but they were
   * parallel and collectively wrong, and nothing in a still frame said so.
   */
  sign?: 1 | -1
}

/**
 * The twelve drivable joints.
 *
 * **The published angles are applied as they come — no sign flips.** This is worth stating,
 * because the telemetry invites the opposite conclusion: the alpha joints publish 137° (port)
 * alongside 222° (starboard), and each module's two wings publish mirrored values summing to 360°,
 * which looks like two opposite conventions that need reconciling.
 *
 * They do not. The mirroring is already baked into the rest orientations of the model's nodes,
 * whose two wings face opposite ways. Measuring the angle between the eight wing planes settles
 * it: applying the angles unchanged leaves them **5.1°** apart — as parallel as eight independently
 * commanded joints ever are — while "correcting" the mirrored ones drives that to **68.2°**.
 */
export const JOINT_BINDINGS: JointBinding[] = [
  // Alpha joints: the whole outboard truss tracks the Sun, one turn per orbit. Both run opposite
  // to the published angle; the zeros were measured by watching the fit hold still while the joint
  // swung — port 170.0°/171.5°/172.1° over 46° of travel, starboard 188.4°/187.4° over 27°.
  { node: 'PORT_ALPHA_ROT', pui: 'S0000004', part: 'sarj-port', axis: 'z', sign: -1, zero: 171.2 },
  { node: 'STBD_ALPHA_ROT', pui: 'S0000003', part: 'sarj-stbd', axis: 'z', sign: -1, zero: 187.9 },

  // Beta joints: orientation of each wing about its own mast. See `zero` above for the quarter
  // turn between the model's rest pose and the angle the station publishes.
  { node: 'PORT_BETA_ROT_2A', pui: 'P4000007', part: 'saw-2a', axis: 'z', zero: 90 },
  { node: 'PORT_BETA_ROT_4A', pui: 'P4000008', part: 'saw-4a', axis: 'z', zero: 90 },
  { node: 'PORT_BETA_ROT_2B', pui: 'P6000008', part: 'saw-2b', axis: 'z', zero: 90 },
  { node: 'PORT_BETA_ROT_4B', pui: 'P6000007', part: 'saw-4b', axis: 'z', zero: 90 },
  { node: 'STBD_BETA_ROT_1A', pui: 'S4000007', part: 'saw-1a', axis: 'z', zero: 90 },
  { node: 'STBD_BETA_ROT_3A', pui: 'S4000008', part: 'saw-3a', axis: 'z', zero: 90 },
  { node: 'STBD_BETA_ROT_1B', pui: 'S6000008', part: 'saw-1b', axis: 'z', zero: 90 },
  { node: 'STBD_BETA_ROT_3B', pui: 'S6000007', part: 'saw-3b', axis: 'z', zero: 90 },

  // Gamma joints: the radiator swings about the truss axis, across its three panels.
  { node: 'PORT_TRRJ_GAMMA_ROT', pui: 'S0000002', part: 'trrj-port', axis: 'x' },
  { node: 'STBD_TRRJ_GAMMA_ROT', pui: 'S0000001', part: 'trrj-stbd', axis: 'x' },
]

/**
 * Assembly elements, keyed by their exact node name in the model.
 *
 * The model is organised the way the station was assembled: each element of NASA's assembly list
 * is a direct child of the scene root, holding all of its own detail nodes beneath it. Matching
 * those names exactly is what keeps a module's handrails, antennas and docking targets attached to
 * *that* module — an earlier version matched name prefixes instead, and prefixes bleed across
 * elements that were never related.
 *
 * Names verified against NASA's assembly-element list and the 2023 blowout diagram.
 */
const ELEMENT_NODES: Record<string, PartId> = {
  // Truss, inboard to outboard. P4/P5/P6 and S4/S5/S6 sit under the alpha joints and must be
  // named here too, otherwise hovering them would report the rotary joint that carries them.
  Z1: 'truss-z1',
  Truss_S0: 'truss-s0',
  Truss_S1: 'truss-s1',
  Truss_S3: 'truss-s3',
  Truss_S4: 'truss-s4',
  Truss_S5: 'truss-s5',
  Truss_S6: 'truss-s6',
  Truss_P1: 'truss-p1',
  Truss_P3: 'truss-p3',
  Truss_P4: 'truss-p4',
  Truss_P5: 'truss-p5',
  Truss_P6: 'truss-p6',

  // Pressurised modules.
  USLab: 'destiny',
  Node1: 'unity',
  Node2: 'harmony',
  Node3: 'tranquility',
  Cupola: 'cupola',
  Columbus: 'columbus',
  JEM_PM: 'kibo-pm',
  JEM_EF: 'kibo-ef',
  JEM_PS: 'kibo-elm',
  Airlock: 'quest',
  PMM: 'leonardo',
  BEAM: 'beam',
  Bishop_Airlock: 'bishop',

  // Mating adapters.
  PMA1: 'pma-1',
  PMA2: 'pma-2',
  PMA3: 'pma-3',

  // Russian segment.
  Zarya_FGB: 'zarya',
  Zvezda_SM: 'zvezda',
  MRM2: 'poisk',
  MRM1: 'rassvet',
  MLM: 'nauka',
  Russian_RSNode_DockingModule: 'prichal',

  // External stowage.
  ESP1: 'esp-1',
  ESP2: 'esp-2',
  ESP3: 'esp-3',
  ELC_1: 'elc-1',
  ELC_2: 'elc-2',
  ELC_3: 'elc-3',
  ELC_4: 'elc-4',

  // Robotics.
  SSRMS_Base: 'canadarm',
  SPDM_LEE_Base: 'dextre',
  MT_Location: 'mobile-transporter',

  // Science.
  AMS: 'ams',
}

/**
 * Sub-elements that must win over the element containing them.
 *
 * A solar wing lives inside the alpha joint's subtree, and a radiator inside a truss segment;
 * without these, hovering a wing would report the rotary joint that swings it. Only parts that are
 * genuinely distinct in NASA's nomenclature appear here.
 */
const SUB_ELEMENT_PATTERNS: { pattern: RegExp; part: PartId }[] = [
  // Solar wings, designated by their power channel. IROSA panels ride on top of the original
  // wings and belong to the same channel.
  { pattern: /^(S4_1A_Array|S4_Array_1A|IROSA_.*S41A)/i, part: 'saw-1a' },
  { pattern: /^(S4_3A_Array|S4_Array_3A|IROSA_.*S43A)/i, part: 'saw-3a' },
  { pattern: /^(S6_1B_Array|S6_Array_1B|IROSA_.*S61B)/i, part: 'saw-1b' },
  { pattern: /^(S6_3B_Array|S6_Array_3B|IROSA_.*S63B)/i, part: 'saw-3b' },
  { pattern: /^(P4_Array_2A|IROSA_.*P42A)/i, part: 'saw-2a' },
  { pattern: /^(P4_Array_4A|IROSA_.*P44A)/i, part: 'saw-4a' },
  { pattern: /^(P6_2B_Array|IROSA_.*P62B)/i, part: 'saw-2b' },
  { pattern: /^(P6_4B_Array|IROSA_.*P64B)/i, part: 'saw-4b' },

  // Antennas. The dish and the two S-band assemblies are payload-mounted units in the model,
  // so they are named here rather than left to the truss segment carrying them.
  { pattern: /^Payload_SGANT/i, part: 'antenna-ku' },
  { pattern: /^Payload_SASA2/i, part: 'antenna-sasa-2' },
  { pattern: /^Payload_SASA3/i, part: 'antenna-sasa-3' },

  // Radiators and their rotary joints, mounted on the P1 and S1 segments.
  { pattern: /^P1_Radiator/i, part: 'radiator-port' },
  { pattern: /^S1_Radiator/i, part: 'radiator-stbd' },
  { pattern: /^PORT_TRRJ/i, part: 'trrj-port' },
  { pattern: /^STBD_TRRJ/i, part: 'trrj-stbd' },
  { pattern: /^PORT_ALPHA/i, part: 'sarj-port' },
  { pattern: /^STBD_ALPHA/i, part: 'sarj-stbd' },
]

/**
 * Part described by a model node, or null when the node names none.
 *
 * Callers walk up the tree from the hovered mesh, so a detail node with no match of its own ends
 * up reporting the element that contains it.
 */
export function partOfNode(nodeName: string): PartId | null {
  const element = ELEMENT_NODES[nodeName]
  if (element) return element

  for (const { pattern, part } of SUB_ELEMENT_PATTERNS) {
    if (pattern.test(nodeName)) return part
  }
  return null
}

/** Every node name this mapping claims, for the verification script. */
export const MAPPED_ELEMENT_NAMES = Object.keys(ELEMENT_NODES)

/** Every part this mapping can produce — an inventory part absent here can never be selected. */
export const MAPPED_PARTS: PartId[] = [
  ...new Set([...Object.values(ELEMENT_NODES), ...SUB_ELEMENT_PATTERNS.map((rule) => rule.part)]),
]
