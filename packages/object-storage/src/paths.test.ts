import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveStorageRoot } from "./paths.js";

describe("resolveStorageRoot", () => {
  const previous = process.cwd();
  let temp = "";

  afterEach(() => {
    process.chdir(previous);
    if (temp) {
      rmSync(temp, { recursive: true, force: true });
      temp = "";
    }
  });

  it("keeps absolute paths unchanged", () => {
    expect(resolveStorageRoot("/var/opero/objects")).toBe("/var/opero/objects");
  });

  it("anchors relative paths at the monorepo root for nested package cwd", () => {
    temp = mkdtempSync(join(tmpdir(), "opero-root-"));
    writeFileSync(join(temp, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    const nested = join(temp, "apps", "api");
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);
    expect(resolveStorageRoot(".data/object-storage")).toBe(join(temp, ".data/object-storage"));
  });
});
