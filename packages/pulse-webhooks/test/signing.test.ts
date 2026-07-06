import { describe, expect, it } from "vitest";

import { signWebhookPayload } from "../src/signing.js";
import { verifyWebhookRaw } from "../src/index.js";

describe("signWebhookPayload", () => {
  it("round-trips against verifyWebhookRaw", () => {
    const payload = JSON.stringify({ type: "payment.received", amount: "10" });
    const secret = "whsec_test_signing";
    const timestamp = Date.now().toString();

    const signature = signWebhookPayload(payload, timestamp, secret);

    expect(verifyWebhookRaw(payload, signature, secret, timestamp)).toBe(true);
  });

  it("produces a different signature for a different secret", () => {
    const payload = '{"type":"ping"}';
    const timestamp = "1717000000000";

    const signatureA = signWebhookPayload(payload, timestamp, "secret-a");
    const signatureB = signWebhookPayload(payload, timestamp, "secret-b");

    expect(signatureA).not.toBe(signatureB);
    expect(
      verifyWebhookRaw(payload, signatureA, "secret-b", timestamp, { nowMs: 1717000000000 }),
    ).toBe(false);
  });

  it("pins the HMAC-SHA256 over `${timestamp}.${payload}` format (ADR-003)", () => {
    expect(
      signWebhookPayload('{"type":"ping"}', "1717000000000", "whsec_test_regression_fixture"),
    ).toBe("9c79798b9fb0e2bf9da3c5f0bb8d36977d013f8ed0fe9837cc8a9d3c1017c6c0");
  });
});
