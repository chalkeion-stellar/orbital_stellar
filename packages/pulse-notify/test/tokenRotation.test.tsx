import { useState } from "react";
import { render, act, cleanup } from "@testing-library/react";
import { afterEach, expect, test, describe, vi } from "vitest";
import {
  __getConnectionPoolSizeForTests,
  __resetConnectionPoolForTests,
} from "../src/connectionPool.ts";
import { useStellarEvent, useContractEvent } from "../src/index.ts";

class MockEventSource {
  static instances: MockEventSource[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  closeCount = 0;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }

  close() {
    this.closeCount++;
  }

  emit(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

afterEach(() => {
  __resetConnectionPoolForTests();
  MockEventSource.instances = [];
  cleanup();
  vi.restoreAllMocks();
});

describe("Token Rotation - useStellarEvent", () => {
  function TestComponent({
    token,
    tokenProvider,
  }: {
    token?: string;
    tokenProvider?: () => Promise<string>;
  }) {
    const { connected, error } = useStellarEvent({
      serverUrl: "https://events.example.com",
      address: "GABC",
      token,
      tokenProvider,
    });
    return (
      <div>
        <div data-testid="connected">{connected ? "true" : "false"}</div>
        <div data-testid="error">{error ?? "none"}</div>
      </div>
    );
  }

  test("surfaces 'token expired' error if auth_expired occurs without tokenProvider", async () => {
    const { getByTestId, findByText } = render(<TestComponent token="old-token" />);

    await findByText("true", { selector: '[data-testid="connected"]' });
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain("token=old-token");

    act(() => {
      MockEventSource.instances[0].emit({ type: "auth_expired" });
    });

    expect(getByTestId("connected").textContent).toBe("false");
    expect(getByTestId("error").textContent).toBe("token expired");
  });

  test("calls tokenProvider and reconnects transparently on auth_expired", async () => {
    let tokenIndex = 0;
    const tokens = ["first-token", "second-token"];
    const tokenProvider = vi.fn().mockImplementation(() => {
      const t = tokens[tokenIndex++];
      return Promise.resolve(t);
    });

    const { getByTestId, findByText } = render(
      <TestComponent token="initial-token" tokenProvider={tokenProvider} />,
    );

    await findByText("true", { selector: '[data-testid="connected"]' });
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain("token=initial-token");

    // Trigger auth_expired
    await act(async () => {
      MockEventSource.instances[0].emit({ type: "auth_expired" });
      // Wait for tokenProvider promise and state update
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(tokenProvider).toHaveBeenCalledTimes(1);

    // Old EventSource should be closed
    expect(MockEventSource.instances[0].closeCount).toBe(1);

    // New EventSource should have been instantiated with the rotated token
    expect(MockEventSource.instances.length).toBe(2);
    expect(MockEventSource.instances[1].url).toContain("token=first-token");

    await findByText("true", { selector: '[data-testid="connected"]' });
    expect(getByTestId("error").textContent).toBe("none");
  });

  test("calls tokenProvider on mount if no initial token is provided", async () => {
    const tokenProvider = vi.fn().mockResolvedValue("mount-token");

    const { findByText } = render(<TestComponent tokenProvider={tokenProvider} />);

    // Should not instantiate connection immediately while token is undefined
    expect(MockEventSource.instances.length).toBe(0);

    // Wait for promise resolution and connection
    await findByText("true", { selector: '[data-testid="connected"]' });

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain("token=mount-token");
  });

  test("surfaces 'token expired' if tokenProvider rejects", async () => {
    const tokenProvider = vi.fn().mockRejectedValue(new Error("Failed to fetch token"));

    const { getByTestId, findByText } = render(<TestComponent tokenProvider={tokenProvider} />);

    await findByText("false", { selector: '[data-testid="connected"]' });
    expect(getByTestId("error").textContent).toBe("token expired");
    expect(MockEventSource.instances.length).toBe(0);
  });
});

describe("Token Rotation - useContractEvent", () => {
  function TestComponent({
    token,
    tokenProvider,
  }: {
    token?: string;
    tokenProvider?: () => Promise<string>;
  }) {
    const { connected, error } = useContractEvent({
      serverUrl: "https://events.example.com",
      contractId: "C123",
      token,
      tokenProvider,
    });
    return (
      <div>
        <div data-testid="connected">{connected ? "true" : "false"}</div>
        <div data-testid="error">{error ?? "none"}</div>
      </div>
    );
  }

  test("calls tokenProvider and reconnects transparently on auth_expired", async () => {
    let tokenIndex = 0;
    const tokens = ["first-contract-token", "second-contract-token"];
    const tokenProvider = vi.fn().mockImplementation(() => {
      const t = tokens[tokenIndex++];
      return Promise.resolve(t);
    });

    const { getByTestId, findByText } = render(
      <TestComponent token="initial-contract-token" tokenProvider={tokenProvider} />,
    );

    await findByText("true", { selector: '[data-testid="connected"]' });
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain("token=initial-contract-token");

    // Trigger auth_expired
    await act(async () => {
      MockEventSource.instances[0].emit({ type: "auth_expired" });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances[0].closeCount).toBe(1);
    expect(MockEventSource.instances.length).toBe(2);
    expect(MockEventSource.instances[1].url).toContain("token=first-contract-token");

    await findByText("true", { selector: '[data-testid="connected"]' });
    expect(getByTestId("error").textContent).toBe("none");
  });
});
