import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string compare via SHA-256 digests (handles unequal lengths). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}
