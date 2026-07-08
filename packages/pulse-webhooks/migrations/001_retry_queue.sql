-- Table backing PostgresRetryQueue. `locked_until` doubles as the
-- multi-consumer dequeue lock and the crash-recovery visibility timeout:
-- a row whose lock has expired is eligible for redequeue by the next
-- consumer, mirroring RedisRetryQueue's in-flight visibility window.
CREATE TABLE IF NOT EXISTS pulse_webhook_retry_queue (
  id TEXT PRIMARY KEY,
  event JSONB NOT NULL,
  url TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  next_retry_at TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
);

-- Dequeue and eviction both scan/order by next_retry_at.
CREATE INDEX IF NOT EXISTS pulse_webhook_retry_queue_next_retry_at_idx
  ON pulse_webhook_retry_queue (next_retry_at);

-- Dequeue and size() both filter on lock state.
CREATE INDEX IF NOT EXISTS pulse_webhook_retry_queue_locked_until_idx
  ON pulse_webhook_retry_queue (locked_until);
