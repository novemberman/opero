import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

export async function ensureBuckets(input: {
  clientConfig: S3ClientConfig;
  buckets: string[];
}): Promise<void> {
  const client = new S3Client(input.clientConfig);
  for (const bucket of input.buckets) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }
}
