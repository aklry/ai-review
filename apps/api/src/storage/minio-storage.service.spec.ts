import { describe, expect, it, vi } from 'vitest';
import { MinioStorageService, type StorageClient } from './minio-storage.service.js';

describe('MinioStorageService', () => {
  it('writes objects to the configured private bucket', async () => {
    const client: StorageClient = {
      send: vi.fn(async () => undefined),
    };
    const storage = new MinioStorageService({
      client,
      bucket: 'interview-resumes',
      ensureBucket: false,
    });

    await storage.putObject({
      key: 'users/local-user/resume-documents/doc_1/original.pdf',
      body: Buffer.from('resume'),
      contentType: 'application/pdf',
    });

    const command = vi.mocked(client.send).mock.calls[0]?.[0] as {
      input: Record<string, unknown>;
    };
    expect(command.input).toMatchObject({
      Bucket: 'interview-resumes',
      Key: 'users/local-user/resume-documents/doc_1/original.pdf',
      ContentType: 'application/pdf',
    });
    expect(command.input.Body).toEqual(Buffer.from('resume'));
  });

  it('deletes an uploaded object when a later step fails', async () => {
    const client: StorageClient = {
      send: vi.fn(async () => undefined),
    };
    const storage = new MinioStorageService({
      client,
      bucket: 'interview-resumes',
      ensureBucket: false,
    });

    await storage.deleteObject('users/local-user/resume-documents/doc_1/original.pdf');

    const command = vi.mocked(client.send).mock.calls[0]?.[0] as {
      input: Record<string, unknown>;
    };
    expect(command.input).toEqual({
      Bucket: 'interview-resumes',
      Key: 'users/local-user/resume-documents/doc_1/original.pdf',
    });
  });
});
