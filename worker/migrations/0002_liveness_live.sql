-- The last minute the station pushed anything, read by /status for the home page. Partial, so the
-- read is one row however long the broadcast has been silent.
--
-- A migration of its own because schema.sql begins by dropping the tables: it builds a fresh
-- database, and running it against the live one erases the collector's whole record. Apply this
-- file, never that one, to the running database:
--   npx wrangler d1 execute iss-collector --remote --file migrations/0002_liveness_live.sql   (from worker/)
CREATE INDEX IF NOT EXISTS liveness_live ON liveness(at) WHERE pushes > 0;
