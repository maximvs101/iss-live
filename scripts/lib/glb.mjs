/**
 * Reading a binary glTF (.glb) without a library.
 *
 * Six scripts each had their own copy of this loop — two of them a shortcut that assumed the JSON
 * chunk sits at byte 12, true of every file we produce and of no file guaranteed. One reader now.
 */
import { readFileSync } from 'node:fs'

export const JSON_CHUNK = 0x4e4f534a
export const BIN_CHUNK = 0x004e4942

/** The JSON document and the binary chunk (null if the file has none) of a .glb buffer. */
export function parseGlb(buffer) {
  let json = null
  let bin = null
  let offset = 12
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.readUInt32LE(offset + 4)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'))
    else if (type === BIN_CHUNK) bin = data
    // Chunks are padded to four bytes.
    offset += 8 + length + ((4 - (length % 4)) % 4)
  }
  if (!json) throw new Error('No JSON chunk in this .glb')
  return { json, bin }
}

export function readGlb(path) {
  return parseGlb(readFileSync(path))
}
