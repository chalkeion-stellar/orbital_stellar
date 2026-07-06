import { describe, expect, it } from "vitest";

import { isEventType } from "../src/eventTypeGuard.js";
import type { NormalizedEvent } from "../src/index.js";

const paymentReceived: NormalizedEvent = {
  type: "payment.received",
  to: "GDEST",
  from: "GSRC",
  amount: "10",
  asset: "XLM",
  timestamp: "2026-04-26T12:00:00.000Z",
  raw: { id: "evt_1" },
} as unknown as NormalizedEvent;

const paymentSent: NormalizedEvent = {
  type: "payment.sent",
  to: "GDEST",
  from: "GSRC",
  amount: "10",
  asset: "XLM",
  timestamp: "2026-04-26T12:00:00.000Z",
  raw: { id: "evt_2" },
} as unknown as NormalizedEvent;

const accountCreated: NormalizedEvent = {
  type: "account.created",
  account: "GDEST",
  timestamp: "2026-04-26T12:00:00.000Z",
  raw: { id: "evt_3" },
} as unknown as NormalizedEvent;

describe("isEventType", () => {
  it("narrows to a single matching type", () => {
    expect(isEventType(paymentReceived, "payment.received")).toBe(true);
  });

  it("narrows to any of multiple provided types (OR match)", () => {
    expect(isEventType(paymentReceived, "payment.received", "payment.sent")).toBe(true);
    expect(isEventType(paymentSent, "payment.received", "payment.sent")).toBe(true);
  });

  it("returns false when the event type is not in the provided list", () => {
    expect(isEventType(accountCreated, "payment.received", "payment.sent")).toBe(false);
  });

  it("filters an array of events by type", () => {
    const events = [paymentReceived, accountCreated, paymentSent];
    const payments = events.filter((e) =>
      isEventType(e, "payment.received", "payment.sent", "payment.self"),
    );
    expect(payments).toEqual([paymentReceived, paymentSent]);
  });
});
