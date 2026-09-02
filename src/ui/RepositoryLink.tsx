/**
 * The way out to the source, in the corner of the header.
 *
 * An application that asserts a cabin pressure owes an answer to "says who?", and the Sources
 * dialog beside this one gives it for the *data*. This gives it for the *code*: every number on
 * screen is computed by something, and the reader is one click from reading it.
 *
 * A mark rather than a word, and the only one on the page. The header is the tightest row in the
 * layout — it carries the position, the stream's health and the view switch, and below 700 px it
 * is rebuilt in four rows, the fourth of them the price of adding this one mark to the row of
 * controls. A word beside it would cost that again, and a repository mark is one of the few icons
 * that needs no legend.
 */
import { EXTERNAL_LINK } from './sources'

/**
 * Written out rather than read from the git remote.
 *
 * The remote is a build-machine fact and this is a published address: they happen to agree today,
 * and the one the reader clicks should not depend on where the site was built from.
 */
const REPOSITORY = 'https://github.com/maximvs101/iss-live'

export function RepositoryLink() {
  return (
    <a
      className="app__repo"
      href={REPOSITORY}
      // The name is on the link, not in the drawing: `aria-hidden` on the mark keeps a screen
      // reader from reading a path element's alt-less silence and leaves it one clear label.
      aria-label="Source code on GitHub"
      title="Source code on GitHub"
      {...EXTERNAL_LINK}
    >
      {/* GitHub's own mark, at the 16-unit size it is drawn for, scaled by the box around it. */}
      <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    </a>
  )
}
