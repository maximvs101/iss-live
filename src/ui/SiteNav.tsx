/**
 * The site's bar, in the console.
 *
 * The same list as every rendered page (src/site/nav.ts); it replaces the title that stood alone at
 * the head of the console, so the pages that explain it are one click away instead of a panel below
 * the fold — "Read about it" sat at the foot of the side column, out of sight on an ordinary screen.
 */
import { NAV, navState } from '../site/nav.ts'

export function SiteNav({ path }: { path: string }) {
  return (
    <nav className="app__nav" aria-label="Site">
      <a className="app__nav-brand" href="/">
        ISS Live
      </a>
      <ul className="app__nav-links">
        {NAV.map((item) => (
          <li key={item.href}>
            <a href={item.href} aria-current={navState(path, item.href)}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
