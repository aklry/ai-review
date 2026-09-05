import { describe, expect, it, vi } from 'vitest';
import { ResumeService, type ResumeRepository, type UploadedProfile } from './resume.service.js';
import type {
  ResumeFileDescriptor,
  ResumeParser,
  ResumeUploadFile,
} from './resume-parser.service.js';
import type { ResumeStorage } from '../storage/minio-storage.service.js';

const upload: ResumeUploadFile = {
  buffer: Buffer.from('%PDF-1.7 resume'),
  originalname: 'Ada Resume.pdf',
  mimetype: 'application/pdf',
  size: 16,
};

const descriptor: ResumeFileDescriptor = {
  extension: 'pdf',
  mimeType: 'application/pdf',
  originalName: upload.originalname,
  sizeBytes: upload.size,
  sha256: 'sha256-value',
};

const profile: UploadedProfile = {
  id: 'profile_1',
  resumeText: 'Ada Lovelace frontend and AI experience.',
  displayName: 'Ada',
  resumeSource: 'file',
  resumeDocument: {
    id: 'document_1',
    originalName: upload.originalname,
    mimeType: 'application/pdf',
    extension: 'pdf',
    sizeBytes: upload.size,
    sha256: descriptor.sha256,
    parseStatus: 'parsed',
    extractedChars: 43,
  },
};

function createDependencies() {
  const repository: ResumeRepository = {
    findParsedByHash: vi.fn(async () => null),
    createDocument: vi.fn(async () => ({ id: 'document_1' })),
    markFailed: vi.fn(async () => undefined),
    createProfileFromDocument: vi.fn(async () => profile),
  };
  const storage: ResumeStorage = {
    bucket: 'interview-resumes',
    putObject: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined),
  };
  const parser: ResumeParser = {
    inspect: vi.fn(() => descriptor),
    parse: vi.fn(async () => ({
      ...descriptor,
      text: profile.resumeText,
      parserVersion: 'resume-parser-v1' as const,
    })),
  };
  return { repository, storage, parser };
}

describe('ResumeService', () => {
  it('stores the original file and creates a profile from extracted text', async () => {
    const dependencies = createDependencies();
    const service = new ResumeService(
      dependencies.repository,
      dependencies.storage,
      dependencies.parser,
    );

    await expect(service.uploadResume(upload, 'Ada')).resolves.toEqual(profile);
    expect(dependencies.storage.putObject).toHaveBeenCalledWith({
      key: expect.stringMatching(/^users\/local-user\/resume-documents\/.+\/original\.pdf$/),
      body: upload.buffer,
      contentType: 'application/pdf',
    });
    expect(dependencies.repository.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        objectKey: expect.stringMatching(/original\.pdf$/),
        parseStatus: 'parsing',
        originalName: upload.originalname,
      }),
    );
    expect(dependencies.repository.createProfileFromDocument).toHaveBeenCalledWith({
      documentId: 'document_1',
      displayName: 'Ada',
      resumeText: profile.resumeText,
      parserVersion: 'resume-parser-v1',
    });
  });

  it('reuses a parsed profile for the same file hash without uploading or parsing again', async () => {
    const dependencies = createDependencies();
    dependencies.repository.findParsedByHash = vi.fn(async () => ({
      id: 'document_existing',
      bucket: 'interview-resumes',
      objectKey: 'users/local-user/resume-documents/document_existing/original.pdf',
      originalName: 'old-name.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf' as const,
      sizeBytes: upload.size,
      sha256: descriptor.sha256,
      parseStatus: 'parsed' as const,
      extractedChars: profile.resumeText.length,
      profile: {
        id: 'profile_existing',
        resumeText: profile.resumeText,
        displayName: 'Existing',
        resumeSource: 'file',
      },
    }));
    const service = new ResumeService(
      dependencies.repository,
      dependencies.storage,
      dependencies.parser,
    );

    await expect(service.uploadResume(upload, 'New name')).resolves.toMatchObject({
      id: 'profile_existing',
      resumeText: profile.resumeText,
      resumeDocument: { id: 'document_existing', sha256: descriptor.sha256 },
    });
    expect(dependencies.storage.putObject).not.toHaveBeenCalled();
    expect(dependencies.parser.parse).not.toHaveBeenCalled();
    expect(dependencies.repository.createDocument).not.toHaveBeenCalled();
  });

  it('marks the document failed when parsing fails without deleting the original', async () => {
    const dependencies = createDependencies();
    dependencies.parser.parse = vi.fn(async () => {
      throw new Error('corrupt document');
    });
    const service = new ResumeService(
      dependencies.repository,
      dependencies.storage,
      dependencies.parser,
    );

    await expect(service.uploadResume(upload)).rejects.toThrow(/解析/);
    expect(dependencies.repository.markFailed).toHaveBeenCalledWith(
      'document_1',
      expect.stringContaining('corrupt document'),
    );
    expect(dependencies.storage.deleteObject).not.toHaveBeenCalled();
  });

  it('cleans up the object when the document record cannot be created', async () => {
    const dependencies = createDependencies();
    dependencies.repository.createDocument = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const service = new ResumeService(
      dependencies.repository,
      dependencies.storage,
      dependencies.parser,
    );

    await expect(service.uploadResume(upload)).rejects.toThrow(/存储|上传|失败/);
    expect(dependencies.storage.deleteObject).toHaveBeenCalledWith(
      expect.stringMatching(/original\.pdf$/),
    );
  });
});
