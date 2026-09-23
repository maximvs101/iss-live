/**
 * The site's navigation, once.
 *
 * Read by the pages rendered at build time (scripts/lib/render-pages.mjs imports this file
 * directly, as the scripts already import TypeScript) and by the console, which is a React
 * application: one list, so that a page added to one bar cannot be missing from the other.
 *
 * Five entries, not the nine the rendered pages carried: the six subsystems sit behind Systems,
 * which has its own page. Nine short links took three rows on a phone.
 */
export interface NavItem {
  href: string
  label: string
}

export const NAV: readonly NavItem[] = [
  { href: '/console/', label: 'Console' },
  { href: '/passes/', label: 'When to see it' },
  { href: '/station/', label: 'The station' },
  { href: '/telemetry/', label: 'Systems' },
  { href: '/about/', label: 'How it works' },
]

/**
 * `aria-current` for an entry: "page" on the page itself, "true" on a page inside the entry's
 * section — a subsystem page is not the Systems page, but it is where Systems leads.
 */
export function navState(path: string, href: string): 'page' | 'true' | undefined {
  if (path === href) return 'page'
  if (href === '/telemetry/' && path.startsWith('/telemetry/')) return 'true'
  return undefined
}
