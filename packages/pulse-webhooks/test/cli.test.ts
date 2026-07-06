import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { listDLQ, dumpDLQ, replayDLQ } from "../src/cli.js";
import { MemoryDeadLetterStore } from "../src/MemoryDeadLetterStore.js";

const event = {
  type: "payment.received",
  to: "GDEST",
  from: "GSRC",
  amount: "10",
  asset: "XLM",
  timestamp: "2026-04-26T12:00:00.000Z",
  raw: { id: "evt_1" },
} as const;

describe("cli", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  describe("listDLQ", () => {
    it("prints matching entries as line-delimited JSON", async () => {
      const store = new MemoryDeadLetterStore();
      await store.record({ url: "https://a.example.com", event, error: "boom", attempts: 1 });
      await store.record({ url: "https://b.example.com", event, error: "boom", attempts: 1 });

      await listDLQ(store, { url: "https://a.example.com" });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const printed = JSON.parse(logSpy.mock.calls[0]![0] as string);
      expect(printed.url).toBe("https://a.example.com");
    });
  });

  describe("dumpDLQ", () => {
    it("prints every entry regardless of filter", async () => {
      const store = new MemoryDeadLetterStore();
      await store.record({ url: "https://a.example.com", event, error: "boom", attempts: 1 });
      await store.record({ url: "https://b.example.com", event, error: "boom", attempts: 1 });

      await dumpDLQ(store);

      expect(logSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("replayDLQ", () => {
    it("re-delivers the entry over HTTP via the configured replay handler and marks it replayed", async () => {
      const store = new MemoryDeadLetterStore();
      const id = await store.record({
        url: "https://example.com/webhook",
        event,
        error: "boom",
        attempts: 2,
      });

      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      store.setReplayHandler(async (entry) => {
        const res = await fetch(entry.url, {
          method: "POST",
          headers: { "x-orbital-signature": "sig", "x-orbital-timestamp": "123" },
          body: JSON.stringify(entry.event),
        });
        if (!(res as Response).ok) throw new Error("delivery failed");
      });

      await replayDLQ(store, id);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "x-orbital-signature": "sig" }),
        }),
      );
      expect(store.get(id)?.replayedAt).toBeTypeOf("number");
      expect(process.exitCode).toBeUndefined();

      vi.unstubAllGlobals();
    });

    it("reports an error and sets a nonzero exit code when the id is unknown", async () => {
      const store = new MemoryDeadLetterStore();

      await replayDLQ(store, "missing-id");

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("missing-id"));
      expect(process.exitCode).toBe(1);
    });

    it("reports an error and sets a nonzero exit code when no replay handler is configured", async () => {
      const store = new MemoryDeadLetterStore();
      const id = await store.record({
        url: "https://example.com/webhook",
        event,
        error: "boom",
        attempts: 1,
      });

      await replayDLQ(store, id);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Replay failed"));
      expect(process.exitCode).toBe(1);
    });
  });
});
