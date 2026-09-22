/**
 * The way from the console to the pages that explain it.
 *
 * Nine readable pages exist beside the application — the station module by module, one per
 * subsystem with every channel explained, and how the numbers are made. They are rendered at build
 * time from the same declarations this page runs on (see scripts/build-pages.mjs), and a page
 * nobody links to is a page nobody finds: neither a reader nor a crawler. So the links live here,
 * at the foot of the side column, where they cost the console nothing above the fold and sit at
 * the natural end of the page on a phone.
 *
 * Plain anchors, not router links. The pages are separate documents, deliberately: they must read
 * without JavaScript, which is the whole point of them.
 */
const PAGES = [
  { href: '/passes/', label: 'When to see it' },
  { href: '/station/', label: 'The station, module by module' },
  { href: '/telemetry/power/', label: 'Power' },
  { href: '/telemetry/life-support/', label: 'Life support' },
  { href: '/telemetry/thermal/', label: 'Thermal' },
  { href: '/telemetry/attitude-and-orbit/', label: 'Attitude & orbit' },
  { href: '/telemetry/communications/', label: 'Communications' },
  { href: '/telemetry/command-and-data/', label: 'Command & data' },
  { href: '/about/', label: 'How it works' },
]

export function SiteFooter() {
  return (
    /*
     * A <nav>, not a <footer>. A footer nested inside <aside> maps to the generic role, on which
     * aria-label is prohibited — so the name was not exposed and axe flagged it. A list of links
     * to other pages is what <nav> is for, and it takes a name.
     */
    <nav className="app__footer" aria-label="Guide">
      <p className="app__footer-title">Read about it</p>
      <ul className="app__footer-links">
        {PAGES.map((page) => (
          <li key={page.href}>
            <a href={page.href}>{page.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
