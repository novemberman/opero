import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { ObjectStoragePort, type ObjectHead } from "./storage.port.js";

/**
 * Private local object storage rooted under DOCUMENT_STORAGE_ROOT.
 * Used when an S3-compatible container is unavailable. Same port as S3ObjectStorage.
 */
export class FilesystemObjectStorage extends ObjectStoragePort {
  constructor(private readonly rootDir: string) {
    super();
  }

  private resolvePath(bucket: string, key: string): string {
    const safeBucket = bucket.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const safeKey = key
      .split("/")
      .filter((part) => part.length > 0 && part !== "." && part !== "..")
      .join("/");
    const full = resolve(this.rootDir, safeBucket, safeKey);
    const root = resolve(this.rootDir, safeBucket) + sep;
    if (!full.startsWith(root) && full !== resolve(this.rootDir, safeBucket)) {
      throw new Error("Invalid object key");
    }
    return full;
  }

  async putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType?: string;
  }): Promise<void> {
    const path = this.resolvePath(input.bucket, input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);
    if (input.contentType) {
      await writeFile(`${path}.meta.json`, JSON.stringify({ contentType: input.contentType }), "utf8");
    }
  }

  async getObjectBuffer(input: { bucket: string; key: string }): Promise<Buffer> {
    return readFile(this.resolvePath(input.bucket, input.key));
  }

  async headObject(input: { bucket: string; key: string }): Promise<ObjectHead> {
    const path = this.resolvePath(input.bucket, input.key);
    const info = await stat(path);
    let contentType: string | undefined;
    try {
      const meta = JSON.parse(await readFile(`${path}.meta.json`, "utf8")) as {
        contentType?: string;
      };
      contentType = meta.contentType;
    } catch {
      // optional
    }
    return {
      bucket: input.bucket,
      key: input.key,
      contentLength: info.size,
      contentType,
      etag: createHash("md5").update(await readFile(path)).digest("hex"),
    };
  }

  async copyObject(input: {
    sourceBucket: string;
    sourceKey: string;
    destinationBucket: string;
    destinationKey: string;
  }): Promise<void> {
    const body = await this.getObjectBuffer({
      bucket: input.sourceBucket,
      key: input.sourceKey,
    });
    let contentType: string | undefined;
    try {
      const head = await this.headObject({
        bucket: input.sourceBucket,
        key: input.sourceKey,
      });
      contentType = head.contentType;
    } catch {
      // optional
    }
    await this.putObject({
      bucket: input.destinationBucket,
      key: input.destinationKey,
      body,
      contentType,
    });
  }

  async deleteObject(input: { bucket: string; key: string }): Promise<void> {
    const path = this.resolvePath(input.bucket, input.key);
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
  }

  async presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    // Filesystem driver does not expose public URLs. API streams downloads instead.
    return `filesystem://${input.bucket}/${input.key}?exp=${input.expiresInSeconds}&n=${randomUUID()}`;
  }

  async renameAtomic(from: string, to: string): Promise<void> {
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  }
}
