/**
 * decodeTransfer.ts - CAP-67 unified `transfer` event decoder tests
 *
 * Covers:
 *  - Plain i128 amount data form (fixtures/cap67/transfer_plain.json)
 *  - Map-based amount + to_muxed_id memo data form (fixtures/cap67/transfer_memo.json)
 *  - Malformed-payload rejection
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { decodeUnifiedTransfer, Cap67TransferDecodeError } from "../src/cap67/decodeTransfer.js";
import type { RawSorobanEvent } from "../src/raw-soroban.js";

function loadFixtureEvent(name: string): RawSorobanEvent {
  const path = fileURLToPath(new URL(`./fixtures/cap67/${name}.json`, import.meta.url));
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed.result.events[0] as RawSorobanEvent;
}

describe("decodeUnifiedTransfer", () => {
  it("decodes the plain i128 amount form", () => {
    const event = loadFixtureEvent("transfer_plain");
    const transfer = decodeUnifiedTransfer(event);

    expect(transfer).toEqual({
      from: "GAVGVP6NG2YE3XCUZLJ6XTC3MF6SBSX7GSN4RELD4JIIKEP2YK3C3WLF",
      to: "GD6USNRQFJHMFL3KY56F6BKG4N2EXVCQLTXAQ3NGJUVNZ5T3K4XZU4IX",
      asset: "CAP67:GASDKEGVDZFF423H4MX27UHZUX35PBQBJBZTGCS7IVNVKG2LQTVVO7R7",
      amount: 1000000000n,
    });
  });

  it("decodes the map-based amount + memo form", () => {
    const event = loadFixtureEvent("transfer_memo");
    const transfer = decodeUnifiedTransfer(event);

    expect(transfer).toEqual({
      from: "GAVGVP6NG2YE3XCUZLJ6XTC3MF6SBSX7GSN4RELD4JIIKEP2YK3C3WLF",
      to: "GD6USNRQFJHMFL3KY56F6BKG4N2EXVCQLTXAQ3NGJUVNZ5T3K4XZU4IX",
      asset: "CAP67:GASDKEGVDZFF423H4MX27UHZUX35PBQBJBZTGCS7IVNVKG2LQTVVO7R7",
      amount: 250000000n,
      memo: "orbital-cap67-fixture",
    });
  });

  it("rejects an event with the wrong topic count", () => {
    const event = loadFixtureEvent("transfer_plain");
    const malformed = { ...event, topic: event.topic.slice(0, 2) };

    expect(() => decodeUnifiedTransfer(malformed)).toThrow(Cap67TransferDecodeError);
    expect(() => decodeUnifiedTransfer(malformed)).toThrow(/expected 4 topics, got 2/);
  });

  it("rejects an event whose topic[0] is not the transfer symbol", () => {
    const event = loadFixtureEvent("transfer_plain");
    const mintSymbolTopic = loadFixtureEvent("mint").topic[0];
    const malformed = { ...event, topic: [mintSymbolTopic, ...event.topic.slice(1)] };

    expect(() => decodeUnifiedTransfer(malformed)).toThrow(Cap67TransferDecodeError);
    expect(() => decodeUnifiedTransfer(malformed)).toThrow(/expected topic\[0\] to be "transfer"/);
  });

  it("rejects an event with malformed topic XDR", () => {
    const event = loadFixtureEvent("transfer_plain");
    const malformed = { ...event, topic: ["not-valid-base64-xdr!!", ...event.topic.slice(1)] };

    expect(() => decodeUnifiedTransfer(malformed)).toThrow(Cap67TransferDecodeError);
  });

  it("rejects an event whose value is neither i128 nor map", () => {
    const event = loadFixtureEvent("transfer_plain");
    // "AAAAAAAAAAE=" is a bare ScVal bool(true) - not a supported transfer value shape
    const malformed = { ...event, value: "AAAAAAAAAAE=" };

    expect(() => decodeUnifiedTransfer(malformed)).toThrow(Cap67TransferDecodeError);
    expect(() => decodeUnifiedTransfer(malformed)).toThrow(/unsupported transfer value shape/);
  });

  it("rejects a map value missing the required amount entry", () => {
    const event = loadFixtureEvent("transfer_memo");
    // Same map shape, but with only the memo entry (no "amount" key)
    const memoOnlyMap =
      "AAAAEQAAAAEAAAABAAAADwAAAAt0b19tdXhlZF9pZAAAAAAOAAAAFW9yYml0YWwtY2FwNjctZml4dHVyZQAAAA==";
    const malformed = { ...event, value: memoOnlyMap };

    expect(() => decodeUnifiedTransfer(malformed)).toThrow(Cap67TransferDecodeError);
    expect(() => decodeUnifiedTransfer(malformed)).toThrow(/missing a required "amount" entry/);
  });
});
