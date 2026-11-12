import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ObjectStoragePort, type ObjectHead } from "./storage.port.js";

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export class S3ObjectStorage extends ObjectStoragePort {
  private readonly client: S3Client;

  constructor(config: S3StorageConfig) {
    super();
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
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async getObjectBuffer(input: { bucket: string; key: string }): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error("Empty object body");
    }
    return Buffer.from(bytes);
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
