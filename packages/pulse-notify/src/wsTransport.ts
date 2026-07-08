import type { NormalizedEvent } from "@orbital-stellar/pulse-core";
import type { WsConnectionKey, WsConnectionSubscriber } from "./connectionTypes.js";

// Mirrors the full-jitter exponential backoff formula in
// packages/pulse-core/src/backoff.ts (used for the Horizon/Soroban reconnect
// paths). Duplicated here rather than imported since pulse-core does not
// expose it as a public export and WebSocket reconnect is a browser-only
// concern specific to this package.
function fullJitterBackoffMs(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
  return Math.floor(Math.random() * exponentialDelay);
}

const RECONNECT_INITIAL_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

type WsEntry = {
  ws: WebSocket;
  subscribers: Set<WsConnectionSubscriber>;
  connected: boolean;
  reconnectAttempt: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  /** Set once `unsubscribe()` has closed the pool entry intentionally, to stop further reconnects. */
  closedByClient: boolean;
};

const pool = new Map<string, WsEntry>();

function getKey({ serverUrl, address, token }: WsConnectionKey): string {
  return JSON.stringify([serverUrl, address, token ?? ""]);
}

function getWsUrl({ serverUrl, address, token }: WsConnectionKey): string {
  const base = serverUrl.replace(/^http/, "ws") + `/events/${address}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function notify(entry: WsEntry, fn: (s: WsConnectionSubscriber) => void) {
  for (const s of [...entry.subscribers]) fn(s);
}

/** Schedules a jittered-backoff reconnect unless the entry was closed intentionally or has no subscribers left. */
function scheduleReconnect(poolKey: string, key: WsConnectionKey, entry: WsEntry): void {
  if (entry.closedByClient || entry.subscribers.size === 0) return;
  if (entry.reconnectTimer !== undefined) return;

  entry.reconnectAttempt += 1;
  const delayMs = fullJitterBackoffMs(
    entry.reconnectAttempt,
    RECONNECT_INITIAL_DELAY_MS,
    RECONNECT_MAX_DELAY_MS,
  );

  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = undefined;
    if (entry.closedByClient || entry.subscribers.size === 0) return;
    entry.ws = new WebSocket(getWsUrl(key));
    attachHandlers(entry.ws, poolKey, key, entry);
  }, delayMs);
}

function attachHandlers(
  ws: WebSocket,
  poolKey: string,
  key: WsConnectionKey,
  entry: WsEntry,
): void {
  ws.onopen = () => {
    entry.connected = true;
    entry.reconnectAttempt = 0;
    notify(entry, (s) => s.onOpen());
  };

  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data as string);
      if (data && typeof data === "object" && data.type === "auth_expired") {
        entry.connected = false;
        notify(entry, (s) => s.onAuthExpired?.());
        return;
      }
      const event = data as NormalizedEvent;
      notify(entry, (s) => s.onEvent(event));
    } catch {
      notify(entry, (s) => s.onParseError());
    }
  };

  ws.onerror = () => {
    entry.connected = false;
    notify(entry, (s) => s.onError());
  };

  ws.onclose = () => {
    entry.connected = false;
    notify(entry, (s) => s.onError());
    scheduleReconnect(poolKey, key, entry);
  };
}

export function acquireWsConnection(key: WsConnectionKey, subscriber: WsConnectionSubscriber) {
  const poolKey = getKey(key);
  let entry = pool.get(poolKey);

  if (!entry) {
    const ws = new WebSocket(getWsUrl(key));
    const newEntry: WsEntry = {
      ws,
      subscribers: new Set(),
      connected: false,
      reconnectAttempt: 0,
      closedByClient: false,
    };
    attachHandlers(ws, poolKey, key, newEntry);

    pool.set(poolKey, newEntry);
    entry = newEntry;
  }

  entry.subscribers.add(subscriber);

  return {
    get connected() {
      return entry.connected;
    },
    unsubscribe: () => {
      entry.subscribers.delete(subscriber);
      if (entry.subscribers.size === 0) {
        entry.closedByClient = true;
        if (entry.reconnectTimer !== undefined) {
          clearTimeout(entry.reconnectTimer);
          entry.reconnectTimer = undefined;
        }
        entry.ws.close();
        pool.delete(poolKey);
      }
    },
  };
}

export function __getWsPoolSizeForTests() {
  return pool.size;
}

export function __resetWsPoolForTests() {
  for (const entry of pool.values()) {
    entry.closedByClient = true;
    if (entry.reconnectTimer !== undefined) clearTimeout(entry.reconnectTimer);
    entry.ws.close();
  }
  pool.clear();
}
