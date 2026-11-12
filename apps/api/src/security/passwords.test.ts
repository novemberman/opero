import { argon2id } from "argon2";
import { describe, expect, it } from "vitest";
import { ARGON2ID_OPTIONS, hashPassword, verifyPassword } from "./passwords";

describe("argon2id passwords", () => {
  it("uses explicit Argon2id parameters", () => {
    expect(ARGON2ID_OPTIONS.type).toBe(argon2id);
    expect(ARGON2ID_OPTIONS.memoryCost).toBe(65_536);
    expect(ARGON2ID_OPTIONS.timeCost).toBe(3);
    expect(ARGON2ID_OPTIONS.parallelism).toBe(1);
  });


  it("hashes and verifies with Argon2id", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password-999")).toBe(false);
  });
});
