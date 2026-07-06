import type { MemoryDeadLetterStore } from "./MemoryDeadLetterStore.js";
import type { DeadLetterFilter } from "./DeadLetterStore.js";

/**
 * List DLQ entries with optional filters and output each as a line‑delimited JSON string.
 */
export async function listDLQ(
  store: MemoryDeadLetterStore,
  options: { url?: string; since?: string; limit?: number },
): Promise<void> {
  const filter: DeadLetterFilter = {};
  if (options.url) filter.url = options.url;
  if (options.since) {
    const ms = Date.parse(options.since);
    if (!Number.isNaN(ms)) filter.since = ms;
  }
  if (options.limit !== undefined) filter.limit = options.limit;

  const entries = await store.list(filter);
  for (const e of entries) {
    console.log(JSON.stringify(e));
  }
}

/** Dump all DLQ entries as line‑delimited JSON. */
export async function dumpDLQ(store: MemoryDeadLetterStore): Promise<void> {
  const entries = await store.list();
  for (const e of entries) {
    console.log(JSON.stringify(e));
  }
}

/**
 * Replay a DLQ entry by id: re-delivers it through the store's configured
 * {@link ReplayHandler} (set via {@link MemoryDeadLetterStore.setReplayHandler}),
 * which actually re-sends the webhook, and marks the entry `replayedAt` on success.
 */
export async function replayDLQ(store: MemoryDeadLetterStore, id: string): Promise<void> {
  const entry = store.get(id);
  if (!entry) {
    console.error(`DLQ entry with id ${id} not found`);
    process.exitCode = 1;
    return;
  }

  try {
    await store.replay(id);
    console.log(JSON.stringify(store.get(id)));
  } catch (err) {
    console.error(`Replay failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
