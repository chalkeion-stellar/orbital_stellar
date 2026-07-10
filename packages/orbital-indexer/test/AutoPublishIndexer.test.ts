import { describe, it, expect, vi, beforeEach } from "vitest";
import { Watcher } from "@orbital-stellar/pulse-core";
import type {
  AbiRegistryClientLike,
  ContractEmittedEvent,
  EventEngine,
} from "@orbital-stellar/pulse-core";
import type { ContractSpec, RegistryPublisher } from "@orbital-stellar/abi-registry";
import { NoEmbeddedSpecError } from "@orbital-stellar/abi-registry";
import { AutoPublishIndexer } from "../src/AutoPublishIndexer.js";

const discoverContractSpecMock = vi.fn();

vi.mock("@orbital-stellar/abi-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@orbital-stellar/abi-registry")>();
  return {
    ...actual,
    discoverContractSpec: (...args: unknown[]) => discoverContractSpecMock(...args),
  };
});

function testSpec(overrides: Partial<ContractSpec> = {}): ContractSpec {
  return {
    version: "0.0.0",
    name: "CTEST",
    contractId: "CTEST",
    functions: [],
    events: [],
    types: {},
    ...overrides,
  };
}

function makeFakeEngine() {
  const watcher = new Watcher("orbital-indexer");
  const subscribeContract = vi.fn().mockReturnValue(watcher);
  const unsubscribeContract = vi.fn();
  const engine = { subscribeContract, unsubscribeContract } as unknown as EventEngine;
  return { engine, watcher, subscribeContract, unsubscribeContract };
}

function makeEmittedEvent(contractId: string): ContractEmittedEvent {
  return {
    type: "contract.emitted",
    contractId,
    topics: [],
    data: null,
    inSuccessfulContractCall: true,
    timestamp: new Date().toISOString(),
    raw: {} as ContractEmittedEvent["raw"],
  };
}

describe("AutoPublishIndexer", () => {
  beforeEach(() => {
    discoverContractSpecMock.mockReset();
  });

  it("start() subscribes with a wildcard filter that matches every contract", () => {
    const { engine, subscribeContract } = makeFakeEngine();
    const indexer = new AutoPublishIndexer({
      engine,
      registryClient: { getSpec: vi.fn() },
      publisher: { publish: vi.fn() },
      rpcUrl: "https://soroban-testnet.stellar.org",
      pointerStrategy: vi.fn(),
    });

    indexer.start();

    expect(subscribeContract).toHaveBeenCalledWith("orbital-indexer", { filters: [{}] });
  });

  it("skips discovery when the registry already has a spec for the contract", async () => {
    const { engine, watcher } = makeFakeEngine();
    const registryClient: AbiRegistryClientLike = {
      getSpec: vi.fn().mockResolvedValue(testSpec()),
    };
    const publisher: RegistryPublisher = { publish: vi.fn() };

    const indexer = new AutoPublishIndexer({
      engine,
      registryClient,
      publisher,
      rpcUrl: "https://soroban-testnet.stellar.org",
      pointerStrategy: vi.fn(),
    });
    indexer.start();

    watcher.emit("*", makeEmittedEvent("CKNOWN"));
    await vi.waitFor(() => expect(registryClient.getSpec).toHaveBeenCalledWith("CKNOWN"));

    expect(discoverContractSpecMock).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("discovers and publishes an unknown contract exactly once, even with a concurrent duplicate event", async () => {
    const { engine, watcher } = makeFakeEngine();
    const registryClient: AbiRegistryClientLike = { getSpec: vi.fn().mockResolvedValue(null) };
    const publisher: RegistryPublisher = {
      publish: vi.fn().mockResolvedValue({ contractId: "CNEW", version: "0.0.0", etag: "x" }),
    };
    const pointerStrategy = vi.fn().mockResolvedValue("https://example.com/spec.json");

    let resolveDiscover!: (spec: ContractSpec) => void;
    discoverContractSpecMock.mockReturnValue(
      new Promise<ContractSpec>((resolve) => {
        resolveDiscover = resolve;
      }),
    );

    const indexer = new AutoPublishIndexer({
      engine,
      registryClient,
      publisher,
      rpcUrl: "https://soroban-testnet.stellar.org",
      pointerStrategy,
    });
    indexer.start();

    // Two events for the same never-seen contract arrive before discovery resolves.
    watcher.emit("*", makeEmittedEvent("CNEW"));
    watcher.emit("*", makeEmittedEvent("CNEW"));

    await vi.waitFor(() => expect(discoverContractSpecMock).toHaveBeenCalledTimes(1));

    resolveDiscover(testSpec({ contractId: "CNEW" }));
    await vi.waitFor(() => expect(publisher.publish).toHaveBeenCalledTimes(1));

    expect(pointerStrategy).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "CNEW", pointer: "https://example.com/spec.json" }),
    );
  });

  it("backs off after NoEmbeddedSpecError and does not retry within the TTL window", async () => {
    const { engine, watcher } = makeFakeEngine();
    const registryClient: AbiRegistryClientLike = { getSpec: vi.fn().mockResolvedValue(null) };
    const publisher: RegistryPublisher = { publish: vi.fn() };
    discoverContractSpecMock.mockRejectedValue(new NoEmbeddedSpecError());

    const indexer = new AutoPublishIndexer({
      engine,
      registryClient,
      publisher,
      rpcUrl: "https://soroban-testnet.stellar.org",
      pointerStrategy: vi.fn(),
      undiscoverableTtlMs: 100_000,
    });
    indexer.start();

    watcher.emit("*", makeEmittedEvent("CSTRIPPED"));
    await vi.waitFor(() => expect(discoverContractSpecMock).toHaveBeenCalledTimes(1));

    watcher.emit("*", makeEmittedEvent("CSTRIPPED"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(discoverContractSpecMock).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("propagates discovery errors that are not NoEmbeddedSpecError", async () => {
    const { engine } = makeFakeEngine();
    const registryClient: AbiRegistryClientLike = { getSpec: vi.fn().mockResolvedValue(null) };
    discoverContractSpecMock.mockRejectedValue(new Error("rpc timeout"));

    const indexer = new AutoPublishIndexer({
      engine,
      registryClient,
      publisher: { publish: vi.fn() },
      rpcUrl: "https://soroban-testnet.stellar.org",
      pointerStrategy: vi.fn(),
    });

    await expect(indexer.ensureDiscovered("CBAD")).rejects.toThrow("rpc timeout");
  });

  it("stop() unsubscribes from the engine", () => {
    const { engine, unsubscribeContract } = makeFakeEngine();
    const indexer = new AutoPublishIndexer({
      engine,
      registryClient: { getSpec: vi.fn() },
      publisher: { publish: vi.fn() },
      rpcUrl: "https://soroban-testnet.stellar.org",
      pointerStrategy: vi.fn(),
    });

    indexer.start();
    indexer.stop();

    expect(unsubscribeContract).toHaveBeenCalledWith("orbital-indexer");
  });

  it("ignores non-contract watcher events", async () => {
    const { engine, watcher } = makeFakeEngine();
    const registryClient: AbiRegistryClientLike = { getSpec: vi.fn() };
    const indexer = new AutoPublishIndexer({
      engine,
      registryClient,
      publisher: { publish: vi.fn() },
      rpcUrl: "https://soroban-testnet.stellar.org",
      pointerStrategy: vi.fn(),
    });
    indexer.start();

    watcher.emit("*", { type: "payment.received", timestamp: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(registryClient.getSpec).not.toHaveBeenCalled();
  });
});
