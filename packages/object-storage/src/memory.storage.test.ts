import { describe, expect, it } from "vitest";
import { MemoryObjectStorage } from "./memory.storage";

describe("MemoryObjectStorage", () => {
  it("stores, heads, copies, and deletes objects", async () => {
    const storage = new MemoryObjectStorage();
    await storage.putObject({
      bucket: "quarantine",
      key: "a/b.csv",
      body: Buffer.from("hello"),
      contentType: "text/csv",
    });
    expect((await storage.headObject({ bucket: "quarantine", key: "a/b.csv" })).contentLength).toBe(5);
    await storage.copyObject({
      sourceBucket: "quarantine",
      sourceKey: "a/b.csv",
      destinationBucket: "accepted",
      destinationKey: "a/b.csv",
    });
    expect((await storage.getObjectBuffer({ bucket: "accepted", key: "a/b.csv" })).toString()).toBe(
      "hello",
    );
    await storage.deleteObject({ bucket: "quarantine", key: "a/b.csv" });
    await expect(storage.getObjectBuffer({ bucket: "quarantine", key: "a/b.csv" })).rejects.toThrow(
      /not found/i,
    );
  });
});
