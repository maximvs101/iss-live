-- Two tables and one row per invocation, because D1's free plan allows 100,000 row writes a day.
--
-- The first design wrote a row per changed symbol plus a row for liveness. With a dead broadcast
-- that costs almost nothing, which is exactly why it looked fine: nothing was changing. Live, the
-- eighteen joint angles move every minute by design, and 1440 × (1 + 27 × 2) is 79,200 writes a day
-- against a limit of 100,000 — and past that limit D1 refuses queries until midnight UTC. The
-- collection would have stopped silently, mid-week, at the moment the data became worth having.
--
-- So the changed values travel as one JSON column on the liveness row, and the carried-over state
-- is a single row rewritten in place. Two writes and one read per invocation: about 2,900 writes a
-- day, thirty times under the ceiling. JSON is less tidy than columns and entirely queryable
-- through json_extract, which is a good trade for not losing the week.

-- `IF NOT EXISTS` does not reconcile a table that already exists with a changed definition — it
-- skips it in silence, and the first insert then fails on a missing column. That is how this file
-- was applied cleanly and the Worker still returned 500s. The drops are explicit for that reason:
-- adding a column here means adding its table to the list, or migrating it by hand.
DROP TABLE IF EXISTS readings;
DROP TABLE IF EXISTS latest;
DROP TABLE IF EXISTS liveness;

CREATE TABLE IF NOT EXISTS liveness (
  at       TEXT PRIMARY KEY,          -- ISO instant of the invocation
  state    TEXT    NOT NULL,          -- ok | error
  pushes   INTEGER NOT NULL,          -- updates beyond the first per symbol: the station talking
  symbols  INTEGER NOT NULL,          -- how many of the watched symbols answered at all
  moved    INTEGER NOT NULL,          -- how many changed against the previous invocation
  seconds  REAL    NOT NULL,          -- how long the session was listened to
  changed  TEXT,                      -- JSON {pui: value} of what moved, null when nothing did
  stamps   TEXT,                      -- JSON {pui: onboard timestamp} for the same symbols
  detail   TEXT                       -- error text, when there is one
);

-- Exactly one row, rewritten each invocation: the last value seen for every watched symbol.
-- Without it a per-minute cron cannot tell a value that never changed from one it saw for the
-- first time, since each invocation opens its own session and gets its own snapshot.
-- `held`, not `values`: the latter is a reserved word in SQLite and fails to parse unquoted.
CREATE TABLE IF NOT EXISTS carried (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  held TEXT NOT NULL,                 -- JSON {pui: value}
  at   TEXT NOT NULL
);
