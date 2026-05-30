import { useState, useEffect } from "react";
export { useStellarEventSuspense } from "./useStellarEventSuspense.js";
import type { NormalizedEvent } from "@orbital/pulse-core";

export type UseEventConfig = {
  serverUrl: string;
  address: string;
  event?: string | string[]; // "*" = all events; array = allowlist of types
  /** API key forwarded as ?token= query param — required when the server has authentication enabled */
  token?: string;
};

export type EventState<T extends NormalizedEvent = NormalizedEvent> = {
  event: T | null;
  connected: boolean;
  error: string | null;
};

export function useStellarEvent<T extends NormalizedEvent = NormalizedEvent>(
  config: UseEventConfig
): EventState<T>;
export function useStellarEvent<T extends NormalizedEvent = NormalizedEvent>(
  serverUrl: string,
  address: string,
  options?: Pick<UseEventConfig, "event" | "token">
): EventState<T>;
export function useStellarEvent<T extends NormalizedEvent = NormalizedEvent>(
  configOrUrl: UseEventConfig | string,
  address?: string,
  options?: Pick<UseEventConfig, "event" | "token">
): EventState<T> {
  // Normalise the two call signatures down to four primitives.
  const serverUrl =
    typeof configOrUrl === "string" ? configOrUrl : configOrUrl.serverUrl;
  const addr =
    typeof configOrUrl === "string" ? address! : configOrUrl.address;
  const eventType: string | string[] =
    typeof configOrUrl === "string"
      ? options?.event ?? "*"
      : configOrUrl.event ?? "*";
  const token =
    typeof configOrUrl === "string"
      ? options?.token
      : configOrUrl.token;

  // Serialise eventType to a stable string for the dep array.
  // An array literal passed by the caller would otherwise be a new reference
  // every render and re-run the effect continuously.
  const eventKey = Array.isArray(eventType)
    ? [...eventType].sort().join(",")
    : eventType;

  const [state, setState] = useState<EventState<T>>({
    event: null,
    connected: false,
    error: null,
  });

  useEffect(() => {
    const base = `${serverUrl}/events/${addr}`;
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;

    const source = new EventSource(url);

    source.onopen = () => {
      setState((prev) => ({ ...prev, connected: true, error: null }));
    };

    source.onmessage = (e) => {
      try {
        const incoming: NormalizedEvent = JSON.parse(e.data);

        // Filter by event type: pass if "*", if type matches the string,
        // or if type is included in the allowlist array.
        const allowed =
          eventType === "*" ||
          (Array.isArray(eventType)
            ? eventType.includes(incoming.type)
            : incoming.type === eventType);

        if (!allowed) return;

        setState((prev) => ({ ...prev, event: incoming as T }));
      } catch {
        setState((prev) => ({ ...prev, error: "Failed to parse event" }));
      }
    };

    source.onerror = () => {
      setState((prev) => ({
        ...prev,
        connected: false,
        error: "Connection lost — retrying...",
      }));
    };

    return () => {
      source.close();
    };
    // ✅ eventKey is a serialised string — stable even when the caller passes
    // an array literal, which would otherwise be a new reference every render.
  }, [serverUrl, addr, eventKey, token]);

  return state;
}

export type PaymentState = EventState<
  Extract<NormalizedEvent, { type: "payment.received" }>
> & {
  /**
   * The payment amount expressed in stroops (1 XLM = 10,000,000 stroops) as a
   * `bigint`, or `null` when no event has arrived yet.
   *
   * Computed from `event.amount` without floating-point arithmetic so it is
   * safe for all amounts representable on the Stellar network.
   *
   * @example
   * const { amountStroop } = useStellarPayment(serverUrl, address);
   * if (amountStroop !== null) {
   *   console.log(`Received ${amountStroop} stroops`);
   * }
   */
  amountStroop: bigint | null;
};

/**
 * Converts a Stellar decimal amount string (e.g. "12.3456789") to stroops
 * (integer, 7 decimal places) as a bigint.
 *
 * Avoids floating-point arithmetic by splitting on "." and padding/truncating
 * the fractional part to exactly 7 digits before combining.
 *
 * Returns `null` if the string is not a valid non-negative decimal number.
 */
function amountToStroop(amount: string): bigint | null {
  // Accept only strings that look like a non-negative decimal number.
  if (!/^\d+(\.\d+)?$/.test(amount)) return null;

  const [whole, frac = ""] = amount.split(".");
  // Pad or truncate the fractional part to exactly 7 digits.
  const fracPadded = frac.slice(0, 7).padEnd(7, "0");

  try {
    return BigInt(whole) * 10_000_000n + BigInt(fracPadded);
  } catch {
    return null;
  }
}

export function useStellarPayment(
  serverUrl: string,
  address: string
): PaymentState {
  const state = useStellarEvent<
    Extract<NormalizedEvent, { type: "payment.received" }>
  >(serverUrl, address, { event: "payment.received" });

  const amountStroop =
    state.event !== null ? amountToStroop(state.event.amount) : null;

  return { ...state, amountStroop };
}

export function useStellarActivity(serverUrl: string, address: string) {
  return useStellarEvent(serverUrl, address, { event: "*" });
}
