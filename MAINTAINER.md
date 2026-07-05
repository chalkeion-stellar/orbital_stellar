# Maintainer Tasks

Private, strategic, or closed-source work requiring repository ownership, account
credentials, or deliberate business decisions. Not for community contributors.

---

## Priority 1 — Do now (pre-SCF submission)

### Submit the SCF proposal

`docs/proposal.md` is grant-ready. Submit to [communityfund.stellar.org](https://communityfund.stellar.org)
under the Infrastructure / Build Award track.

- Milestone-released against M1–M6 (as defined in `docs/proposal.md`)
- Budget ask: $30,000
- Contact: 210902543@live.unilag.edu.ng

### Run `create-wave-issues.js`

Publish all Wave Program issues to the public GitHub repo. Prerequisite for Drips
registration and contributor-ladder activation.

```bash
node .github/create-wave-issues.js
```

Run once. After running, the 150 labelled Wave issues will appear on GitHub and
Drips can index them for bounty payouts.

### Activate GitHub Discussions

Repo Settings → Features → check **Discussions**. Two clicks, no code changes.
Required for the D7 community score in the drips-payout rubric (grant committees
look for contributor discussion channels as a bus-factor signal).

### Register on Drips

1. Register Orbital at [drips.network](https://drips.network)
2. Request **featured-project** status via the SCF proposal submission thread
3. Link the GitHub issues (labeled `Stellar Wave`) to the Drips project so contributors
   can claim bounties

### Register on OnlyDust

Register at [onlydust.com](https://onlydust.com). African OSS projects are
prioritised; this is a second contributor funnel alongside Drips Wave rewards.

---

## Priority 2 — Phase 1 (pre-v1.0)

### Deploy apps/web to Vercel

1. Connect the repository to Vercel under your account
2. Set production domain (e.g. `orbital.stellar.dev` or similar)
3. Update the root `README.md` demo-URL badge with the live URL
4. Update `docs/proposal.md` references section with the live URL

D6 (Live Deployment) is an 8% weight in the grant rubric. A public live URL
with real Stellar testnet data moves D6 from 7 → 9–10 and removes the testnet-only
×0.97 modifier.

### Deploy testnet Soroban contract fixture

Issue 1.67 requires a real deployed testnet contract for the M1 integration test.
You must deploy it because it requires a funded Stellar account:

1. Fund a testnet account via [friendbot.stellar.org](https://friendbot.stellar.org)
2. Deploy a minimal Soroban contract that emits a known event on invocation
   (counter, token-mint stub, or similar — anything with a predictable `contract.emitted`
   event shape)
3. Commit the compiled WASM to
   `packages/pulse-core/test/integration/fixtures/test-contract.wasm`
4. Add the deployed `contractId` and `rpcUrl` to `.env.example` and the CI
   integration-test secrets

### Set up npm org and publish pipeline

1. Create the `@orbital-stellar` org on [npmjs.com](https://npmjs.com)
2. Add `NPM_TOKEN` to GitHub Actions secrets
3. After the changesets pipeline (see Priority 4 below) is set up and `v1.0.0` is tagged,
   run the first publish:

   ```bash
   pnpm -r publish --access public --no-git-checks
   ```

Do not publish before `STABILITY.md` is written and the M6 criteria in
`docs/proposal.md` are met.

### Write STABILITY.md

Document the v1.0 stability contract before the npm publish. Minimum required
content:

- No breaking changes within `v1.x` without a 6-month deprecation window
- HMAC-SHA256 signing format pinned (reference the regression test from OSS issue 2.34)
- `NormalizedEvent` type string literals frozen; union never shrinks within a major
- `CursorStore`, `RetryQueue`, `DeadLetterStore`, and `IRegistryStore` interface
  shapes frozen in v1.x
- Semver policy for pre-releases vs stable

Cross-reference from: `docs/proposal.md` §M6, `packages/pulse-webhooks/README.md`
security section (issue 2.34), and `CODE_OF_CONDUCT.md`.

---

## Priority 3 — Strategic (Phase 1 → Phase 2 bridge)

### Draft first SEP

Highest ROI action on D4 (SEP Coverage, 10% weight) and D1 (Stellar lock-in, 25%
weight) for future grant rounds. A submitted-but-not-ratified SEP moves D4 from
1 → 5–7 and D1 from 6 → 8 in the drips-payout rubric — enough to push Orbital
from Tier C ($45) to Tier A ($175–200) in a subsequent submission.

**Two candidate scopes — pick one for the first draft:**

1. **Standardized Soroban event normalization** — formalize the `NormalizedEvent`
   discriminated-union shape so other Stellar client libraries (Rust, Go, Python)
   can interoperate with Orbital-shaped events. Directly extends Phase 1 deliverables.

2. **Reactor-contract interface** — a minimal Soroban interface for contracts that
   want to emit Orbital-compatible events (topic format, data encoding conventions,
   `contract.emitted` schema).

**How to submit:**

1. Fork [github.com/stellar/stellar-protocol](https://github.com/stellar/stellar-protocol)
2. Copy `ecosystem/sep-0000.md` template into `ecosystem/sep-XXXX.md`
3. Fill in Abstract, Motivation, Specification, and Backwards Compatibility sections
4. Open a PR — even a draft PR satisfies the D4 "submitted" criterion

`docs/proposal.md` §"Why Stellar needs this funded now" already describes this as
Phase 2 leverage. Starting the draft during Phase 1 while the implementation is
fresh is the right time.

### Set up Orbital Cloud private repo

Create a private repository (suggested name: `orbital-cloud`) with closed-source
implementations of the OSS-defined pluggable interfaces:

| OSS interface (public) | Cloud implementation (private) |
|------------------------|-------------------------------|
| `CursorStore` (issue 1.54) | `PostgresCursorStore` — multi-tenant cursor table |
| `RetryQueue` (issue 2.31) | `PostgresRetryQueue` — `SELECT … FOR UPDATE SKIP LOCKED` |
| `DeadLetterStore` (issue 2.32) | `PostgresDeadLetterStore` — with URL + time indexes |
| `IRegistryStore` (issue 1.95) | `PostgresIRegistryStore` — per-tenant address → URL mapping |

**Architecture constraint:** OSS packages define interfaces; Cloud imports OSS and
provides concrete implementations. The dependency is one-way. No OSS code may
import from the Cloud repo.

Self-hosters implement these interfaces against their own DB. Orbital Cloud provides
the managed Postgres implementation as a paid service.

### Announce on Stellar Discord and social media

After the SCF proposal is submitted and Wave issues are live on GitHub:

1. Post in Stellar Discord `#developers` and `#grants` channels with the proposal
   link and live demo URL
2. Post on Twitter/X and LinkedIn with the live demo URL
3. Tag `@StellarOrg` and `@SCF_`

Visibility drives D7 (Community, 5% weight) directly. Drips committees weight
reputation signals — an active Discord presence is a bus-factor proxy.

---

## Priority 4 — Repo Configuration & Starters

Tasks that require repo-admin access or are maintainer-owned products (starters,
CI infra). Not community issues because they touch credentials, ownership, or
establish the release pipeline.

### CI: dep-audit, license-check, strict-lint, commitlint

Add four GitHub Actions workflows before any community PRs start merging:

1. **`.github/workflows/dep-audit.yml`** — `pnpm audit --audit-level=high` on every push to `main` and on PRs. Fail on high/critical. Document how to add a temporary exception.
2. **`.github/workflows/license-check.yml`** — `license-checker` with allowlist: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD. Fail on unlisted.
3. **`.github/workflows/ci.yml`** — add `pnpm run lint` step with `--max-warnings 0`.
4. **`.commitlintrc.json`** + **`.github/workflows/commitlint.yml`** — conventional commit enforcement on every PR (feat/fix/chore/docs/test/refactor/perf/ci). PR size warning (non-blocking) when diff > 500 lines.

### Changesets + npm publish release pipeline

Set up the full release pipeline before the v1.0 tag:

1. `pnpm add -D @changesets/cli` → `pnpm changeset init`
2. Commit `.changeset/config.json` with linked packages.
3. Add **`.github/workflows/release.yml`** — on merge of a changesets PR to `main`, runs `pnpm changeset publish` with the `NPM_TOKEN` secret.
4. Add **`.github/workflows/require-changeset.yml`** — fails PRs that touch package source without a changeset file.
5. Document the workflow in `CONTRIBUTING.md` (add "Changesets" section + "Wave Program rewards" section).

### All-contributors setup

1. Add **`.all-contributorsrc`** at repo root (initial empty contributors array, repo = `determined-001/orbital_stellar`).
2. Add **`.github/workflows/all-contributors.yml`** (the bot workflow).
3. Add the `<!-- ALL-CONTRIBUTORS-LIST:START -->` placeholder to `README.md`.

### CODEOWNERS

Add **`.github/CODEOWNERS`** assigning yourself as required reviewer on:
- `packages/pulse-webhooks/src/index.ts`
- `packages/pulse-webhooks/src/edge.ts`
- `SECURITY.md`
- `STABILITY.md`

### Stale bot

Add **`.github/workflows/stale.yml`** (`actions/stale`):
- Mark stale after 30 days of inactivity; close after 7 more.
- Exempt labels: `Wave`, `help wanted`, `good first issue`.

### README pitch rewrite

Rewrite `README.md` opening for a dual audience (grant reviewer + developer):
1. Lead with the problem: "Every Stellar team rebuilds SSE subscription, webhook signing, and React integration from scratch."
2. Add "Why Orbital" comparing to QuickNode / Moralis (no Stellar-native SDK, no edge-runtime verifier, no React hooks).
3. Add packages table with one-line descriptions.
4. First call to action = live demo badge + link.
5. Keep technical depth below the fold.

### `orbital-next-starter`

Build and maintain the Next.js App Router reference starter:

1. Create `apps/starters/next/` with Next.js 14 + Tailwind + TypeScript matching `apps/web` conventions.
2. Add `/app/payments/page.tsx` using `useStellarPayment` for live payments + `/app/api/events/[address]/route.ts` SSE route.
3. Add `/app/api/webhooks/stellar/route.ts` calling `verifyWebhookEdge` + a UI page showing the last N verified payloads.
4. Add `vercel.json` + "Deploy to Vercel" button in README + end-to-end guide at `apps/web/content/guides/next-starter.md`.
5. Gate: `pnpm install && pnpm dev` starts in under 2 minutes. Clicking "Deploy to Vercel" produces a live app in under 5 minutes.

### `orbital-express-starter`

Build and maintain the Express 5 webhook delivery server starter:

1. Create `apps/starters/express/` with Express 5 + TypeScript.
2. Wire `pulse-core` + `pulse-webhooks` for address subscription and signed delivery.
3. Routes: `GET /status` (engine.status + healthCheck), `POST /subscribe` (register address + webhook URL), `GET /subscriptions`.
4. Wire `FileRegistryStore` (issue 1.96) so registrations survive restarts; document how to swap to a custom implementation.
5. Add `railway.toml` + "Deploy to Railway" button + guide at `apps/web/content/guides/express-starter.md`.

### `orbital-anchor-starter`

Build and maintain the SEP-24 receiving anchor starter:

1. Create `apps/starters/anchor/` with Express / Hono + TypeScript.
2. Subscribe to the anchor's hot wallet via `pulse-core`; emit `payment.received` on deposit.
3. Add a basic SEP-24 `/transactions` endpoint (confirmed vs pending deposits).
4. Add `pulse-webhooks` delivery on `payment.received` to a configurable compliance endpoint using `RedisRetryQueue` (or `MemoryRetryQueue` fallback).
5. Add `engine.subscribeContract` for a configurable Soroban settlement contract (dual-source: classic payment + `contract.emitted` with `settlement_confirmed` topic both trigger the compliance webhook).
6. Add `railway.toml` + guide at `apps/web/content/guides/anchor-starter.md` covering full Stellar Laboratory test flow.

### Shared starter test fixtures

Add `apps/starters/shared/` with:
- `testnet.ts` — funded testnet keypair generator (Friendbot); Stellar Laboratory–compatible payment helper.
- `mockReceiver.ts` — in-process mock webhook receiver server for integration tests.
- All three starters' integration tests import from `shared/`; gate behind `INTEGRATION_TESTS=true`.

---

## Decision log

| Decision | Rationale |
|----------|-----------|
| PostgreSQL adapters in private Cloud repo | DB infra costs money; OSS exposes only interfaces; Cloud provides the hosted implementation |
| Open-core model follows Vercel/Clerk, not Supabase | Supabase model creates asymmetric infra cost exposure that historically destroys OSS maintenance budgets |
| First SEP scoped to event normalization | Highest credibility-per-effort ratio; directly extends Phase 1 deliverables |
| npm publish deferred until STABILITY.md exists | Semver breakage during workspace-only beta is recoverable; post-npm it causes downstream breakage |
| apps/server major (4) retired | Server composition moved to apps/web reference route; no dedicated server package |
