import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("migrate-deploy script safeguards", () => {
  it("forbids migrate reset and uses advisory locking", () => {
    const source = readFileSync(resolve(process.cwd(), "../../scripts/migrate-deploy.mjs"), "utf8");
    expect(source).toMatch(/pg_try_advisory_lock/);
    expect(source).toMatch(/migrate", "deploy"/);
    expect(source).toMatch(/ALLOW_MIGRATE_RESET/);
    // Must not invoke destructive Prisma commands (comments may mention them).
    expect(source).not.toMatch(/prismaCli,\s*"migrate",\s*"reset"/);
    expect(source).not.toMatch(/["']db["'],\s*["']push["']/);
    expect(source).toMatch(/migrate", "status"/);
  });
});
