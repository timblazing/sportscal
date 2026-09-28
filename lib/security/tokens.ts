import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { customAlphabet } from "nanoid";

/** 12 chars of [0-9a-z] ≈ 62 bits: short enough to share, infeasible to enumerate. */
const PUBLIC_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export const PUBLIC_ID_LENGTH = 12;
export const PUBLIC_ID_RE = /^[0-9a-z]{12}$/;

export const generatePublicId = customAlphabet(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);

/** 256-bit random edit token, base64url encoded. */
export function generateEditToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyToken(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
