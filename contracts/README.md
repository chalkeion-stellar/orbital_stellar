# Orbital contracts

Soroban smart contracts backing Orbital's semantic layer. This is a standalone
Cargo workspace — it is **not** part of the pnpm workspace (`pnpm-workspace.yaml`
only globs `packages/*` and `apps/*`); it has its own toolchain and CI job.

## Contracts

- **`registry`** (`orbital-abi-registry`) — the on-chain ABI registry.
  `publish(publisher, contract_id, version, spec_hash, pointer)` records an
  immutable `(contract_id, publisher, version) -> SpecRecord` mapping, requires
  the publisher's authorization, and emits a `SpecPublished` event. Stores a
  hash + off-chain pointer, not the spec blob itself — integrity is verified by
  the caller re-hashing whatever it fetches from `pointer` and comparing it to
  `spec_hash`.
- **`demo-emitter`** (`orbital-demo-emitter`) — a tiny no-args `ping()` contract
  that emits a `Ping` event. Exists solely so the public `/demo/contracts` page
  can offer a "Fire test event" button without ever touching the registry
  contract's real publish path.

## Toolchain

Pinned via `rust-toolchain.toml`: stable channel, `wasm32v1-none` target.

**Note:** soroban-sdk 27's build script rejects the `wasm32-unknown-unknown`
target on Rust 1.82+ (reference-types/multi-value are enabled by default there
and unsupported by the Soroban environment) — use `wasm32v1-none` instead,
which has been available since Rust 1.84.

You'll also want the [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli)
(`stellar --version`) for deploying and interacting with contracts. Developed
against `stellar-cli 25.2.0` / `soroban-sdk 27.0.0`.

## Build & test

```sh
cd contracts
cargo test                                   # native unit tests (both contracts)
cargo build --release --target wasm32v1-none # production WASM build
```

WASM artifacts land in `target/wasm32v1-none/release/orbital_abi_registry.wasm`
and `target/wasm32v1-none/release/orbital_demo_emitter.wasm`.

CI (`.github/workflows/contracts.yml`) runs both on every push/PR that touches
`contracts/**`.

## Deploy to testnet

```sh
stellar keys generate orbital-deployer --network testnet --fund   # one-time
./deploy/deploy_testnet.sh
```

This is a manual, one-time act — contracts are immutable once deployed, so
deployment is intentionally not part of any CI pipeline. The script builds
both contracts, deploys them, and writes `deployed.testnet.json` with the
resulting contract IDs. See that script's header comment and the maintainer
plan's "manual/gated steps" section for the secret-provisioning steps that
follow (GitHub repo secrets for the nightly integration test, Vercel env vars
for the demo's "Fire test event" route).
