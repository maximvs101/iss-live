/**
 * Tests for the mapping between model nodes and inventory parts.
 *
 * This file exists because of a bug that took three attempts to kill: hovering Zvezda reported
 * half the station. The cause was prefix matching — a rule like /^Zvezda/ swallowed every node
 * whose name merely started the same way, and neighbouring elements with it. Exact names fixed
 * it, and these tests hold that line.
 */
import { describe, expect, it } from 'vitest'
import { JOINT_BINDINGS, MAPPED_ELEMENT_NAMES, MAPPED_PARTS, partOfNode } from './nodeMapping'
import { PART_IDS } from '../parts'

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
})
