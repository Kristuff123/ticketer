import { getCache, setCache, getClient } from './redis-client.js';

const QUEUE_CACHE_PREFIX = 'queue:';
const DEFAULT_QUEUE_TTL = 30; // seconds

/**
 * Cache layer for queue results and statistics.
 * Requirements: 5.1, 7.7
 */

/**
 * Get cached queue results for a given filter key.
 * Returns null if no cached results exist.
 */
export async function getCachedQueueResults<T = unknown>(filterKey: string): Promise<T | null> {
  return getCache<T>(`${QUEUE_CACHE_PREFIX}${filterKey}`);
}

/**
 * Cache queue results with a TTL.
 * @param filterKey - Unique key representing the filter/sort combination
 * @param results - The results to cache
 * @param ttl - Time-to-live in seconds (default: 30)
 */
export async function setCachedQueueResults(
  filterKey: string,
  results: unknown,
  ttl: number = DEFAULT_QUEUE_TTL
): Promise<void> {
  await setCache(`${QUEUE_CACHE_PREFIX}${filterKey}`, results, ttl);
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
