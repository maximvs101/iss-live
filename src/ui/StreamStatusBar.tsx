/**
 * Stream status, in the header.
 *
 * It answers the first question a user asks when facing an empty dashboard: is the application
 * broken, or is the station sending nothing? Sitting in the header rather than in the side panel
 * puts that answer above whichever view is open, since it applies to all of them.
 *
 * The form follows the news. When the stream is healthy it stays to one line — a dot, a label and
 * the counters — because there is nothing to explain. The moment it is not, the explanation
 * appears in full underneath: that is exactly when a reader needs the difference between "the
 * server is unreachable" and "the server is fine but the station is publishing nothing".
 */
import { HEALTH_LABELS, formatAge, useStreamStatus } from '../telemetry/health'
import { useOrbitStore } from '../orbit/useOrbit'
import { ELEMENTS_SOURCE_LABELS, elementsAgeHours } from '../orbit/tle'

const EXPLANATIONS: Record<string, string> = {
  idle: 'The connection to the stream has not been requested yet.',
  connecting: 'Establishing the link with the broadcast server.',
  waiting:
    'The NASA server responds and accepts the subscription, but the station is publishing no data.',
  live: 'The station is transmitting; the values shown are current.',
  stale:
    'No data for a minute. Most likely a loss of signal between two relay satellites — contact usually returns within a few minutes.',
  outage:
    'Prolonged interruption of the public broadcast. Telemetry values stay empty until the stream resumes.',
  offline: 'The broadcast server is unreachable from this browser.',
}

export function StreamStatusBar() {
  const status = useStreamStatus()
  const elements = useOrbitStore((store) => store.elements)
  const explanation = EXPLANATIONS[status.health]
  const healthy = status.health === 'live'

  return (
    <div className={`stream-status stream-status--${status.health}`}>
      <div className="stream-status__state" title={explanation}>
        <span className="stream-status__dot" aria-hidden="true" />
        <span>
          <span className="stream-status__label">{HEALTH_LABELS[status.health]}</span>
          {status.ageMs !== null && (
            <span className="stream-status__age">last data {formatAge(status.ageMs)} ago</span>
          )}
        </span>
      </div>

      <dl className="stream-status__facts">
        <Fact label="Symbols" value={String(status.subscribedCount)} hint="Telemetry symbols subscribed to" />
        <Fact
          label="Updates"
          value={status.updateCount.toLocaleString('en')}
          hint="Values received since the page was opened"
        />
        <Fact
          label="Elements"
          value={elements ? `${elementsAgeHours(elements).toFixed(1)} h old` : 'loading'}
          hint={
            elements
              ? `Orbital elements from ${ELEMENTS_SOURCE_LABELS[elements.source]}, used to compute the position`
              : 'Fetching orbital elements'
          }
        />
      </dl>

      {/* Only when something is wrong: explaining a healthy state is noise. */}
      {!healthy && <p className="stream-status__explanation">{explanation}</p>}
    </div>
  )
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="stream-status__fact" title={hint}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
