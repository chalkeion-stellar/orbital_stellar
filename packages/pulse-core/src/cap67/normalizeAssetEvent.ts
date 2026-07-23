/**
 * Shared helpers for mapping decoded CAP-67 mint/burn/clawback structs onto
 * `NormalizedEvent` taxonomy shapes.
 */
import { isContractAddress, toAccountAddress } from "../address.js";
import type { AccountAddress, MuxedAddress, StellarAddress } from "../address.js";

/**
 * Extracts the issuer account from an asset in `CODE:ISSUER` form. CAP-67
 * mint/burn/clawback events are only emitted for issued assets (native XLM
 * has no issuer and cannot be minted, burned, or clawed back).
 */
export function issuerFromAsset(
  asset: string,
  makeError: (reason: string) => Error,
): AccountAddress {
  const colonIndex = asset.indexOf(":");
  if (colonIndex === -1 || colonIndex === asset.length - 1) {
    throw makeError(`asset "${asset}" is not in "CODE:ISSUER" form`);
  }
  return toAccountAddress(asset.slice(colonIndex + 1));
}

/**
 * Narrows a decoded `StellarAddress` to the `AccountAddress | MuxedAddress`
 * union the payment taxonomy uses. Throws if the address is a contract,
 * which the current taxonomy cannot represent as a payment counterparty.
 */
export function toPaymentAddress(
  address: StellarAddress,
  makeError: (reason: string) => Error,
): AccountAddress | MuxedAddress {
  if (isContractAddress(address)) {
    throw makeError(
      `address "${address}" is a contract address, which this taxonomy event cannot represent`,
    );
  }
  return address as AccountAddress | MuxedAddress;
}
