export type Span = {
  setAttribute(key: string, value: string | number | boolean): void;
  end(): void;
};

export type Tracer = {
  startSpan(name: string, attrs?: Record<string, string | number | boolean>): Span;
};

/** Outcome of a single delivery attempt. */
export type WebhookAttemptStatus = "success" | "failure";

/** Final outcome of a delivery after all attempts/retries are resolved. */
export type WebhookTerminalOutcome = "success" | "failure" | "dropped";

export type WebhookMetrics = {
  recordAttempt(
    url: string,
    attempt: number,
    durationMs: number,
    status: WebhookAttemptStatus,
  ): void;
  recordTerminal(url: string, outcome: WebhookTerminalOutcome): void;
};

export type WebhookConfig = {
  url: string | string[];
  secret: string;
  retries?: number;
  deliveryTimeoutMs?: number;

  maxConcurrentDeliveries?: number;
};
