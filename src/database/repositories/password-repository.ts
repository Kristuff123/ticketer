import bcrypt from "bcrypt";
import { query } from "../connection.js";

const BCRYPT_COST_FACTOR = 12;
const MIN_PASSWORD_LENGTH = 8;

export class PasswordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordValidationError";
  }
}

interface PasswordRow {
  password_hash: string;
}

export class PasswordRepository {
  /**
   * Set or replace the bcrypt-hashed password for a user.
   *
   * @throws {PasswordValidationError} when `plaintext` is shorter than 8
   *   characters. Validation runs before any bcrypt call or DB query.
   * @throws when `userId` does not exist in the `users` table (FK violation
   *   from `user_passwords.user_id`).
   */
  async setPassword(userId: string, plaintext: string): Promise<void> {
    if (plaintext.length < MIN_PASSWORD_LENGTH) {
      throw new PasswordValidationError(
        "Password must be at least 8 characters",
      );
    }

    const passwordHash = await bcrypt.hash(plaintext, BCRYPT_COST_FACTOR);

    await query(
      `INSERT INTO user_passwords (user_id, password_hash, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
      [userId, passwordHash],
    );
  }

  /**
   * Verify a plaintext password against the stored bcrypt hash for a user.
   * Returns `false` when no hash is stored for the user, without throwing.
   */
  async verifyPassword(userId: string, plaintext: string): Promise<boolean> {
    const result = await query<PasswordRow>(
      "SELECT password_hash FROM user_passwords WHERE user_id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      return false;
    }

    return bcrypt.compare(plaintext, result.rows[0].password_hash);
  }
}
