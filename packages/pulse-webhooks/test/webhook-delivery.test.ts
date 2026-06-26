import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEvent, Watcher } from "@orbital/pulse-core";
import { WebhookDelivery } from "../src/index.js";

function makeWatcher(): Watcher & { emit: (type: string, event: NormalizedEvent) => void } {
  const listeners: Record<string, ((e: NormalizedEvent) => void)[]> = {};
  const stopHandlers: (() => void)[] = [];
  return {
    stopped: false,
    on(type: string, cb: (e: NormalizedEvent) => void) {
      (listeners[type] ??= []).push(cb);
    },
    emit(type: string, event: NormalizedEvent) {
      for (const cb of listeners[type] ?? []) cb(event);
      for (const cb of listeners["*"] ?? []) cb(event);
    },
    addStopHandler(fn: () => void) { stopHandlers.push(fn); },
    stop() { (this as { stopped: boolean }).stopped = true; stopHandlers.forEach(fn => fn()); },
  } as unknown as Watcher & { emit: (type: string, event: NormalizedEvent) => void };
}

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    type: "payment.received",
    to: "GDEST",
    from: "GSRC",
    amount: "10",
    asset: "XLM",
    timestamp: "2026-01-01T00:00:00.000Z",
    raw: {},
    ...overrides,
  } as NormalizedEvent;
}

describe("WebhookDelivery backpressure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits webhook.backpressure when concurrent deliveries exceed maxConcurrentDeliveries", async () => {
    const watcher = makeWatcher();
    const backpressureEvents: NormalizedEvent[] = [];

    // Capture backpressure events before WebhookDelivery registers its wildcard listener
    watcher.on("webhook.backpressure", (e) => backpressureEvents.push(e));

    // fetch never resolves so all deliveries stay in-flight
    vi.stubGlobal("fetch", () => new Promise(() => {}));

    new WebhookDelivery(watcher, {
      url: "https://example.com/hook",
      secret: "secret",
      maxConcurrentDeliveries: 2,
    });

    watcher.emit("payment.received", makeEvent());
    watcher.emit("payment.received", makeEvent());
    // These two should be in-flight now (activeDeliveries === 2)
    watcher.emit("payment.received", makeEvent()); // overflow → backpressure

    expect(backpressureEvents).toHaveLength(1);
  });

  it("accepts new deliveries once a slot frees up", async () => {
    const watcher = makeWatcher();

    let resolveFirst!: () => void;
    let callCount = 0;

    vi.stubGlobal("fetch", () => {
      callCount++;
      if (callCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirst = () => resolve(new Response(null, { status: 200 }));
        });
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    new WebhookDelivery(watcher, {
      url: "https://example.com/hook",
      secret: "secret",
      maxConcurrentDeliveries: 1,
    });

    watcher.emit("payment.received", makeEvent()); // slot taken
    watcher.emit("payment.received", makeEvent()); // overflows → backpressure (ignored here)

    // Free the slot
    resolveFirst();
    await vi.runAllTimersAsync();

    const fetchCallsBefore = callCount;
    watcher.emit("payment.received", makeEvent()); // should go through now
    await vi.runAllTimersAsync();

    expect(callCount).toBeGreaterThan(fetchCallsBefore);
  });
});
