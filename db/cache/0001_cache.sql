-- Separate from saved-calendar PostgreSQL migrations. Apply only to an isolated
-- D1 database after production approval (docs/cloudflare-operations.md).
CREATE TABLE IF NOT EXISTS cache_entries (
  slot INTEGER PRIMARY KEY CHECK(slot >= 0 AND slot < 512),
  cache_key TEXT NOT NULL,
  payload TEXT,
  fetched_at INTEGER NOT NULL DEFAULT 0,
  changed_at INTEGER NOT NULL DEFAULT 0,
  fresh_until INTEGER NOT NULL DEFAULT 0,
  stale_until INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS upstream_budget (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  budget_day INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO upstream_budget(id, budget_day) VALUES(1, -1);
CREATE TABLE IF NOT EXISTS upstream_permits (
  slot INTEGER PRIMARY KEY CHECK(slot >= 0 AND slot < 4),
  token TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO upstream_permits(slot) VALUES(0), (1), (2), (3);
CREATE TABLE IF NOT EXISTS public_admissions (
  action TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  window_id INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY(action,bucket)
);
