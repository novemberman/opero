import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemObjectStorage } from "./filesystem.storage.js";

describe("FilesystemObjectStorage", () => {
  let root = "";

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("strips path traversal segments so objects stay inside the bucket root", async () => {
    root = await mkdtemp(join(tmpdir(), "opero-fs-"));
    const storage = new FilesystemObjectStorage(root);

    // ".." segments are stripped; object stays inside the bucket.
    await storage.putObject({
      bucket: "opero-quarantine",
      key: "org/a/../../b/safe.csv",
      body: Buffer.from("ok"),
    });
    const body = await storage.getObjectBuffer({
      bucket: "opero-quarantine",
      key: "org/a/../../b/safe.csv",
    });
    expect(body.toString()).toBe("ok");
  });

  it("does not follow keys into sibling directories", async () => {
    root = await mkdtemp(join(tmpdir(), "opero-fs-"));
    const outside = join(root, "secret.txt");
    await writeFile(outside, "secret");
    const storage = new FilesystemObjectStorage(root);
    await expect(
      storage.getObjectBuffer({
        bucket: "opero-documents",
        key: "../../secret.txt",
      }),
    ).rejects.toThrow();
  });
});
