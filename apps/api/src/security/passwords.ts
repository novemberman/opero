import { argon2id, hash, verify, type HashOptions } from "argon2";

/**
 * Explicit Argon2id parameters (OWASP-aligned for interactive logins).
 * Defaults are set intentionally rather than relying on library defaults silently changing.
 */
export const ARGON2ID_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password);
  } catch {
    return false;
  }
}
