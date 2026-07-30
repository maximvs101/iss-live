/**
 * Probes the public ISS Live stream and reports whether it is actually publishing data.
 *
 * Useful because a perfectly established connection proves nothing: the Lightstreamer server
 * accepts the session and the subscription even when NASA's upstream source has stopped
 * publishing (observed from 22/07/2026 through at least 28/07/2026). This script speaks the TLCP
 * protocol directly, with no dependencies, so the stream's return can be checked without starting
 * the application.
 *
 * Usage: node scripts/check-stream.mjs [--seconds 30]
 */
const BASE = 'https://push.lightstreamer.com/lightstreamer'
const PROTOCOL = 'LS_protocol=TLCP-2.5.0'
const CID = 'mgQkwtwdysogQz2BJ4Ji kOj2rm'

const ITEMS = [
  'TIME_000001', // onboard GMT
  'USLAB000058', // Destiny cabin pressure
  'NODE3000001', // Tranquility ppO2
  'S0000003', // starboard SARJ
  'S4000007', // BGA 1A
  'USLAB000040', // solar beta angle
  'Z1000009', // CMG-1 wheel speed
  'NODE3000009', // potable water tank
]
const SCHEMA = ['TimeStamp', 'Value', 'Status.Class']

const durationArg = process.argv.indexOf('--seconds')
const DURATION_S = durationArg !== -1 ? Number(process.argv[durationArg + 1]) : 30

function form(fields) {
  return new URLSearchParams(fields).toString()
}

async function post(url, fields) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(fields),
  })
}

async function main() {
  console.log(`ISS Live probe — ${ITEMS.length} symbols, listening for ${DURATION_S} s\n`)

  const response = await post(`${BASE}/create_session.txt?${PROTOCOL}`, {
    LS_adapter_set: 'ISSLIVE',
    LS_cid: CID,
    LS_send_sync: 'false',
  })

  if (!response.ok || !response.body) {
    console.error(`Failed to open a session: HTTP ${response.status}`)
    process.exit(2)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const deadline = Date.now() + DURATION_S * 1000

  let buffer = ''
  let sessionId = null
  let subscribed = false
  let updates = 0
  const seen = new Map()

  while (Date.now() < deadline) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\r\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line === '' || line === 'PROBE' || line.startsWith('NOOP')) continue

      if (line.startsWith('CONOK,') && !sessionId) {
        sessionId = line.split(',')[1]
        console.log(`session opened: ${sessionId}`)
        const control = await post(`${BASE}/control.txt?${PROTOCOL}&LS_session=${sessionId}`, {
          LS_reqId: '1',
          LS_op: 'add',
          LS_subId: '1',
          LS_mode: 'MERGE',
          LS_group: ITEMS.join(' '),
          LS_schema: SCHEMA.join(' '),
          LS_snapshot: 'true',
        })
        console.log(`subscription: ${(await control.text()).trim()}`)
        continue
      }

      if (line.startsWith('CONERR,')) {
        console.error(`connection refused: ${line}`)
        process.exit(2)
      }

      if (line.startsWith('SUBOK,')) {
        const [, , items, fields] = line.split(',')
        subscribed = true
        console.log(`subscription confirmed: ${items} symbols x ${fields} fields\n`)
        continue
      }

      if (line.startsWith('U,')) {
        updates += 1
        // Format: U,<subId>,<itemIndex>,<pipe-separated values>
        const [, , itemIndex, ...rest] = line.split(',')
        const values = rest.join(',').split('|')
        const pui = ITEMS[Number(itemIndex) - 1] ?? `item ${itemIndex}`
        seen.set(pui, values[1] ?? '')
        console.log(`  ${pui} = ${values[1] ?? ''}`)
      }
    }
  }

  await reader.cancel().catch(() => {})

  console.log('\n--- result ---')
  console.log(`subscription accepted : ${subscribed ? 'yes' : 'no'}`)
  console.log(`updates received      : ${updates}`)
  console.log(`symbols with data     : ${seen.size} / ${ITEMS.length}`)

  if (updates === 0) {
    console.log('\nThe server responds but the station publishes nothing: broadcast still interrupted.')
    process.exit(1)
  }
  console.log('\nThe stream is publishing data.')
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
