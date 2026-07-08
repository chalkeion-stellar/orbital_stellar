/**
 * ABI Registry Specification Format Version-Negotiation Behavior
 *
 * All outbound requests from this client are pinned to spec version {@link REGISTRY_SPEC_VERSION}.
 * This explicit version negotiation prevents silent parsing failures when future spec format changes are introduced.
 *
 * 1. Client Version Pinning:
 *    Every HTTP request includes the following header:
 *    `Accept: application/vnd.orbital.abi-registry+json; version=1`
 *
 * 2. Server Response Expectations:
 *    - Supported version (200): The server responds with the payload in the requested format.
 *      The response `Content-Type` should match, e.g. `Content-Type: application/vnd.orbital.abi-registry+json; version=1`.
 *    - Unsupported version (406): If the server cannot satisfy the requested spec version,
 *      it returns `406 Not Acceptable`. This prevents the client from parsing an incompatible payload.
 *
 * 3. Forward Compatibility:
 *    Clients pinned to version 1 continue working as long as the server supports version 1,
 *    even when newer spec versions are available.
 */

export const REGISTRY_SPEC_VERSION = 1;

import { TtlLruCache, DEFAULT_MAX_CACHE_SIZE, DEFAULT_CACHE_TTL_MS } from "./TtlLruCache.js";
import type {
  AbiRegistryClientConfig,
  AbiRegistryClientTransport,
  XdrContractSpec,
} from "./types.js";

/**
 * HTTP client for the Orbital ABI Registry API.
 *
 * All requests are pinned to spec version {@link REGISTRY_SPEC_VERSION} via the
 * `Accept` header. Servers that support this version respond with `200` and a
 * matching `Content-Type`. Servers that do not support it respond with `406 Not
 * Acceptable`, preventing the client from silently parsing an incompatible payload.
 *
 * Clients pinned to version 1 remain forward-compatible: they keep working as long
 * as the server continues to serve version 1, even as newer spec versions are added.
 */
export class AbiRegistryClient {
  private readonly baseUrl: string;
  private readonly transport: AbiRegistryClientTransport;
  private readonly cache: TtlLruCache<XdrContractSpec | null>;

  constructor(config: AbiRegistryClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.transport = config.transport ?? fetch.bind(globalThis);
    this.cache = new TtlLruCache(
      config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE,
    );
  }

  /** Fetch a single contract spec (cached). */
  async getSpec(contractId: string): Promise<XdrContractSpec | null> {
    const cached = this.getCached(contractId);
    if (cached !== undefined) return cached;

    const response = await this.transport(
      `${this.baseUrl}/specs/${encodeURIComponent(contractId)}`,
      {
        method: "GET",
        headers: {
          Accept: `application/vnd.orbital.abi-registry+json; version=${REGISTRY_SPEC_VERSION}`,
        },
      },
    );

    if (response.status === 404) {
      this.setCache(contractId, null);
      return null;
    }

    if (!response.ok) {
      throw new Error(`ABI registry responded with ${response.status} for contract spec fetch`);
    }

    const spec = (await response.json()) as XdrContractSpec;
    this.setCache(contractId, spec);
    return spec;
  }

  /**
   * Fetch the contract spec as it existed at a specific ledger, for contracts
   * that have upgraded and no longer match `getSpec`'s latest-spec lookup.
   * The registry server is responsible for ledger-versioned spec storage;
   * this client just passes `ledger` through as a query parameter.
   *
   * Cached separately from `getSpec` (keyed by `contractId@ledger`) since a
   * historical spec must never be conflated with the latest one.
   */
  async getSpecAt(contractId: string, ledger: number): Promise<XdrContractSpec | null> {
    const cacheKey = `${contractId}@${ledger}`;
    const cached = this.getCached(cacheKey);
    if (cached !== undefined) return cached;

    const response = await this.transport(
      `${this.baseUrl}/specs/${encodeURIComponent(contractId)}?ledger=${encodeURIComponent(ledger)}`,
      {
        method: "GET",
        headers: {
          Accept: `application/vnd.orbital.abi-registry+json; version=${REGISTRY_SPEC_VERSION}`,
        },
      },
    );

    if (response.status === 404) {
      this.setCache(cacheKey, null);
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `ABI registry responded with ${response.status} for versioned contract spec fetch`,
      );
    }

    const spec = (await response.json()) as XdrContractSpec;
    this.setCache(cacheKey, spec);
    return spec;
  }

  /**
   * Fetch specs for multiple contract IDs in a single round-trip.
   * Results are cached; only uncached IDs are fetched from the registry.
   *
   * @returns A record mapping each contractId to its spec, or null if not found.
   */
  async getSpecs(contractIds: string[]): Promise<Record<string, XdrContractSpec | null>> {
    const result: Record<string, XdrContractSpec | null> = {};
    const uncached: string[] = [];

    for (const id of contractIds) {
      const cached = this.getCached(id);
      if (cached !== undefined) {
        result[id] = cached;
      } else {
        uncached.push(id);
      }
    }

    if (uncached.length === 0) return result;

    const fetched = await this.fetchBatch(uncached);

    for (const id of uncached) {
      const spec = fetched[id] ?? null;
      this.setCache(id, spec);
      result[id] = spec;
    }

    return result;
  }

  private getCached(contractId: string): XdrContractSpec | null | undefined {
    return this.cache.get(contractId);
  }

  private setCache(contractId: string, value: XdrContractSpec | null): void {
    this.cache.set(contractId, value);
  }

  /**
   * POST /specs with the full list of IDs — one round-trip regardless of batch size.
   */
  private async fetchBatch(contractIds: string[]): Promise<Record<string, XdrContractSpec | null>> {
    const response = await this.transport(`${this.baseUrl}/specs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: `application/vnd.orbital.abi-registry+json; version=${REGISTRY_SPEC_VERSION}`,
      },
      body: JSON.stringify({ contractIds }),
    });

    if (!response.ok) {
      throw new Error(`ABI registry responded with ${response.status} for batch spec fetch`);
    }

    return response.json() as Promise<Record<string, XdrContractSpec | null>>;
  }
}
