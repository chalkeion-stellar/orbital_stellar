# Orbital: Progress & Status Report

**Last Updated:** 2026-07-06
**Project Status:** Core SDK family — Shipped ✅

---

## Executive Summary

Orbital is **Stellar's open-source real-time event SDK family** — four MIT-licensed packages on npm that give any Stellar developer typed event subscriptions (Horizon and Soroban), signed webhook delivery with durable retry, typed ABI decoding, and React hooks, without re-implementing the plumbing.

**Current Status:** The full classic operation taxonomy, Soroban contract event subscription, cursor persistence, durable webhook retry queues, the ABI registry client, and edge-runtime webhook verification are all shipped and tested. Next up is the Phase 2 SDK family (`@orbital-stellar/hooks`, `@orbital-stellar/payments`, `@orbital-stellar/auth`) — see [`ROADMAP.md`](ROADMAP.md).

**OSS posture:** SDKs are MIT and free indefinitely. Production hosting is the separately-built **Orbital Cloud** managed runtime, in development. Until Cloud ships, the SDKs run great in any Node.js or edge backend you operate.

---

## What Has Been Completed

### Core SDK family ✅

All four packages are feature-complete and ready for use against testnet and mainnet today:

| Component | Status | Details |
|---|---|---|
| Classic operation event streaming via Horizon SSE | ✅ Done | Horizon subscription, automatic reconnection with AWS Full Jitter backoff |
| Full classic operation taxonomy | ✅ Done | Payments (received/sent/self), account create/merge/bump-sequence, trustlines (change/allow/set_flags), DEX offers (created/updated/deleted), claimable balances (created/claimed), liquidity pools (deposit/withdraw), `manage_data` (set/cleared) |
| Soroban contract event subscription | ✅ Done | `engine.subscribeContract({ contractId, topics })` via Stellar RPC, `contract.invoked` / `contract.emitted` normalized events |
| Cursor persistence | ✅ Done | Pluggable `CursorStore` adapters — memory, file, Postgres, Redis, S3 — for resumable streams across restarts |
| ABI registry client | ✅ Done | `AbiRegistryClient` / `LocalAbiRegistryClient`, typed `decodedData` enrichment on `contract.emitted`, schema validation |
| HMAC-signed webhook delivery | ✅ Done | Retry, exponential backoff, concurrent-retry caps, configurable timeout |
| Durable webhook retry queues | ✅ Done | Pluggable `RetryQueue` adapters — memory, Redis, SQS — survive process restarts |
| Edge-runtime webhook verification | ✅ Done | `verifyWebhookEdge` for Cloudflare Workers and Vercel Edge (Web Crypto API) |
| React hooks (`useStellarEvent`, `useContractEvent`, `useStellarPayment`, `useStellarActivity`, `useStellarAddresses`, `useStellarHistory`) | ✅ Done | Type-narrowing generic on `useStellarEvent`, multi-event subscription, stable config rules |
| Custom Horizon URL override | ✅ Done | `CoreConfig.horizonUrl` for self-hosted nodes / regional mirrors / futurenet |
| Engine lifecycle notifications | ✅ Done | `engine.reconnecting`, `engine.reconnected`, `engine.rate_limited`, `engine.stopped` |
| Public marketing + documentation site (`apps/web`) | ✅ Done | Next.js 16, Tailwind CSS 4. Hosts the docs, the sandboxed `/api/events/[address]` SSE demo, and the `/api/webhook-sample` signing demo. |
| Testnet + mainnet support | ✅ Done | Network selector via `network: "mainnet" \| "testnet"` |
| CI/CD pipeline | ✅ Done | GitHub Actions on Node 20 and 22, CodeQL, Dependabot |
| npm publish | ✅ Done | All four packages live under the `@orbital-stellar` scope |
| MIT License & open-source setup | ✅ Done | `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` |

---

## Project Structure

```
orbital_stellar/
├── packages/              # MIT-licensed SDKs published to npm
│   ├── pulse-core/        # Event engine — Horizon + Soroban subscription, cursor persistence
│   ├── pulse-webhooks/    # HMAC webhook delivery + verification, durable retry queues
│   ├── pulse-notify/      # React hooks
│   └── abi-registry/      # Soroban ABI client, schema helpers, registry publisher
├── apps/
│   └── web/               # Marketing + docs site + sandboxed demo API routes (Vercel)
├── docs/
│   └── proposal.md        # SCF Infrastructure Grant proposal
├── README.md              # Project overview
├── ROADMAP.md             # Multi-year vision
├── CHANGELOG.md           # Release notes (rolls up per-package changelogs)
├── CONTRIBUTING.md        # Setup, coding standards, PR process, Drips Wave
├── SECURITY.md            # Vulnerability disclosure policy
└── LICENSE                # MIT
```

---

## Core Packages

### 1. `@orbital-stellar/pulse-core` — Event Engine

Subscribes to Horizon SSE and Stellar RPC (Soroban), normalizes raw operations and contract events into a typed `NormalizedEvent` taxonomy, and routes them to per-address `Watcher` instances. Handles reconnection, backoff, rate-limit responses, and cursor persistence (memory, file, Postgres, Redis, S3 adapters) automatically.

**Status:** Production-ready — full classic operation taxonomy plus Soroban contract event subscription and cursor persistence.

See [`packages/pulse-core/README.md`](./packages/pulse-core/README.md) for the API and [`packages/pulse-core/CHANGELOG.md`](./packages/pulse-core/CHANGELOG.md) for the per-feature commit trail.

### 2. `@orbital-stellar/pulse-webhooks` — Webhook Delivery

Attaches to a `Watcher` and POSTs every event to one or more endpoints with HMAC-SHA256 signing, exponential backoff retry, configurable timeout, SSRF hardening, and durable retry queues (memory, Redis, SQS adapters) that survive process restarts. `verifyWebhook` (Node) and `verifyWebhookEdge` (Web Crypto) are exported for the receiver side.

**Status:** Production-ready.

See [`packages/pulse-webhooks/README.md`](./packages/pulse-webhooks/README.md).

### 3. `@orbital-stellar/pulse-notify` — React Hooks

Browser-side React hooks (`useStellarEvent`, `useContractEvent`, `useStellarPayment`, `useStellarActivity`, `useStellarAddresses`, `useStellarHistory`) that open an SSE connection to your Orbital-powered backend and re-render on each event. Generic type narrowing supported on `useStellarEvent<T>`.

**Status:** Production-ready.

See [`packages/pulse-notify/README.md`](./packages/pulse-notify/README.md).

### 4. `@orbital-stellar/abi-registry` — ABI Registry Client

Canonical client for fetching Soroban contract ABI specs (`AbiRegistryClient` over HTTP, `LocalAbiRegistryClient` for offline/self-hosted use), plus schema validation and `scval`/JS conversion helpers. Wired into `pulse-core`'s `EventEngine` to enrich `contract.emitted` events with typed `decodedData`.

**Status:** Production-ready.

See [`packages/abi-registry/README.md`](./packages/abi-registry/README.md).

---

## Reference Composition: `apps/web` API routes

The marketing site hosts two sandboxed API routes — `app/api/events/[address]/route.ts` and `app/api/webhook-sample/route.ts` — that show how the SDKs wire together end-to-end. They are intentionally limited (one concurrent stream per IP, 25s session cap, 20s webhook-sample cooldown) so the public demo cannot exhaust Vercel resources. The limits surface upgrade-to-Cloud prompts when tripped.

For production, you have two paths:

1. **Build your own backend** — install the SDKs, wire them into your existing Node.js or edge worker, deploy on the infrastructure you already operate. The `apps/web/lib/engine.ts` + route handlers are a copy-paste starting point.
2. **Use Orbital Cloud (in development)** — managed runtime that handles multi-region orchestration, persistent webhook registries, replay, and observability. Out of scope for this repository.

---

## Development Setup

### Prerequisites
- Node.js 20 or 22 (both tested in CI)
- pnpm 10 — `npm install -g pnpm@10`

### Install & Run

```bash
pnpm install
pnpm -r typecheck
pnpm test

# Run integration tests (requires INTEGRATION_TESTS=true)
pnpm test:integration

# Run the docs site + sandboxed demo API
NEXT_PUBLIC_NETWORK=testnet pnpm --filter orbital/web dev
```

---

## Architecture

```
Stellar Network (Horizon REST/SSE + Stellar RPC)
        │
        ▼
@orbital-stellar/pulse-core
EventEngine · Watcher · Normalization · Reconnect · Backoff · Cursor persistence
        │                                    ▲
   ┌────┴─────────────────┐                  │
   ▼                      ▼                  │
@orbital-stellar/pulse-webhooks   @orbital-stellar/pulse-notify   @orbital-stellar/abi-registry
HMAC delivery             React hooks (browser SSE)               ABI spec fetch + decode
Durable retry queues      useStellarEvent / useContractEvent       (wired into EventEngine
Edge-runtime verify       useStellarPayment / useStellarActivity    for contract.emitted)
```

---

## Security

### Implemented
- ✅ HMAC-SHA256 webhook signatures (`X-Orbital-Signature`, `X-Orbital-Timestamp`)
- ✅ Timing-safe HMAC comparison (`crypto.timingSafeEqual` / Web Crypto equivalent)
- ✅ SSRF protection (private/loopback/link-local IP ranges blocked, DNS rebinding defense)
- ✅ Per-attempt webhook delivery timeout (default 10s)
- ✅ Concurrent-retry cap to prevent unbounded memory growth on unreachable endpoints
- ✅ Security disclosure policy (`SECURITY.md`)
- ✅ CodeQL static analysis on every PR
- ✅ Dependabot for dependency CVE tracking
- ✅ Cursor persistence (resumable streams) — `CursorStore` memory/file/Postgres/Redis/S3 adapters
- ✅ Durable retry queues — `RetryQueue` memory/Redis/SQS adapters
- ✅ Soroban event subscription via Stellar RPC
- ✅ ABI registry client for typed Soroban event decoding

---

## Scope Boundaries

Not yet in this repository, tracked for later phases:

1. **Production hosting** — multi-region orchestration, persistent registries, leader election. Belongs in **Orbital Cloud** (separate closed product), not in this repository.
2. **`@orbital-stellar/hooks`, `@orbital-stellar/payments`, `@orbital-stellar/auth`** — Phase 2 SDK family. See [`ROADMAP.md`](./ROADMAP.md).
3. **`@orbital-stellar/x402`, `@orbital-stellar/agent-sdk`** — Phase 3. See [`ROADMAP.md`](./ROADMAP.md).
4. **`v1.0` stability pledge** — formal semver contract, tracked in [`ROADMAP.md`](./ROADMAP.md).

---

## Next Steps: Phase 2

| Milestone | Target |
|---|---|
| **SDKs** | `@orbital-stellar/hooks`, `@orbital-stellar/payments`, `@orbital-stellar/auth` |
| **Standards** | First SEP submission |
| **Distribution** | Starter boilerplates (`next`, `express`, `anchor`) |
| **Stability** | `v1.0` stability pledge — formal semver contract |

See [`ROADMAP.md`](./ROADMAP.md) for the full multi-year vision and [`docs/proposal.md`](./docs/proposal.md) for the current SCF funding proposal.

---

## How to Get Started

### As a Stellar Developer
1. Read [Getting Started](./apps/web/content/getting-started/introduction.md)
2. Install: `pnpm add @orbital-stellar/pulse-core @orbital-stellar/pulse-webhooks @orbital-stellar/pulse-notify @orbital-stellar/abi-registry`
3. Follow the [Quick Start](./apps/web/content/getting-started/quick-start.md)

### As a Contributor
1. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
2. Browse [issues tagged `good-first-issue`](https://github.com/determined-001/orbital_stellar/labels/good-first-issue) — Drips Wave Program rewards apply
3. Run `pnpm -r typecheck && pnpm test` before submitting

### As a Funder / Reviewer
1. Read [`docs/proposal.md`](./docs/proposal.md) for the SCF Infrastructure Grant ask
2. See [`CHANGELOG.md`](./CHANGELOG.md) for the full commit trail

---

## Repository Health

| Metric | Status |
|---|---|
| Build Status | ✅ Passing |
| Test Coverage | ✅ Core paths covered; integration tests gated by `INTEGRATION_TESTS=true` |
| Security Scanning | ✅ CodeQL + Dependabot active |
| Documentation | ✅ Complete for the shipped SDK family |
| License | ✅ MIT |
| Workspace | ✅ pnpm 10 monorepo, Node 20 + 22 in CI |

---

## License

MIT — See [`LICENSE`](./LICENSE). Free to use in commercial and open-source projects.
