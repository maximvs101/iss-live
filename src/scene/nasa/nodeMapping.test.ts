/**
 * Tests for the mapping between model nodes and inventory parts.
 *
 * This file exists because of a bug that took three attempts to kill: hovering Zvezda reported
 * half the station. The cause was prefix matching — a rule like /^Zvezda/ swallowed every node
 * whose name merely started the same way, and neighbouring elements with it. Exact names fixed
 * it, and these tests hold that line.
 */
import { describe, expect, it } from 'vitest'
import {
  JOINT_BINDINGS,
  MAPPED_ELEMENT_NAMES,
  MAPPED_PARTS,
  jointAngle,
  partOfNode,
} from './nodeMapping'
import { PART_IDS } from '../parts'
import { getSymbol } from '../../data/catalog'

const ALPHA = JOINT_BINDINGS.filter((joint) => joint.node.includes('ALPHA'))
const BETA = JOINT_BINDINGS.filter((joint) => joint.node.includes('BETA_ROT'))
const GAMMA = JOINT_BINDINGS.filter((joint) => joint.node.includes('GAMMA'))

describe('partOfNode', () => {
  it('claims an assembly element by its exact node name', () => {
    expect(partOfNode('Zvezda_SM')).toBe('zvezda')
    expect(partOfNode('USLab')).toBe('destiny')
    expect(partOfNode('Node3')).toBe('tranquility')
    expect(partOfNode('MLM')).toBe('nauka')
  })

  it('does not claim a node that merely starts with an element name', () => {
    // The whole point. These are not real nodes, but if the mapping ever went back to prefixes
    // they would resolve, and a module would start absorbing its neighbours again.
    expect(partOfNode('Zvezda_SM_Something_Else')).toBeNull()
    expect(partOfNode('Node3000')).toBeNull()
    expect(partOfNode('MLM_Extra')).toBeNull()
  })

  it('returns null for a node it does not recognise', () => {
    expect(partOfNode('SSREF_IGOAL')).toBeNull()
    expect(partOfNode('')).toBeNull()
    expect(partOfNode('Some_Handrail_042')).toBeNull()
  })

  it('gives a solar wing precedence over the joint that carries it', () => {
    // A wing lives inside the alpha joint's subtree. Without a sub-element rule, hovering the
    // wing would report the rotary joint instead.
    expect(partOfNode('S4_1A_Array')).toBe('saw-1a')
    expect(partOfNode('P6_2B_Array')).toBe('saw-2b')
  })

  it('attaches an IROSA panel to the wing it rides on', () => {
    // The six IROSA arrays sit on top of the original wings and belong to the same channel.
    expect(partOfNode('IROSA_Deployed_S41A')).toBe('saw-1a')
    expect(partOfNode('IROSA_Deployed_P64B')).toBe('saw-4b')
    expect(partOfNode('IROSA_Details_IPA_Mod_Kit_S43A')).toBe('saw-3a')
  })

  it('separates the two S-band antenna assemblies', () => {
    expect(partOfNode('Payload_SASA2')).toBe('antenna-sasa-2')
    expect(partOfNode('Payload_SASA3')).toBe('antenna-sasa-3')
    expect(partOfNode('Payload_SGANT')).toBe('antenna-ku')
  })

  it('names the truss segments individually', () => {
    expect(partOfNode('Truss_S0')).toBe('truss-s0')
    expect(partOfNode('Truss_P6')).toBe('truss-p6')
    expect(partOfNode('Z1')).toBe('truss-z1')
  })
})

describe('mapping consistency', () => {
  it('produces only parts that exist in the inventory', () => {
    const known = new Set<string>(PART_IDS)
    const unknown = MAPPED_PARTS.filter((part) => !known.has(part))
    expect(unknown).toEqual([])
  })

  it('reaches every part in the inventory', () => {
    // A part no rule can produce can never be selected, and its description is dead weight.
    const reachable = new Set<string>(MAPPED_PARTS)
    const unreachable = PART_IDS.filter((part) => !reachable.has(part))
    expect(unreachable).toEqual([])
  })

  it('claims each element name once', () => {
    expect(new Set(MAPPED_ELEMENT_NAMES).size).toBe(MAPPED_ELEMENT_NAMES.length)
  })
})

describe('joint bindings', () => {
  it('drives twelve joints', () => {
    expect(JOINT_BINDINGS).toHaveLength(12)
  })

  it('binds each joint to a distinct node and symbol', () => {
    expect(new Set(JOINT_BINDINGS.map((j) => j.node)).size).toBe(12)
    expect(new Set(JOINT_BINDINGS.map((j) => j.pui)).size).toBe(12)
  })

  it('turns alpha and beta joints about Z, and thermal joints about X', () => {
    // Determined by measuring the model, after assuming Y and putting the solar wings in
    // impossible attitudes. Never Y.
    for (const joint of JOINT_BINDINGS) {
      const expected = /TRRJ/.test(joint.node) ? 'x' : 'z'
      expect(joint.axis, `${joint.node} turns about ${expected}`).toBe(expected)
    }
  })

  it('points every joint at a part the inventory knows', () => {
    const known = new Set<string>(PART_IDS)
    for (const joint of JOINT_BINDINGS) {
      expect(known.has(joint.part), `${joint.part} is in the inventory`).toBe(true)
    }
  })

  it('cites only symbols that exist in the catalogue', () => {
    for (const joint of JOINT_BINDINGS) {
      expect(getSymbol(joint.pui), `${joint.pui} is in the catalogue`).toBeDefined()
    }
  })

  it('pairs each wing with the channel its symbol names', () => {
    // S6000008 is the 1B gimbal, so it must drive the node named for 1B. Swapping a pair inside a
    // module is the one mapping error the pointing check cannot catch: both wings of a module end
    // up wrong together, and still agree with each other about where the Sun is.
    for (const joint of BETA) {
      const channel = joint.node.slice(-2)
      expect(getSymbol(joint.pui)?.description, `${joint.pui} drives ${channel}`).toContain(
        `- ${channel} -`,
      )
    }
  })
})

/**
 * The two corrections, and the arithmetic that applies them.
 *
 * Both were wrong for a long time — every beta joint a quarter turn out, both alpha joints turning
 * the wrong way — and neither broke a test or looked wrong in a screenshot. These cannot judge
 * whether the constants are *right*; `npm run verify:arrays` does that against the model and the
 * Sun. They hold the table still, so that a typo in it is not silent.
 */
describe('joint corrections', () => {
  it('turns every beta joint a quarter turn from its rest pose', () => {
    // Measured, not chosen: the rotation that lays each blanket in the plane perpendicular to the
    // truss, which is where the station measures its BGA angle from.
    expect(BETA).toHaveLength(8)
    for (const joint of BETA) expect(joint.zero, joint.node).toBe(90)
  })

  it('runs both alpha joints against the angle they publish', () => {
    // The published port angle falls at 3.79°/min while the scene needs the joint to advance at
    // the orbital rate. The two zeros are independent constants and are not expected to match.
    expect(ALPHA).toHaveLength(2)
    for (const joint of ALPHA) expect(joint.sign, joint.node).toBe(-1)
    expect(ALPHA.map((joint) => joint.zero)).toEqual([171.2, 187.9])
  })

  it('claims nothing about the radiator joints', () => {
    // Nothing has been measured about them, so nothing is asserted.
    for (const joint of GAMMA) {
      expect(joint.zero, joint.node).toBeUndefined()
      expect(joint.sign, joint.node).toBeUndefined()
    }
  })
})

describe('jointAngle', () => {
  it('adds the zero offset', () => {
    expect(jointAngle({ node: '', pui: '', part: 'saw-1a', axis: 'z', zero: 90 }, 19)).toBe(109)
  })

  it('applies the direction of travel to the published angle, not to the sum', () => {
    // −1 × 30 + 171.2 = 141.2, not −(30 + 171.2) = −201.2. The two differ by 342.4°, which is not
    // subtle once measured and completely invisible in a still frame.
    expect(
      jointAngle({ node: '', pui: '', part: 'sarj-port', axis: 'z', sign: -1, zero: 171.2 }, 30),
    ).toBeCloseTo(141.2, 6)
  })

  it('passes the angle through untouched when neither is declared', () => {
    expect(jointAngle({ node: '', pui: '', part: 'trrj-port', axis: 'x' }, 217.5)).toBe(217.5)
  })

  it('keeps the two alpha joints turning together', () => {
    // They publish angles summing to 360°, so as one rises the other falls. Whatever the sign and
    // zero do, the pair must stay in step: the outboard trusses are one rotation, not two.
    const [port, starboard] = ALPHA
    const step = 40
    const gap = (p: number, s: number) => jointAngle(port, p) - jointAngle(starboard, s)
    expect(gap(100 + step, 260 - step) - gap(100, 260)).toBeCloseTo(-2 * step, 6)
  })
})
