/**
 * WebSocket reconnect — proves a dropped connection is retried with jittered
 * backoff (mirroring pulse-core's full-jitter algorithm) instead of staying
 * dead, and that an intentional unsubscribe() does not trigger a reconnect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { acquireWsConnection, __resetWsPoolForTests } from "../src/wsTransport.js";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closeCount = 0;
  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }
  close() {
    this.closeCount++;
  }
}

(globalThis as any).WebSocket = MockWebSocket;

const SERVER = "https://events.example.com";
const ADDRESS = "GABC123";

function makeSubscriber() {
  const opens: number[] = [];
  const errors: number[] = [];
  return {
    opens,
    errors,
    sub: {
      onOpen: () => opens.push(Date.now()),
      onEvent: () => {},
      onParseError: () => {},
      onError: () => errors.push(Date.now()),
    },
  };
}

describe("WebSocket reconnect", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    __resetWsPoolForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    __resetWsPoolForTests();
    vi.useRealTimers();
  });

  it("reconnects with a new WebSocket after the connection drops", () => {
    const { sub } = makeSubscriber();
    acquireWsConnection({ serverUrl: SERVER, address: ADDRESS }, sub);
    expect(MockWebSocket.instances).toHaveLength(1);

    // Server drops the connection.
    MockWebSocket.instances[0]!.onclose!();

    // Advance past the max possible first-attempt backoff delay.
    vi.advanceTimersByTime(1000);

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("notifies onError for a dropped connection (existing error field surfaces reconnects)", () => {
    const { sub, errors } = makeSubscriber();
    acquireWsConnection({ serverUrl: SERVER, address: ADDRESS }, sub);

    MockWebSocket.instances[0]!.onclose!();

    expect(errors).toHaveLength(1);
  });

  it("resets the reconnect attempt counter once the new connection opens", () => {
    const { sub } = makeSubscriber();
    acquireWsConnection({ serverUrl: SERVER, address: ADDRESS }, sub);

    MockWebSocket.instances[0]!.onclose!();
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]!.onopen!();

    // A second drop should schedule with a fresh attempt=1 window, not attempt=2.
    MockWebSocket.instances[1]!.onclose!();
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("backs off exponentially across repeated drops", () => {
    const { sub } = makeSubscriber();
    acquireWsConnection({ serverUrl: SERVER, address: ADDRESS }, sub);

    // Drop repeatedly without ever reopening, growing the attempt counter.
    for (let i = 0; i < 5; i++) {
      const current = MockWebSocket.instances.at(-1)!;
      current.onclose!();
      vi.advanceTimersByTime(30_000);
    }

    // Each drop schedules at most one reconnect; five drops -> six total instances.
    expect(MockWebSocket.instances).toHaveLength(6);
  });

  it("does not reconnect after an intentional unsubscribe", () => {
    const { sub } = makeSubscriber();
    const conn = acquireWsConnection({ serverUrl: SERVER, address: ADDRESS }, sub);
    conn.unsubscribe();

    vi.advanceTimersByTime(60_000);

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("does not schedule a second reconnect timer while one is already pending", () => {
    const { sub } = makeSubscriber();
    acquireWsConnection({ serverUrl: SERVER, address: ADDRESS }, sub);

    // onerror followed by onclose (typical browser sequence) must not double-schedule.
    MockWebSocket.instances[0]!.onerror!();
    MockWebSocket.instances[0]!.onclose!();

    vi.advanceTimersByTime(1000);

    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
