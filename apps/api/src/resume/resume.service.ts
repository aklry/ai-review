import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ResumeParserError,
  type ParsedResume,
  type ResumeParser,
  type ResumeUploadFile,
} from './resume-parser.service.js';
import type { ResumeDocumentCreateInput } from './resume.repository.js';
import type { ResumeStorage } from '../storage/minio-storage.service.js';
import type { UploadedProfile as ContractUploadedProfile } from '@interview-assistant/contracts';

export type UploadedProfile = ContractUploadedProfile;

export const RESUME_REPOSITORY = Symbol('RESUME_REPOSITORY');
export const RESUME_STORAGE = Symbol('RESUME_STORAGE');
export const RESUME_PARSER = Symbol('RESUME_PARSER');

export type ResumeRepository = {
  findParsedByHash(
    userKey: string,
    sha256: string,
  ): Promise<{
    id: string;
    bucket: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    extension: 'pdf' | 'docx';
    sizeBytes: number;
    sha256: string;
    parseStatus: 'parsed';
    extractedChars: number;
    profile: {
      id: string;
      resumeText: string;
      displayName: string | null;
      resumeSource: string;
    } | null;
  } | null>;
  createDocument(input: ResumeDocumentCreateInput): Promise<{ id: string }>;
  markFailed(documentId: string, parseError: string): Promise<unknown>;
  createProfileFromDocument(input: {
    documentId: string;
    displayName?: string;
    resumeText: string;
    parserVersion: string;
  }): Promise<UploadedProfile>;
};

@Injectable()
export class ResumeService {
  constructor(
    @Inject(RESUME_REPOSITORY)
    private readonly repository: ResumeRepository,
    @Inject(RESUME_STORAGE)
    private readonly storage: ResumeStorage,
    @Inject(RESUME_PARSER)
    private readonly parser: ResumeParser,
  ) {}

  async uploadResume(
    file: ResumeUploadFile | undefined,
    displayName?: string,
  ): Promise<UploadedProfile> {
    if (!file) {
      throw new BadRequestException('请先选择简历文件');
    }

    const maxBytes = getMaxResumeBytes();
    if (file.size > maxBytes || file.buffer.byteLength > maxBytes) {
      throw new BadRequestException(`简历文件不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }

    const descriptor = this.parser.inspect(file);
    const existing = await this.repository.findParsedByHash('local-user', descriptor.sha256);
    const existingProfile = existing?.profile;
    if (existing && existingProfile) {
      return toUploadedProfile({ ...existing, profile: existingProfile });
    }

    const generatedDocumentId: string = randomUUID();
    const objectKey = `users/local-user/resume-documents/${generatedDocumentId}/original.${descriptor.extension}`;

    try {
      await this.storage.putObject({
        key: objectKey,
        body: file.buffer,
        contentType: descriptor.mimeType,
      });
    } catch {
      throw new InternalServerErrorException('简历文件存储失败，请稍后重试');
    }

    let documentId: string = generatedDocumentId;
    try {
      const document = await this.repository.createDocument({
        id: generatedDocumentId,
        userKey: 'local-user',
        bucket: this.storage.bucket,
        objectKey,
        originalName: descriptor.originalName,
        mimeType: descriptor.mimeType,
        extension: descriptor.extension,
        sizeBytes: descriptor.sizeBytes,
        sha256: descriptor.sha256,
        parserVersion: 'resume-parser-v1',
        parseStatus: 'parsing',
      } satisfies ResumeDocumentCreateInput);
      documentId = document.id;
    } catch {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw new InternalServerErrorException('简历文件存储失败，请稍后重试');
    }

    let parsed: ParsedResume;
    try {
      parsed = await this.parser.parse(file);
    } catch (error) {
      await this.repository.markFailed(documentId, getErrorMessage(error));
      if (error instanceof ResumeParserError) {
        throw new BadRequestException(error.userMessage);
      }
      throw new BadRequestException('简历解析失败，请确认文件未损坏后重试');
    }

    try {
      return await this.repository.createProfileFromDocument({
        documentId,
        ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
        resumeText: parsed.text,
        parserVersion: parsed.parserVersion,
      });
    } catch {
      await this.repository.markFailed(documentId, 'Failed to persist parsed resume profile');
      throw new InternalServerErrorException('简历档案保存失败，请稍后重试');
    }
  }
}

function toUploadedProfile(document: {
  id: string;
  originalName: string;
  mimeType: string;
  extension: 'pdf' | 'docx';
  sizeBytes: number;
  sha256: string;
  parseStatus: 'parsed';
  extractedChars: number;
  profile: {
    id: string;
    resumeText: string;
    displayName: string | null;
    resumeSource: string;
  };
}): UploadedProfile {
  return {
    id: document.profile.id,
    resumeText: document.profile.resumeText,
    displayName: document.profile.displayName,
    resumeSource: document.profile.resumeSource === 'file' ? 'file' : 'text',
    resumeDocument: {
      id: document.id,
      originalName: document.originalName,
      mimeType: document.mimeType,
      extension: document.extension,
      sizeBytes: document.sizeBytes,
      sha256: document.sha256,
      parseStatus: document.parseStatus,
      extractedChars: document.extractedChars,
    },
  };
}

function getMaxResumeBytes(): number {
  const configuredMb = Number(process.env.RESUME_MAX_FILE_MB ?? 10);
  const maxMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 10;
  return Math.floor(maxMb * 1024 * 1024);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ResumeParserError) return error.detail;
  return error instanceof Error ? error.message : 'Unknown resume parser error';
}
