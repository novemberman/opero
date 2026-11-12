export type ObjectHead = {
  bucket: string;
  key: string;
  contentLength: number;
  etag?: string;
  contentType?: string;
};

export abstract class ObjectStoragePort {
  abstract putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType?: string;
  }): Promise<void>;

  abstract getObjectBuffer(input: { bucket: string; key: string }): Promise<Buffer>;

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
