// packages/pulse-webhooks/test/SqsRetryQueue.test.ts

import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@orbital-stellar/pulse-core";
import { SqsRetryQueue, type SqsLike, type RetryRecord } from "../src/index.js";

// Simple in‑memory mock of SqsLike
class MockSqs implements SqsLike {
  private queue: { id: string; body: string; receipt: string; delayUntil: number }[] = [];
  private receiptCounter = 0;

  async sendMessage(params: any): Promise<void> {
    const receipt = `receipt-${this.receiptCounter++}`;
    const now = Date.now();
    const delay = (params.DelaySeconds ?? 0) * 1000;
    this.queue.push({
      id: params.MessageDeduplicationId ?? "",
      body: params.MessageBody,
      receipt,
      delayUntil: now + delay,
    });
  }

  async receiveMessage(params: any): Promise<any[]> {
    const now = Date.now();
    const idx = this.queue.findIndex((m) => now >= m.delayUntil);
    if (idx === -1) return [];
    const msg = this.queue[idx];
    const visibilityMs = (params.VisibilityTimeout ?? 0) * 1000;
    if (visibilityMs > 0) {
      msg.delayUntil = now + visibilityMs;
    }
    return [{ MessageId: msg.id, ReceiptHandle: msg.receipt, Body: msg.body }];
  }

  async deleteMessage(params: any): Promise<void> {
    this.queue = this.queue.filter((m) => m.receipt !== params.ReceiptHandle);
  }

  async size(): Promise<number> {
    return this.queue.length;
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
    nextRetryAt: 1000,
    ...overrides,
  } as any;
}

describe("SqsRetryQueue", () => {
  it("round‑trips a record", async () => {
    const queue = new SqsRetryQueue(new MockSqs(), {
      queueUrl: "https://sqs.fake/queue.fifo",
      deliveryInstanceId: "inst-1",
    });
    const rec = retryRecord();
    await queue.enqueue(rec);
    expect(await queue.size()).toBe(1);
    const dequeued = await queue.dequeue();
    expect(dequeued).toEqual(rec);
    await queue.ack(rec.id);
    expect(await queue.size()).toBe(0);
  });

  it("nack requeues with delay", async () => {
    let now = Date.now();
    const mock = new MockSqs();
    const queue = new SqsRetryQueue(mock, {
      queueUrl: "https://sqs.fake/queue.fifo",
      deliveryInstanceId: "inst-1",
      now: () => now,
    });
    const rec = retryRecord({ id: "rec-nack", nextRetryAt: now });
    await queue.enqueue(rec);
    const first = await queue.dequeue();
    expect(first?.id).toBe("rec-nack");
    await queue.nack(rec.id, 500);
    now += 400;
    expect(await queue.dequeue()).toBeNull();
    now += 200;
    const later = await queue.dequeue();
    expect(later?.id).toBe("rec-nack");
  });

  it("size works with mock client", async () => {
    const mock = new MockSqs();
    const queue = new SqsRetryQueue(mock, {
      queueUrl: "https://sqs.fake/queue.fifo",
      deliveryInstanceId: "inst-1",
    });
    expect(await queue.size()).toBe(0);
    await queue.enqueue(retryRecord({ id: "a" }));
    await queue.enqueue(retryRecord({ id: "b" }));
    expect(await queue.size()).toBe(2);
  });
});
