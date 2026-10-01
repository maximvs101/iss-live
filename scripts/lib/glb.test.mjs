import { describe, expect, it } from 'vitest'
import { BIN_CHUNK, JSON_CHUNK, parseGlb } from './glb.mjs'

/** A .glb with the given chunks, each padded to four bytes as the format requires. */
function glb(chunks) {
  const parts = [Buffer.alloc(12)]
  for (const [type, data] of chunks) {
    const pad = (4 - (data.length % 4)) % 4
    const header = Buffer.alloc(8)
    header.writeUInt32LE(data.length, 0)
    header.writeUInt32LE(type, 4)
    parts.push(header, data, Buffer.alloc(pad, type === JSON_CHUNK ? 0x20 : 0))
  }
  return Buffer.concat(parts)
}

describe('parseGlb', () => {
  it('returns the JSON document and the exact binary chunk, padding excluded', () => {
    const { json, bin } = parseGlb(glb([
      [JSON_CHUNK, Buffer.from('{"asset":{"version":"2.0"}}')],
      [BIN_CHUNK, Buffer.from([1, 2, 3, 4, 5])],
    ]))
    expect(json.asset.version).toBe('2.0')
    expect([...bin]).toEqual([1, 2, 3, 4, 5])
  })

  it('finds the JSON chunk wherever it sits, rather than assuming byte 12', () => {
    const { json } = parseGlb(glb([
      [0x12345678, Buffer.from([9, 9, 9])],
      [JSON_CHUNK, Buffer.from('{"nodes":[]}')],
    ]))
    expect(json.nodes).toEqual([])
  })

  it('has no binary chunk to give when the file has none', () => {
    expect(parseGlb(glb([[JSON_CHUNK, Buffer.from('{}')]])).bin).toBeNull()
  })

  it('refuses a file with no JSON chunk', () => {
    expect(() => parseGlb(glb([[BIN_CHUNK, Buffer.from([0])]]))).toThrow(/JSON/)
  })
})
