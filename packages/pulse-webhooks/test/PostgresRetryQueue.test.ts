import { describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@orbital-stellar/pulse-core";
import {
  PostgresRetryQueue,
  type PgLike,
  type PgQueryResult,
  type RetryRecord,
} from "../src/index.js";

/**
 * In-memory simulation of the `pulse_webhook_retry_queue` table, dispatching
 * on the distinguishing SQL fragments PostgresRetryQueue actually issues.
 * Mirrors RedisRetryQueue.test.ts's MockRedis: it re-implements the intended
 * row-selection semantics (including the SKIP LOCKED-equivalent "exclude
 * locked, unexpired rows" filter) so behavior is verified against real
 * query semantics, not just call recording. Row-level lock concurrency
 * itself can only be verified against a real Postgres instance.
 */
type Row = {
  id: string;
  event: string;
  url: string;
  attempt: number;
  next_retry_at: string;
  locked_until: string | null;
  last_error: string | null;
  created_at: string | null;
  metadata: string | null;
};

class MockPg implements PgLike {
  private readonly rows = new Map<string, Row>();

  async query<R = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<PgQueryResult<R>> {
    if (sql.startsWith("INSERT INTO")) {
      const [id, event, url, attempt, nextRetryAt, lastError, createdAt, metadata] = values as [
        string,
        string,
        string,
        number,
        string,
        string | null,
        string | null,
        string | null,
      ];
      this.rows.set(id, {
        id,
        event,
        url,
        attempt,
        next_retry_at: nextRetryAt,
        locked_until: null,
        last_error: lastError,
        created_at: createdAt,
        metadata,
      });
      return { rows: [] } as unknown as PgQueryResult<R>;
    }

    if (sql.includes("SET locked_until = $2")) {
      const [nowTs, lockedUntilTs] = values as [string, string];
      const row = [...this.rows.values()]
        .filter(
          (r) => r.next_retry_at <= nowTs && (r.locked_until === null || r.locked_until <= nowTs),
        )
        .sort((a, b) => (a.next_retry_at < b.next_retry_at ? -1 : 1))[0];
      if (!row) return { rows: [] } as unknown as PgQueryResult<R>;
      row.locked_until = lockedUntilTs;
      return { rows: [{ ...row }] } as unknown as PgQueryResult<R>;
    }

    if (sql.includes("SET next_retry_at = $2, locked_until = NULL")) {
      const [id, nextRetryAt] = values as [string, string];
      const row = this.rows.get(id);
      if (row) {
        row.next_retry_at = nextRetryAt;
        row.locked_until = null;
      }
      return { rows: [] } as unknown as PgQueryResult<R>;
    }

    if (sql.startsWith("DELETE FROM") && sql.includes("ORDER BY next_retry_at DESC")) {
      const row = [...this.rows.values()]
        .filter((r) => r.locked_until === null)
        .sort((a, b) => (a.next_retry_at > b.next_retry_at ? -1 : 1))[0];
      if (!row) return { rows: [] } as unknown as PgQueryResult<R>;
      this.rows.delete(row.id);
      return { rows: [{ ...row }] } as unknown as PgQueryResult<R>;
    }

    if (sql.startsWith("DELETE FROM")) {
      const [id] = values as [string];
      const existed = this.rows.delete(id);
      return { rows: [], rowCount: existed ? 1 : 0 } as unknown as PgQueryResult<R>;
    }

    if (sql.startsWith("SELECT COUNT(*)")) {
      const [nowTs] = values as [string];
      const count = [...this.rows.values()].filter(
        (r) => r.locked_until === null || r.locked_until <= nowTs,
      ).length;
      return { rows: [{ count: String(count) }] } as unknown as PgQueryResult<R>;
    }

    throw new Error(`MockPg: unrecognized query: ${sql}`);
  }
}

const event: NormalizedEvent = {
  type: "payment.received",
  to: "GDEST",
  from: "GSRC",
  amount: "10",
  asset: "XLM",
  timestamp: "2026-04-26T12:00:00.000Z",
  raw: { id: "evt_1" },
};

function retryRecord(overrides: Partial<RetryRecord> = {}): RetryRecord {
  return {
    id: "retry-1",
    event,
    url: "https://example.com/webhooks/stellar",
    attempt: 2,
    nextRetryAt: 1_000,
    lastError: "HTTP 503",
    ...overrides,
  };
}

describe("PostgresRetryQueue", () => {
  it("round-trips due records ordered by nextRetryAt", async () => {
    const queue = new PostgresRetryQueue(new MockPg());
    const first = retryRecord({ id: "retry-1", nextRetryAt: 1_000 });
    const second = retryRecord({ id: "retry-2", nextRetryAt: 500 });

    await queue.enqueue(first);
    await queue.enqueue(second);

    expect(await queue.size()).toBe(2);
    expect(await queue.dequeue(1_000)).toEqual(second);
    expect(await queue.dequeue(1_000)).toEqual(first);
    expect(await queue.dequeue(1_000)).toBeNull();
  });

  it("does not dequeue records before nextRetryAt", async () => {
    const queue = new PostgresRetryQueue(new MockPg());
    const record = retryRecord({ nextRetryAt: 2_000 });

    await queue.enqueue(record);

    expect(await queue.dequeue(1_999)).toBeNull();
    expect(await queue.size()).toBe(1);
    expect(await queue.dequeue(2_000)).toEqual(record);
  });

  it("does not redeliver a record that is already locked (dequeued) by another consumer", async () => {
    const queue = new PostgresRetryQueue(new MockPg());
    await queue.enqueue(retryRecord({ id: "only", nextRetryAt: 1_000 }));

    const firstConsumer = await queue.dequeue(1_000);
    const secondConsumer = await queue.dequeue(1_000);

    expect(firstConsumer?.id).toBe("only");
    expect(secondConsumer).toBeNull();
  });

  it("redelivers a locked record once its visibility timeout expires", async () => {
    const queue = new PostgresRetryQueue(new MockPg(), { visibilityTimeoutMs: 5_000 });
    await queue.enqueue(retryRecord({ id: "only", nextRetryAt: 1_000 }));

    expect((await queue.dequeue(1_000))?.id).toBe("only");
    expect(await queue.dequeue(1_000)).toBeNull();
    // Lock expires at 1_000 + 5_000 = 6_000.
    expect(await queue.dequeue(5_999)).toBeNull();
    expect((await queue.dequeue(6_000))?.id).toBe("only");
  });

  it("removes the record on ack", async () => {
    const queue = new PostgresRetryQueue(new MockPg());
    await queue.enqueue(retryRecord({ id: "only", nextRetryAt: 1_000 }));
    await queue.dequeue(1_000);

    await queue.ack("only");

    expect(await queue.size()).toBe(0);
    expect(await queue.dequeue(999_999)).toBeNull();
  });

  it("reschedules and unlocks the record on nack", async () => {
    // A fake `now` makes the rescheduled nextRetryAt deterministic.
    const queue = new PostgresRetryQueue(new MockPg(), { now: () => 1_000 });
    await queue.enqueue(retryRecord({ id: "only", nextRetryAt: 1_000 }));
    await queue.dequeue(1_000);

    await queue.nack("only", 500);

    expect(await queue.dequeue(1_499)).toBeNull();
    expect((await queue.dequeue(1_500))?.id).toBe("only");
  });

  it("evicts the newest scheduled retry, skipping locked (in-flight) records", async () => {
    const queue = new PostgresRetryQueue(new MockPg(), { now: () => 9_000 });
    const lockedNewest = retryRecord({ id: "locked-newest", nextRetryAt: 9_000 });
    await queue.enqueue(lockedNewest);
    await queue.dequeue(9_000); // locks "locked-newest" — it's the only ready record

    const oldest = retryRecord({ id: "oldest", nextRetryAt: 1_000 });
    const newest = retryRecord({ id: "newest", nextRetryAt: 5_000 });
    await queue.enqueue(oldest);
    await queue.enqueue(newest);

    // "locked-newest" has the globally highest nextRetryAt but is locked,
    // so eviction must fall through to the newest *unlocked* record.
    const evicted = await queue.evictNewest();

    expect(evicted?.id).toBe("newest");
    expect(await queue.size()).toBe(1); // "oldest" remains ready; "locked-newest" stays locked, excluded
  });

  it("size() excludes a locked record until its visibility timeout expires", async () => {
    let simulatedNow = 0;
    const queue = new PostgresRetryQueue(new MockPg(), {
      visibilityTimeoutMs: 1_000,
      now: () => simulatedNow,
    });
    await queue.enqueue(retryRecord({ id: "a", nextRetryAt: 0 }));
    await queue.dequeue(0); // locks "a" until 0 + 1_000 = 1_000

    expect(await queue.size()).toBe(0);

    simulatedNow = 1_000; // lock has now expired
    expect(await queue.size()).toBe(1);
  });

  it("rejects a record without an id", async () => {
    const queue = new PostgresRetryQueue(new MockPg());
    await expect(queue.enqueue(retryRecord({ id: "" }))).rejects.toThrow(
      "RetryRecord.id is required",
    );
  });

  it("rejects a record with a non-finite nextRetryAt", async () => {
    const queue = new PostgresRetryQueue(new MockPg());
    await expect(queue.enqueue(retryRecord({ nextRetryAt: NaN }))).rejects.toThrow(
      "RetryRecord.nextRetryAt must be a finite timestamp",
    );
  });

  it("round-trips lastError, createdAt, and metadata", async () => {
    const queue = new PostgresRetryQueue(new MockPg());
    const record = retryRecord({
      id: "full",
      lastError: "HTTP 500",
      createdAt: 123,
      metadata: { region: "us-east" },
    });

    await queue.enqueue(record);
    const dequeued = await queue.dequeue(1_000);

    expect(dequeued).toEqual(record);
  });
});
