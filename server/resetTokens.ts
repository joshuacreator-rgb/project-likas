import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password-reset token helpers.
 *
 * Tokens are 256-bit random values that are handed to the user once (by email);
 * only their SHA-256 hashes are stored, mirroring how invitation tokens are
 * stored in `db.ts`. This means a leaked database never yields usable reset
 * tokens — the same property holds for the OAuth access-token exchange.
 */

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of a candidate token against a stored hash. */
export function verifyResetToken(token: string, tokenHash: string): boolean {
  const expected = Buffer.from(tokenHash, "hex");
  const actual = Buffer.from(hashResetToken(token), "hex");
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}