/**
 * EventEngine ingestion mode config flag (issue 6.11) and transport routing
 * decision layer (issue 6.12).
 *
 * Covers:
 *  - `ingestion` defaults to "horizon", accepts each explicit valid value,
 *    rejects invalid values with `InvalidIngestionModeError`
 *  - `status().ingestion` / `status().effectiveIngestion` reporting,
 *    including "auto" mode's RPC-protocol-version-based resolution and its
 *    fallback to "horizon" for a non-P23 (or unprobed) RPC
 *  - `resolveFamilyTransport()`'s routing matrix across every event family
 *    and both effective modes
 *
 * This does not exercise live event delivery/suppression - per the issue,
 * routing here is a decision layer only. Which families the engine actually
 * stops delivering via Horizon in favor of the unified stream depends on a
 * working decoder/normalizer existing for that family, which is out of
 * scope here.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEngine } from "../src/EventEngine.js";
import { SorobanRpcClient } from "../src/SorobanRpcClient.js";
import { InvalidIngestionModeError } from "../src/errors.js";
import { resolveFamilyTransport } from "../src/index.js";
import type { EventFamily, IngestionMode } from "../src/index.js";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CoreConfig.ingestion", () => {
  it("defaults to horizon", () => {
    const engine = new EventEngine({ network: "testnet" });
    expect(engine.status().ingestion).toBe("horizon");
  });

  it.each<IngestionMode>(["unified", "horizon", "auto"])(
    "accepts the explicit value %s",
    (mode) => {
      const engine = new EventEngine({ network: "testnet", ingestion: mode });
      expect(engine.status().ingestion).toBe(mode);
    },
  );

  it("rejects an invalid value", () => {
    expect(
      () => new EventEngine({ network: "testnet", ingestion: "sometimes" as IngestionMode }),
    ).toThrow(InvalidIngestionModeError);
  });

  it("propagates to multi-network sub-engines", () => {
    const engine = new EventEngine({
      network: [{ network: "testnet" }, { network: "mainnet" }],
      ingestion: "unified",
    });
    expect(engine.status().ingestion).toBe("unified");
  });
});

describe("EngineStatus.effectiveIngestion", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    SorobanRpcClient.setCachedNetwork(null);
    vi.useRealTimers();
  });

  it("resolves to horizon when ingestion is horizon, regardless of RPC support", () => {
    const engine = new EventEngine({ network: "testnet", ingestion: "horizon" });
    expect(engine.status().effectiveIngestion).toBe("horizon");
  });

  it("resolves to unified when ingestion is forced unified, even with no soroban config", () => {
    const engine = new EventEngine({ network: "testnet", ingestion: "unified" });
    expect(engine.status().effectiveIngestion).toBe("unified");
  });

  it("auto mode falls back to horizon before the RPC probe resolves", () => {
    const engine = new EventEngine({
      network: "testnet",
      ingestion: "auto",
      soroban: { rpcUrl: "https://fake-rpc.example" },
    });
    expect(engine.status().effectiveIngestion).toBe("horizon");
  });

  it("auto mode resolves to unified once the RPC probes as CAP-67-capable (protocol >= 23)", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { passphrase: TESTNET_PASSPHRASE, protocolVersion: 23 },
      }),
    ) as unknown as typeof fetch;

    const engine = new EventEngine({
      network: "testnet",
      ingestion: "auto",
      soroban: { rpcUrl: "https://fake-rpc.example" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(engine.status().effectiveIngestion).toBe("unified");
  });

  it("auto mode falls back to horizon for a pre-P23 RPC", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { passphrase: TESTNET_PASSPHRASE, protocolVersion: 22 },
      }),
    ) as unknown as typeof fetch;

    const engine = new EventEngine({
      network: "testnet",
      ingestion: "auto",
      soroban: { rpcUrl: "https://fake-rpc.example" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(engine.status().effectiveIngestion).toBe("horizon");
  });

  it("auto mode falls back to horizon when the RPC probe fails", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("Internal Server Error", { status: 500 }),
    ) as unknown as typeof fetch;

    const engine = new EventEngine({
      network: "testnet",
      ingestion: "auto",
      soroban: { rpcUrl: "https://fake-rpc.example" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(engine.status().effectiveIngestion).toBe("horizon");
  });
});

describe("resolveFamilyTransport() routing matrix", () => {
  const ALL_FAMILIES: EventFamily[] = [
    "payment",
    "trustlineAuth",
    "trustlineLimit",
    "accountCreated",
    "accountOptions",
    "accountMerge",
    "offer",
    "bumpSequence",
    "manageData",
    "claimableBalance",
    "liquidityPool",
  ];

  // Families with a CAP-67 unified equivalent per the mapping design doc.
  const UNIFIED_EQUIVALENT: EventFamily[] = ["payment", "trustlineAuth"];

  it("routes every family to horizon under effective mode horizon", () => {
    for (const family of ALL_FAMILIES) {
      expect(resolveFamilyTransport(family, "horizon")).toBe("horizon");
    }
  });

  it("routes families with a unified equivalent to unified under effective mode unified", () => {
    for (const family of UNIFIED_EQUIVALENT) {
      expect(resolveFamilyTransport(family, "unified")).toBe("unified");
    }
  });

  it("keeps Horizon-only families on horizon even under effective mode unified", () => {
    const horizonOnly = ALL_FAMILIES.filter((f) => !UNIFIED_EQUIVALENT.includes(f));
    for (const family of horizonOnly) {
      expect(resolveFamilyTransport(family, "unified")).toBe("horizon");
    }
  });
});
