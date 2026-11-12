import { ObjectStoragePort, type ObjectHead } from "./storage.port.js";

type Stored = { body: Buffer; contentType?: string };

/** In-memory storage for unit/integration tests. */
export class MemoryObjectStorage extends ObjectStoragePort {
  private readonly objects = new Map<string, Stored>();

  private id(bucket: string, key: string): string {
    return `${bucket}::${key}`;
  }

  async putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType?: string;
  }): Promise<void> {
    this.objects.set(this.id(input.bucket, input.key), {
      body: Buffer.from(input.body),
      contentType: input.contentType,
    });
  }

  async getObjectBuffer(input: { bucket: string; key: string }): Promise<Buffer> {
    const found = this.objects.get(this.id(input.bucket, input.key));
    if (!found) {
      throw new Error("Object not found");
    }
    return Buffer.from(found.body);
  }

  async headObject(input: { bucket: string; key: string }): Promise<ObjectHead> {
    const found = this.objects.get(this.id(input.bucket, input.key));
    if (!found) {
      throw new Error("Object not found");
    }
    return {
      bucket: input.bucket,
      key: input.key,
      contentLength: found.body.byteLength,
      contentType: found.contentType,
    };
  }

  async copyObject(input: {
    sourceBucket: string;
    sourceKey: string;
    destinationBucket: string;
    destinationKey: string;
  }): Promise<void> {
    const found = this.objects.get(this.id(input.sourceBucket, input.sourceKey));
    if (!found) {
      throw new Error("Source object not found");
    }
    this.objects.set(this.id(input.destinationBucket, input.destinationKey), {
      body: Buffer.from(found.body),
      contentType: found.contentType,
    });
  }

  async deleteObject(input: { bucket: string; key: string }): Promise<void> {
    this.objects.delete(this.id(input.bucket, input.key));
  }

  async presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return `memory://${input.bucket}/${input.key}?expires=${input.expiresInSeconds}`;
  }
}
