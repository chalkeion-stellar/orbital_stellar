# @orbital-stellar/orbital-indexer

Auto-publish indexer for Orbital's semantic layer (maintainer.md stage 4).
Watches an `EventEngine`'s contract stream for `contractId`s the ABI
registry doesn't yet have a spec for, discovers their interface via WASM
auto-discovery (`@orbital-stellar/abi-registry`'s `discoverContractSpec`),
and publishes the result to the on-chain registry — so Orbital writes
on-chain continuously as part of normal operation, with manual
`abi-registry publish` staying available as the override path for teams
that want custom naming.

## Usage

```ts
import { EventEngine } from "@orbital-stellar/pulse-core";
import { OnChainAbiRegistryClient, OnChainRegistryPublisher } from "@orbital-stellar/abi-registry";
import { AutoPublishIndexer } from "@orbital-stellar/orbital-indexer";

const engine = new EventEngine({ network: "testnet" });
engine.start();

const registryClient = new OnChainAbiRegistryClient({
  contractId: REGISTRY_CONTRACT_ID,
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  publisher: ORBITAL_PUBLISHER_ADDRESS,
});

const publisher = new OnChainRegistryPublisher({
  contractId: REGISTRY_CONTRACT_ID,
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  publisherSecret: ORBITAL_PUBLISHER_SECRET,
});

const indexer = new AutoPublishIndexer({
  engine,
  registryClient,
  publisher,
  rpcUrl: RPC_URL,
  network: "testnet",
  pointerStrategy: async (spec, canonicalJson) => {
    // Host canonicalJson somewhere and return the URL it's served from.
    return await uploadSpecBlob(spec.contractId!, canonicalJson);
  },
});

indexer.start();
```

**Not** wired into any public-facing route — anonymous visitors triggering
real signed transactions per typed contract ID is an abuse vector. This is a
standalone process/script, not part of a public request path.

## Behavior

- Skips contracts the registry already has a spec for.
- Concurrent events for the same not-yet-known contract share one in-flight
  discovery — no duplicate publish attempts.
- Contracts with no embedded spec section (`NoEmbeddedSpecError` — stripped
  or non-Rust) are cached as undiscoverable and retried after a backoff
  window (`undiscoverableTtlMs`, default 30 minutes) rather than retried on
  every single event.
