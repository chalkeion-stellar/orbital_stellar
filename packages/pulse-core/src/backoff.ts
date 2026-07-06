// backoff.ts
// Shared full-jitter exponential backoff used by both the Horizon reconnect
// path (EventEngine) and the Soroban reconnect path (SorobanSubscriber).

export function fullJitterBackoffMs(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  const exponentialDelay = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
  return Math.floor(Math.random() * exponentialDelay);
}
