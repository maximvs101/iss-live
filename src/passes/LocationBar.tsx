/**
 * "Use my location", or a city typed into a combobox that works from the keyboard.
 *
 * Each keystroke may resolve out of order — the first letter fetches a file, the next ones do not —
 * so every search carries a number and only the latest one is allowed to land.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { countryName, searchCities, type City, type Fetcher } from './cities.ts'
import { normalise } from './normalise.ts'

interface Props {
  onPick: (city: City) => void
  onLocate: (() => void) | null
  fetcher?: Fetcher
}

export function LocationBar({ onPick, onLocate, fetcher }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<City[]>([])
  const [active, setActive] = useState(-1)
  const [failed, setFailed] = useState(false)
  const request = useRef(0)

  useEffect(() => {
    const n = ++request.current
    if (!normalise(query)) {
      setResults([])
      return
    }
    searchCities(query, 8, fetcher).then(
      (found) => {
        if (request.current !== n) return
        setResults(found)
        setActive(found.length ? 0 : -1)
        setFailed(false)
      },
      () => {
        if (request.current !== n) return
        setResults([])
        setFailed(true)
      },
    )
  }, [query, fetcher])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && active >= 0 && results[active]) {
      event.preventDefault()
      onPick(results[active])
    } else if (event.key === 'Escape') {
      setQuery('')
    }
  }

  return (
    <div className="locate">
      {onLocate && (
        <button type="button" className="locate__here" onClick={onLocate}>
          ⌖ Use my location
        </button>
      )}
      <div className="locate__search">
        <label className="visually-hidden" htmlFor="city">
          City
        </label>
        <input
          id="city"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="city-options"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && results[active] ? `city-${results[active].slug}` : undefined}
          autoComplete="off"
          placeholder={onLocate ? 'or type a city…' : 'Type a city…'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {results.length > 0 && (
          <ul id="city-options" role="listbox" className="locate__options">
            {results.map((city, i) => (
              <li
                key={city.slug}
                id={`city-${city.slug}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onPick(city)
                }}
              >
                {city.name}, {countryName(city.country)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {failed && (
        <p className="passes__notice" role="status">
          The city list could not be loaded.{onLocate ? ' Try your location instead.' : ''}
        </p>
      )}
    </div>
  )
}
