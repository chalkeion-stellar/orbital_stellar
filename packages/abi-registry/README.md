# @orbital-stellar/abi-registry

**Shared Soroban ABI registry for Orbital.** This package holds the canonical client surface for ABI-aware code, along with schema helpers and publisher abstractions that keep Soroban integration logic consistent across the repo.

```bash
pnpm add @orbital-stellar/abi-registry
```

## What it does

`abi-registry` is the package you use when you need to read, decode, publish, or reuse Soroban contract interface metadata without duplicating schema logic in application code.

It is the shared boundary between:

- ABI consumers in `pulse-core`
- any future Soroban event subscriber or decoder
- tooling that publishes or snapshots registry data

If you are looking for the hosted verification / publishing service, that is a separate Cloud product. This package is the open-source schema and client surface.

## Quickstart

```ts
import {
  AbiRegistryClient,
  LocalFilePublisher,
  RegistryPublisher,
  jsToScval,
  scvalToJs,
} from "@orbital-stellar/abi-registry";

const client = new AbiRegistryClient({
  baseUrl: "https://abi.example.com",
});

const spec = await client.getSpec("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
const specs = await client.getSpecs([
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
]);

const encoded = jsToScval({ hello: "world" });
const decoded = scvalToJs(encoded);

const publisher: RegistryPublisher = new LocalFilePublisher();

await publisher.publish({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  entries: [],
});
```

## API

### `AbiRegistryClient`

Creates a cached client that fetches contract ABI specs from the configured registry endpoint. Use `getSpec(contractId)` for a single contract or `getSpecs(contractIds)` for batched lookups.

### `ChainedAbiRegistryClient`

Composes multiple `AbiRegistryReader`s (anything with a `getSpec(contractId)`, and optionally a `getSpecAt(contractId, ledger)`) into a single resolution chain: each client is tried in order, and the first non-`null` result wins. Clients after the first are never consulted once one resolves - later entries fill gaps, they don't get a vote once an earlier one has answered.

```ts
import { ChainedAbiRegistryClient } from "@orbital-stellar/abi-registry";

const resolver = new ChainedAbiRegistryClient([embeddedSpecReader, registryAttestationReader]);
```

**SEP-48 precedence order.** Per SEP-48's compatibility clause, a contract's own embedded event spec (discovered from its `contractspecv0` WASM section via `discoverContractSpec`) is canonical when present. A registry attestation only fills gaps for contracts with no embedded spec - it never overrides one. A SEP-48-compliant chain must therefore list the embedded-spec reader first and the registry-attestation reader second:

1. **Embedded spec present** - used as-is, even if a registry attestation for the same contract disagrees.
2. **No embedded spec, registry attestation present** - the attestation is used.
3. **Neither** - resolution reports unresolved (`null`). There is no silent fallback to bundled/well-known guesses; a caller that wants one must compose it explicitly, after the registry, and can no longer treat the result as SEP-48-verified.

An embedded-spec reader's `getSpec` must resolve to `null` for a contract with no embedded spec, not throw - `discoverContractSpec` itself throws `NoEmbeddedSpecError`, so any reader wrapping it for use in a chain is responsible for catching that and returning `null`.

### `RegistryPublisher`

An interface for publishing registry snapshots or derived ABI artifacts.

### `LocalFilePublisher`

Reference publisher that writes registry output to the local filesystem. Useful for testing, debugging, and snapshots.

### `jsToScval(value)` / `scvalToJs(value)`

Helpers for converting between JavaScript values and Soroban `ScVal` payloads.

## Related documents

- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) - where the registry sits in the system map
- [`docs/open-source-policy.md`](../../docs/open-source-policy.md) - the public/private boundary for the registry service

## License

MIT
