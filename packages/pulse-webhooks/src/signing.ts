import { createHmac } from "crypto";

/**
 * Computes the HMAC-SHA256 signature `WebhookDelivery` sends as the
 * `x-orbital-signature` header, and that {@link verifyWebhookRaw} expects.
 * Exposed so callers that need to send or replay a webhook outside of
 * `WebhookDelivery` itself (the `orbital dlq replay` CLI, sample/demo
 * receivers) don't have to reimplement the signing scheme.
 */
export function signWebhookPayload(payload: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}
