import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Watcher } from "@orbital-stellar/pulse-core";
import type { RetryQueue } from "../src/index.js";
import { WebhookDelivery } from "../src/index.js";

function makeRetryQueue(overrides: Partial<RetryQueue> = {}): RetryQueue {
  return {
    enqueue: vi.fn(),
    dequeue: vi.fn().mockResolvedValue(null),
    ack: vi.fn(),
    nack: vi.fn(),
    evictNewest: vi.fn().mockResolvedValue(null),
    size: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("WebhookDelivery.healthCheck()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is healthy when no retryQueue is configured", async () => {
    const watcher = new Watcher("GABC");
    const delivery = new WebhookDelivery(watcher, {
      url: "https://prod.example.com/webhooks/stellar",
      secret: "top-secret",
    });

    const result = await delivery.healthCheck();

    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("is healthy when the configured retryQueue's ping() resolves", async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const watcher = new Watcher("GABC");
    const delivery = new WebhookDelivery(watcher, {
      url: "https://prod.example.com/webhooks/stellar",
      secret: "top-secret",
      retryQueue: makeRetryQueue({ ping }),
    });

    const result = await delivery.healthCheck();

    expect(ping).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("flips to unhealthy when the retryQueue's ping() rejects", async () => {
    const ping = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const watcher = new Watcher("GABC");
    const delivery = new WebhookDelivery(watcher, {
      url: "https://prod.example.com/webhooks/stellar",
      secret: "top-secret",
      retryQueue: makeRetryQueue({ ping }),
    });

    const result = await delivery.healthCheck();

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["retryQueue: ECONNREFUSED"]);
  });

  it("is healthy when the retryQueue has no ping() implementation", async () => {
    const watcher = new Watcher("GABC");
    const delivery = new WebhookDelivery(watcher, {
      url: "https://prod.example.com/webhooks/stellar",
      secret: "top-secret",
      retryQueue: makeRetryQueue(),
    });

    const result = await delivery.healthCheck();

    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("reports unhealthy once stopped", async () => {
    const watcher = new Watcher("GABC");
    const delivery = new WebhookDelivery(watcher, {
      url: "https://prod.example.com/webhooks/stellar",
      secret: "top-secret",
    });

    delivery.stop();
    const result = await delivery.healthCheck();

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["webhook delivery is stopped"]);
  });
});
