# CAP-67 unified event fixtures

Raw `getEvents` JSON-RPC responses captured from a live Stellar testnet RPC
node, one file per unified classic-asset event kind introduced by
[CAP-67](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md).
Each file is the pretty-printed `result` envelope exactly as returned by
`getEvents` (`topic` and `value` fields are unmodified base64 XDR), used to
test decoders/normalizers against real payloads instead of hand-written
guesses (see issues 6.3-6.10).

All events were produced against the public Stellar testnet:

- RPC endpoint: `https://soroban-testnet.stellar.org`
- Network passphrase: `Test SDF Network ; September 2015`
- Protocol version at capture time: 27 (CAP-67 active)
- Capture date: 2026-07-20

## Test asset and accounts

A custom asset `CAP67` was issued for this corpus, with the issuer account
configured `AUTH_REQUIRED`, `AUTH_REVOCABLE`, and `AUTH_CLAWBACK_ENABLED` so
every event kind in the issue could be produced:

- Issuer: `GASDKEGVDZFF423H4MX27UHZUX35PBQBJBZTGCS7IVNVKG2LQTVVO7R7`
- Alice (trustor): `GAVGVP6NG2YE3XCUZLJ6XTC3MF6SBSX7GSN4RELD4JIIKEP2YK3C3WLF`
- Bob (trustor): `GD6USNRQFJHMFL3KY56F6BKG4N2EXVCQLTXAQ3NGJUVNZ5T3K4XZU4IX`
- SAC contract ID for `CAP67:GASDKEGVDZFF423H4MX27UHZUX35PBQBJBZTGCS7IVNVKG2LQTVVO7R7`:
  `CBJMXTF5BAV7MOFPIUEYXY6DTTNQYUESII3XM4FTVACYNIDB7QPPUDF2`
- Fee-event system contract ID: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

This is all public testnet data; nothing has been redacted.

## Fixtures

| File | Event kind | Tx hash | Ledger | Description |
|---|---|---|---|---|
| `set_authorized.json` | `set_authorized` | `529bc71118fd7e99a1c840f9452a1a264b9c006b04bb670aae88f4c19bffdce5` | 3709876 | Issuer authorizes Alice's trustline (`set_authorize`) so payments can flow. |
| `mint.json` | `mint` | `bdef5638578f25f9505a112f79eebf7fc5b71b77f05a24394e352ed816960ecd` | 3709880 | Issuer pays Alice 1000 `CAP67` (classic payment where source == issuer). |
| `transfer_plain.json` | `transfer` (plain `i128` data) | `8893b6db51a5c6b3a1ee0a019cb0f11af45e3c41c34a10349ce4d2df7419d620` | 3709881 | Alice pays Bob 100 `CAP67`, no transaction memo, so event `value` is a bare `i128`. |
| `transfer_memo.json` | `transfer` (map-based data) | `4501de3203d36a869f68e91ebe50b846d66d5fe53f1e4874f5ee7a0e3f0c0d43` | 3709900 | Alice pays Bob 25 `CAP67` with a text memo (`orbital-cap67-fixture`) on the transaction, so event `value` is an `SCMap` with `amount` and `to_muxed_id` entries. |
| `burn.json` | `burn` | `fb4338382c63868162dfcc93bdac96a71e7e736c5024cacffcd13934944094c7` | 3709905 | Bob pays the issuer 10 `CAP67` (classic payment where destination == issuer). |
| `clawback.json` | `clawback` | `b51697d2922524b17e42ce80e7a49e4fafbb06934cd1717c01a3ad3f856b99fe` | 3709907 | Issuer claws back 50 `CAP67` from Alice's trustline. |
| `fee.json` | `fee` | `8893b6db51a5c6b3a1ee0a019cb0f11af45e3c41c34a10349ce4d2df7419d620` | 3709881 | Network-level fee event (100 stroops) emitted for the `transfer_plain` transaction above, from the shared fee-event system contract rather than the asset's SAC contract. |

## How they were produced

Using the `stellar` CLI (v25.2.0) against `--network testnet`:

1. Generated and funded `issuer`, `alice`, `bob` identities via `stellar keys generate --fund`.
2. `stellar tx new set-options` on `issuer` with `--set-required --set-revocable --set-clawback-enabled`.
3. `stellar tx new change-trust` for `alice` and `bob` on `CAP67:<issuer>`.
4. `stellar tx new set-trustline-flags --set-authorize` for `alice` and `bob` (captures `set_authorized.json`).
5. `stellar tx new payment` issuer -> alice (captures `mint.json`).
6. `stellar tx new payment` alice -> bob, no memo (captures `transfer_plain.json` and `fee.json`).
7. Built the alice -> bob payment with `--build-only`, decoded it with `stellar tx decode`, added a `memo.text`, re-encoded with `stellar tx encode`, signed with `stellar tx sign`, and submitted with `stellar tx send` (captures `transfer_memo.json`) - the CLI has no `--memo` flag on `tx new payment`.
8. `stellar tx new payment` bob -> issuer (captures `burn.json`).
9. `stellar tx new clawback` issuer clawing back from alice (captures `clawback.json`).

Each fixture was then fetched directly from the JSON-RPC `getEvents` method:

```bash
curl -s -X POST https://soroban-testnet.stellar.org \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "getEvents",
    "params": {
      "startLedger": <ledger>,
      "filters": [{"type": "contract", "contractIds": ["<contract id>"]}],
      "pagination": {"limit": 1}
    }
  }'
```

filtering on the SAC contract ID for the six asset-movement events, and on
the fee-event system contract ID (matched by `txHash`) for `fee.json`.
