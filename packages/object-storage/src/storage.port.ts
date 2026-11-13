export type ObjectHead = {
  bucket: string;
  key: string;
  contentLength: number;
  etag?: string;
  contentType?: string;
  sha256?: string;
  serverSideEncryption?: string;
};

export class ObjectAlreadyExistsError extends Error {
  readonly bucket: string;
  readonly key: string;

  constructor(bucket: string, key: string) {
    super(`Object already exists: ${bucket}/${key}`);
    this.name = "ObjectAlreadyExistsError";
    this.bucket = bucket;
    this.key = key;
  }
}

export abstract class ObjectStoragePort {
  /**
   * Writes an object. When `overwrite` is false (default true for backwards
   * compatibility), fails with `ObjectAlreadyExistsError` if the key exists.
   */
  abstract putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType?: string;
    overwrite?: boolean;
    contentSha256Hex?: string;
  }): Promise<void>;

  abstract getObjectBuffer(input: {
    bucket: string;
    key: string;
    expectedSha256Hex?: string;
  }): Promise<Buffer>;

  abstract headObject(input: { bucket: string; key: string }): Promise<ObjectHead>;

  abstract copyObject(input: {
    sourceBucket: string;
    sourceKey: string;
    destinationBucket: string;
    destinationKey: string;
  }): Promise<void>;

  abstract deleteObject(input: { bucket: string; key: string }): Promise<void>;

  abstract presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
