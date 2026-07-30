/**
 * Generates src/data/pui-catalog.json from data/PUIList.xml.
 *
 * PUIList.xml is the official catalogue of public ISS Live symbols, shipped with the Lightstreamer
 * reference client. Two quirks are worth knowing:
 *  - the file is encoded in UTF-16, not UTF-8;
 *  - the <PUI> tag always reads "***nOt*aVaiLable***": the identifier to subscribe to is
 *    <Public_PUI>.
 *
 * Usage: node scripts/build-catalog.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { XMLParser } from 'fast-xml-parser'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'data/PUIList.xml')
const TARGET = resolve(root, 'src/data/pui-catalog.json')

/** "0=CLOSED; 1=OPEN; 2=IN-TRANSIT" -> { "0": "CLOSED", "1": "OPEN", "2": "IN-TRANSIT" } */
function parseEnum(raw) {
  if (!raw || typeof raw !== 'string') return null
  const entries = raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=')
      if (eq === -1) return null
      return [part.slice(0, eq).trim(), part.slice(eq + 1).trim()]
    })
    .filter(Boolean)
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/** Empty fields come out of the parser as an empty string or an empty object. */
function text(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return null
  const str = String(value).trim()
  if (str === '' || str === 'N/A') return null
  return str
}

/**
 * Expected number of decimals, taken from the .NET format spec ("{0:f2}" -> 2).
 * Used for display: never show more precision than the source publishes.
 */
function parsePrecision(formatSpec) {
  if (!formatSpec) return null
  const match = /\{0:[fFnN](\d+)\}/.exec(formatSpec)
  return match ? Number(match[1]) : null
}

const xml = readFileSync(SOURCE, 'utf16le')
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  trimValues: true,
})
const doc = parser.parse(xml)

const list = doc.ISSLivePUIList
const disciplines = Array.isArray(list.Discipline) ? list.Discipline : [list.Discipline]

const symbols = []
for (const discipline of disciplines) {
  const name = discipline['@name']
  const items = Array.isArray(discipline.Symbol) ? discipline.Symbol : [discipline.Symbol]
  for (const symbol of items) {
    if (!symbol) continue
    const pui = text(symbol.Public_PUI)
    if (!pui) continue
    const formatSpec = text(symbol.Format_Spec)
    symbols.push({
      pui,
      discipline: name,
      description: text(symbol.Description) ?? pui,
      units: text(symbol.UNITS),
      opsNom: text(symbol.OPS_NOM),
      engNom: text(symbol.ENG_NOM),
      min: text(symbol.MIN),
      max: text(symbol.MAX),
      values: parseEnum(text(symbol.ENUM)),
      precision: parsePrecision(formatSpec),
    })
  }
}

symbols.sort((a, b) => a.pui.localeCompare(b.pui))

const catalog = {
  source: 'Lightstreamer/Lightstreamer-example-ISSLive-client-javascript — src/assets/PUIList.xml',
  sourceCreated: text(list['@created']),
  generatedAt: new Date().toISOString(),
  disciplines: disciplines.map((d) => d['@name']),
  symbols,
}

writeFileSync(TARGET, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')

const withEnum = symbols.filter((s) => s.values).length
console.log(
  `pui-catalog.json written: ${symbols.length} symbols, ${catalog.disciplines.length} disciplines, ${withEnum} enumerations`,
)
