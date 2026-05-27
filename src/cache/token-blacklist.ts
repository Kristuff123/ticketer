import { getClient } from "./redis-client.js";

/**
 * JWT token blacklist backed by Redis.
 *
 * Logged-out tokens are tracked by their `jti` claim with a TTL equal to the
 * remaining lifetime of the token, so entries expire automatically when the
 * underlying token would have expired anyway.
 *
 * Both operations degrade gracefully when Redis is unavailable: `blacklistToken`
 * accepts the reduced security guarantee and returns normally, and
 * `isBlacklisted` skips the check and returns `false` so requests can proceed.
 *
 * Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7
 */

const BLACKLIST_PREFIX = "blacklist:";

/**
 * Add a JWT to the blacklist for the given remaining lifetime.
 *
 * - `ttlSeconds <= 0` is a no-op (never store entries with a non-positive TTL).
 * - An empty/falsy `jti` is a no-op.
 * - On Redis errors the failure is logged and swallowed (graceful degradation).
 */
export async function blacklistToken(
  jti: string,
  ttlSeconds: number,
): Promise<void> {
  if (!jti) {
    return;
  }
  if (ttlSeconds <= 0) {
    return;
  }

  try {
    const client = getClient();
    await client.set(`${BLACKLIST_PREFIX}${jti}`, "1", { EX: ttlSeconds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Token blacklist Redis unavailable; logout entry not stored: ${message}`,
    );
  }
}

/**
 * Check whether a JWT has been blacklisted.
 *
 * Returns `false` for falsy `jti` values and when Redis is unavailable so the
 * caller can fall back to the standard signature/expiry checks.
 */
export async function isBlacklisted(jti: string): Promise<boolean> {
  if (!jti) {
    return false;
  }

  try {
    const client = getClient();
    const exists = await client.exists(`${BLACKLIST_PREFIX}${jti}`);
    return exists > 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Token blacklist Redis unavailable; blacklist check skipped: ${message}`,
    );
    return false;
  }
}
