-- Three tables, and the third is the one that makes a per-minute cron work at all.
--
-- Each invocation opens its own session, so it always receives a snapshot: the server's memory of
-- every symbol, sent whatever the state of the broadcast. Within one run, a symbol's second update
-- is the first that proves the station spoke. Across runs, that test is unavailable — so `latest`
-- carries the last value seen from one invocation to the next, and a reading is only recorded when
-- it differs from it.
--
-- Without that table a dead broadcast would write the same value every minute for a week and look
-- like a busy sensor. That is exactly the illusion this whole exercise exists to avoid.

CREATE TABLE IF NOT EXISTS liveness (
  at       TEXT PRIMARY KEY,          -- ISO instant of the invocation
  state    TEXT    NOT NULL,          -- ok | no-session | error
  pushes   INTEGER NOT NULL,          -- updates beyond the first per symbol: the station talking
  symbols  INTEGER NOT NULL,          -- how many of the watched symbols answered at all
  moved    INTEGER NOT NULL,          -- how many changed against the previous invocation
  seconds  REAL    NOT NULL,          -- how long the session was listened to
  detail   TEXT                       -- error text, when there is one
);

CREATE TABLE IF NOT EXISTS readings (
  at    TEXT NOT NULL,
  pui   TEXT NOT NULL,
  what  TEXT NOT NULL,
  value TEXT NOT NULL,
  stamp TEXT,                         -- the station's own timestamp for the measurement
  PRIMARY KEY (at, pui)
);

CREATE INDEX IF NOT EXISTS readings_pui_at ON readings (pui, at);

CREATE TABLE IF NOT EXISTS latest (
  pui   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  stamp TEXT,
  at    TEXT NOT NULL
);
