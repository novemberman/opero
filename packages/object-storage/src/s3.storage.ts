import { createHash } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ObjectAlreadyExistsError,
  ObjectStoragePort,
  type ObjectHead,
} from "./storage.port.js";

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  /** Server-side encryption. AES256 when supported by the provider. */
  serverSideEncryption?: "AES256" | "none";
};

export class ObjectIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectIntegrityError";
  }
}

export class S3ObjectStorage extends ObjectStoragePort {
  private readonly client: S3Client;
  private readonly sse?: "AES256";

  constructor(config: S3StorageConfig) {
    super();
    this.sse = config.serverSideEncryption === "AES256" ? "AES256" : undefined;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType?: string;
    overwrite?: boolean;
    /** Optional expected SHA-256 hex for integrity verification after write. */
    contentSha256Hex?: string;
  }): Promise<void> {
    const checksum =
      input.contentSha256Hex ?? createHash("sha256").update(input.body).digest("hex");
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: { "opero-sha256": checksum },
          ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
          ...(input.overwrite === false ? { IfNoneMatch: "*" } : {}),
        }),
      );
    } catch (error) {
      const name =
        error && typeof error === "object" && "name" in error
          ? String((error as { name: unknown }).name)
          : "";
      if (input.overwrite === false && (name === "PreconditionFailed" || name === "412")) {
        throw new ObjectAlreadyExistsError(input.bucket, input.key);
      }
      throw error;
    }
  }

  async getObjectBuffer(input: {
    bucket: string;
    key: string;
    /** When set, fail closed if the body does not match. */
    expectedSha256Hex?: string;
  }): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error("Empty object body");
    }
    const buffer = Buffer.from(bytes);
    if (input.expectedSha256Hex) {
      const actual = createHash("sha256").update(buffer).digest("hex");
      if (actual !== input.expectedSha256Hex.toLowerCase()) {
        throw new ObjectIntegrityError(
          `Object integrity mismatch for ${input.bucket}/${input.key}`,
        );
      }
    }
    return buffer;
  }

  async headObject(input: { bucket: string; key: string }): Promise<ObjectHead> {
    const response = await this.client.send(
      new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }),
    );
    return {
      bucket: input.bucket,
      key: input.key,
      contentLength: Number(response.ContentLength ?? 0),
      etag: response.ETag,
      contentType: response.ContentType,
      sha256: response.Metadata?.["opero-sha256"],
      serverSideEncryption: response.ServerSideEncryption,
    };
  }

  async copyObject(input: {
    sourceBucket: string;
    sourceKey: string;
    destinationBucket: string;
    destinationKey: string;
  }): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: input.destinationBucket,
        Key: input.destinationKey,
        CopySource: `/${input.sourceBucket}/${input.sourceKey}`,
        ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
      }),
    );
  }

  async deleteObject(input: { bucket: string; key: string }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: input.bucket, Key: input.key }),
    );
  }

  async presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
      { expiresIn: input.expiresInSeconds },
    );
  }
}
