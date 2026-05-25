import { createClient, RedisClientType } from 'redis';

/**
 * Redis client configured from environment variables.
 * Uses REDIS_URL if available, otherwise falls back to REDIS_HOST/REDIS_PORT.
 * Requirements: 5.1, 7.7
 */

let client: RedisClientType | null = null;

/**
 * Get the Redis connection URL from environment variables.
 */
function getRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  return `redis://${host}:${port}`;
}

/**
 * Get or create the Redis client instance.
 */
export function getClient(): RedisClientType {
  if (!client) {
    client = createClient({ url: getRedisUrl() }) as RedisClientType;
    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });
  }
  return client;
}

/**
 * Connect to Redis.
 */
export async function connect(): Promise<void> {
  const redisClient = getClient();
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

/**
 * Disconnect from Redis.
 */
export async function disconnect(): Promise<void> {
  if (client && client.isOpen) {
    await client.disconnect();
    client = null;
  }
}

/**
 * Get a cached value by key.
 * Returns the parsed value or null if not found.
 */
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const redisClient = getClient();
  const value = await redisClient.get(key);
  if (value === null) {
    return null;
  }
  return JSON.parse(value) as T;
}

/**
 * Set a cached value with an optional TTL in seconds.
 */
export async function setCache(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const redisClient = getClient();
  const serialized = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await redisClient.set(key, serialized, { EX: ttlSeconds });
  } else {
    await redisClient.set(key, serialized);
  }
}

/**
 * Delete a cached value by key.
 */
export async function deleteCache(key: string): Promise<void> {
  const redisClient = getClient();
  await redisClient.del(key);
}
