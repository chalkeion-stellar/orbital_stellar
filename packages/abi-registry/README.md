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

### `signAttestation` / `verifyAttestation`

An attestation (SEP §7.3) claims "this deployed contract emits this event schema." These two functions are the signature envelope around that claim: they don't validate the schema payload itself (that's the separate `attestation.schema.json` deliverable), only who signed the document and whether it's been tampered with since.

```ts
import { signAttestation, verifyAttestation } from "@orbital-stellar/abi-registry";
import type { AttestationDocument } from "@orbital-stellar/abi-registry";

const document: AttestationDocument = {
  contractId: "C...",
  wasmHash: "…", // hex-encoded SHA-256 of the deployed WASM
  schema: {
    /* SEP-48-shaped event definitions */
  },
  attester: attesterKeypair.publicKey(), // G...
  createdAt: new Date().toISOString(),
};

const envelope = signAttestation(document, attesterKeypair.secret());
// envelope: { payload, publicKey, signature }

const verdict = verifyAttestation(envelope, { expectedWasmHash: onChainWasmHash });
// { status: "valid" } | { status: "invalid", reason: string }
```

`signAttestation` signs `canonicalizeAttestation(document)` - a deterministic, recursively-key-sorted JSON serialization - with the attester's ed25519 keypair, and refuses to sign if `document.attester` doesn't match the signing key's own address.

`verifyAttestation` checks, in order, short-circuiting on the first failure:

1. `envelope.publicKey` is a well-formed Stellar account address (`G...`).
2. `envelope.publicKey` matches `envelope.payload.attester` - nobody but the claimed attester can produce a valid envelope for a given document.
3. `envelope.signature` is a valid ed25519 signature by `envelope.publicKey` over the payload's canonical JSON - this is what catches tampering, since changing even one byte of the payload changes its canonical serialization.
4. If `options.expectedWasmHash` is given (the caller's own on-chain lookup - this module makes no network calls), it matches `envelope.payload.wasmHash`.

### `RegistryPublisher`

An interface for publishing registry snapshots or derived ABI artifacts.

### `LocalFilePublisher`

Reference publisher that writes registry output to the local filesystem. Useful for testing, debugging, and snapshots.

### `jsToScval(value)` / `scvalToJs(value)`

Helpers for converting between JavaScript values and Soroban `ScVal` payloads.

## CLI

### `abi-registry verify <contractId> --schema <file>`

The one-command form of `verifySchema`: reads a submitted schema off disk, compares it against the deployed contract's on-chain spec, and prints the structured verdict.

```bash
abi-registry verify CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75 \
  --schema specs/well-known/usdc.json \
  --network mainnet
```

```
✗ mismatch  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75
  1 difference(s) between the submitted schema and the on-chain spec:

  - functions[transfer].returns
      submitted: "void"
      on-chain:  "u32"
```

`--schema` accepts either the canonical `ContractSpec` shape or the hand-authored snake_case well-known format, so the bundled specs in `specs/well-known/` can be passed straight through. The file is validated with `validateSpec` before any network call, so a malformed schema fails fast rather than being reported as a mismatch.

| Flag | Default | Purpose |
| --- | --- | --- |
| `--schema <file>` | *(required)* | Submitted schema to verify |
| `--rpc-url <url>` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `--network <name>` | `testnet` | `mainnet` \| `testnet` \| `futurenet` |
| `--json` | `false` | Print the verdict as JSON instead of text |
| `--allow-unverifiable` | `false` | Exit `0` instead of `2` when the contract has no embedded spec |

`--json` prints the verdict verbatim, plus the contract ID, for machine consumption:

```json
{
  "contractId": "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  "status": "mismatch",
  "diffs": [{ "path": "functions[transfer].returns", "submitted": "void", "onChain": "u32" }]
}
```

**Exit codes.** Distinct per outcome, so CI can gate on the specific one it cares about rather than only on "non-zero":

| Code | Meaning |
| --- | --- |
| `0` | `match` - submitted schema matches the on-chain spec |
| `1` | `mismatch` - the schema disagrees with the on-chain spec |
| `2` | `unverifiable` - contract has no embedded spec, so nothing could be compared (see `--allow-unverifiable`) |
| `3` | Bad usage, unreadable/invalid schema file, or an RPC failure |

Note that Stellar Asset Contracts (USDC, EURC, AQUA, the native XLM wrapper) have no WASM and therefore no embedded `contractspecv0` section - verifying one reports `unverifiable`, not `mismatch`. Only contracts built from Rust with their spec section intact can be verified.

## Related documents

- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) - where the registry sits in the system map
- [`docs/open-source-policy.md`](../../docs/open-source-policy.md) - the public/private boundary for the registry service

## License

MIT
