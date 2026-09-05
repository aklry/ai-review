import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

export type StorageClient = {
  send(command: unknown): Promise<unknown>;
};

export type ResumeStorage = {
  readonly bucket: string;
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  deleteObject(key: string): Promise<void>;
};

export type MinioStorageOptions = {
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
  useSsl?: boolean;
  client?: StorageClient;
  ensureBucket?: boolean;
};

@Injectable()
export class MinioStorageService implements ResumeStorage {
  readonly bucket: string;

  private readonly client: StorageClient;
  private readonly ensureBucketEnabled: boolean;
  private bucketReady: Promise<void> | null = null;

  constructor(options: MinioStorageOptions = {}) {
    const endpoint =
      options.endpoint ??
      process.env.MINIO_ENDPOINT ??
      process.env.S3_ENDPOINT ??
      'http://localhost:9000';
    const accessKey =
      options.accessKey ?? process.env.MINIO_ACCESS_KEY ?? process.env.S3_ACCESS_KEY ?? 'interview';
    const secretKey =
      options.secretKey ??
      process.env.MINIO_SECRET_KEY ??
      process.env.S3_SECRET_KEY ??
      'interview_dev_only';

    this.bucket =
      options.bucket ??
      process.env.MINIO_BUCKET_RESUMES ??
      process.env.S3_BUCKET ??
      'interview-resumes';
    this.ensureBucketEnabled = options.ensureBucket ?? true;
    this.client =
      options.client ??
      (new S3Client({
        endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
        tls: options.useSsl ?? process.env.MINIO_USE_SSL === 'true',
      }) as unknown as StorageClient);
  }

  async putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.byteLength,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  private async ensureBucket(): Promise<void> {
    if (!this.ensureBucketEnabled) return;

    this.bucketReady ??= this.createBucketIfMissing();
    await this.bucketReady;
  }

  private async createBucketIfMissing(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        if (!isBucketAlreadyOwned(error)) throw error;
      }
    }
  }
}

function isBucketAlreadyOwned(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: unknown; Code?: unknown };
  return (
    candidate.name === 'BucketAlreadyOwnedByYou' ||
    candidate.name === 'BucketAlreadyExists' ||
    candidate.Code === 'BucketAlreadyOwnedByYou' ||
    candidate.Code === 'BucketAlreadyExists'
  );
}
