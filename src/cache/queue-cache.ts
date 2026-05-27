import { createHash } from "node:crypto";
import type { QueueFilters } from "../models/queue.js";
import { getCache, setCache, getClient } from "./redis-client.js";

const QUEUE_CACHE_PREFIX = "queue:";
const DEFAULT_QUEUE_TTL = 30; // seconds
const UNDEFINED_MARKER = "__undefined__";

/**
 * Stable JSON-replacer-style serializer.
 *
 * Produces a string whose value depends only on the structure and contents of
 * `value`, not on key insertion order. Used as input to a SHA-256 hash so that
 * deeply equal objects produce identical cache keys.
 *
 * Rules:
 * - Object keys are sorted alphabetically before serialization.
 * - Arrays preserve their order (order is significant for arrays).
 * - `undefined` is replaced with the literal string "__undefined__" so that
 *   `{ a: undefined }` and `{}` serialize differently.
 * - `Date` values are converted to their ISO 8601 string representation.
 * - All other values are passed through `JSON.stringify` as-is.
 */
function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    return UNDEFINED_MARKER;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(obj[key]);
    }
    return result;
  }
  return value;
}

/**
 * Derive a deterministic, namespaced cache key from a `QueueFilters` object.
 *
 * Two filter objects that are deeply equal — including pagination fields
 * (`page`, `pageSize`) and undefined-vs-explicit-value distinctions — produce
 * the same key. Any difference in any field produces a different key.
 *
 * The serialization is hashed with SHA-256 and rendered as hex, then prefixed
 * with `queue:` so that final keys look like `queue:<64-hex-chars>`.
 *
 * Pure function: no Redis or other I/O.
 *
 * Requirements: 10.6
 */
export function deriveQueueCacheKey(filters: QueueFilters): string {
  const serialized = stableSerialize(filters);
  const digest = createHash("sha256").update(serialized).digest("hex");
  return `${QUEUE_CACHE_PREFIX}${digest}`;
}

/**
 * Cache layer for queue results and statistics.
 * Requirements: 5.1, 7.7, 10.1, 10.2, 10.3
 */

/**
 * Get cached queue results for a given cache key.
 *
 * The `key` argument MUST be the full, namespaced cache key as returned by
 * `deriveQueueCacheKey`. Callers are responsible for prefixing; this function
 * does not prepend `QUEUE_CACHE_PREFIX`.
 *
 * Returns `null` if no cached value exists for the key.
 */
export async function getCachedQueueResults<T = unknown>(
  key: string,
): Promise<T | null> {
  return getCache<T>(key);
}

/**
 * Cache queue results with a TTL.
 *
 * The `key` argument MUST be the full, namespaced cache key as returned by
 * `deriveQueueCacheKey`. Callers are responsible for prefixing; this function
 * does not prepend `QUEUE_CACHE_PREFIX`.
 *
 * @param key - Full cache key (already prefixed with `queue:`)
 * @param results - The results to cache
 * @param ttl - Time-to-live in seconds (default: 30)
 */
export async function setCachedQueueResults(
  key: string,
  results: unknown,
  ttl: number = DEFAULT_QUEUE_TTL,
): Promise<void> {
  await setCache(key, results, ttl);
}

/**
 * Invalidate all queue-related cache entries.
 * Scans for keys with the queue prefix and deletes them.
 */
export async function invalidateQueueCache(): Promise<void> {
  const client = getClient();
  const pattern = `${QUEUE_CACHE_PREFIX}*`;

  for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    await client.del(key);
  }
}
