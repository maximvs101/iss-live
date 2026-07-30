/**
 * Where every number on screen comes from.
 *
 * Deliberately out of the way: a small link in the header, and a modal that only exists once
 * someone asks for it. Nobody arrives at a tracking page wanting a bibliography — but an
 * application that asserts a cabin pressure or an orbital position owes an answer to "says who?",
 * and burying that answer in a repository nobody will read is not an answer.
 *
 * Built on the native `<dialog>` element, which brings focus trapping, Escape-to-close and an
 * inert backdrop without a line of code for any of them.
 */
import { useEffect, useRef, useState } from 'react'
import { CODE, DATA, EXTERNAL_LINK, type Source } from './sources'

export function SourcesDialog() {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  // `open` as an attribute renders the dialog non-modal; `showModal()` is what gives the backdrop
  // and the focus trap, so the element is driven imperatively from React state rather than bound.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <>
      <button type="button" className="sources__open" onClick={() => setOpen(true)}>
        Sources
      </button>

      <dialog
        ref={dialog}
        className="sources"
        onClose={() => setOpen(false)}
        // Clicking the backdrop lands on the dialog element itself, never on its contents.
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false)
        }}
      >
        <div className="sources__body">
          <header className="sources__header">
            <h2>Where this comes from</h2>
            <button type="button" className="sources__close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>

          <p className="sources__intro">
            Everything here is public and fetched by your own browser. There is no server in
            between, nothing is stored anywhere, and no value is ever invented: when a parameter has
            not been transmitted, it is shown as missing rather than as a zero.
          </p>

          <h3 className="sources__group">Data</h3>
          <SourceList sources={DATA} />

          <h3 className="sources__group">Computation</h3>
          <SourceList sources={CODE} />

          <p className="sources__footnote">
            Telemetry symbol identifiers and their descriptions come from <code>PUIList.xml</code>,
            shipped with the Lightstreamer reference client — 298 public symbols across 15 flight
            control disciplines.
          </p>
        </div>
      </dialog>
    </>
  )
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className="sources__list">
      {sources.map((source) => (
        <li key={source.name}>
          <a href={source.href} {...EXTERNAL_LINK}>
            {source.name}
          </a>
          <span className="sources__used">{source.used}</span>
          <span className="sources__note">{source.note}</span>
        </li>
      ))}
    </ul>
  )
}
