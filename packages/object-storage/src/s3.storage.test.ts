import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ObjectIntegrityError, S3ObjectStorage } from "./s3.storage.js";

describe("S3ObjectStorage integrity helpers", () => {
  it("rejects getObjectBuffer when expected checksum mismatches", async () => {
    const body = Buffer.from("financial-document");
    const storage = new S3ObjectStorage({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "test",
      secretAccessKey: "test-secret",
    });

    const send = vi.spyOn((storage as unknown as { client: { send: unknown } }).client, "send");
    send.mockResolvedValue({
      Body: {
        transformToByteArray: async () => new Uint8Array(body),
      },
    });

    await expect(
      storage.getObjectBuffer({
        bucket: "opero-documents",
        key: "org/x/doc.pdf",
        expectedSha256Hex: createHash("sha256").update("other").digest("hex"),
      }),
    ).rejects.toBeInstanceOf(ObjectIntegrityError);
  });

  it("accepts matching checksums", async () => {
    const body = Buffer.from("ok");
    const storage = new S3ObjectStorage({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "test",
      secretAccessKey: "test-secret",
      serverSideEncryption: "AES256",
    });
    const send = vi.spyOn((storage as unknown as { client: { send: unknown } }).client, "send");
    send.mockResolvedValue({
      Body: {
        transformToByteArray: async () => new Uint8Array(body),
      },
    });
    const out = await storage.getObjectBuffer({
      bucket: "b",
      key: "k",
      expectedSha256Hex: createHash("sha256").update(body).digest("hex"),
    });
    expect(out.equals(body)).toBe(true);
  });
});
