import { Injectable } from '@nestjs/common';
import type { UploadedProfile } from '@interview-assistant/contracts';
import { PrismaClient } from '../generated/prisma/client.js';

export type ResumeDocumentCreateInput = {
  id: string;
  userKey: string;
  bucket: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  extension: 'pdf' | 'docx';
  sizeBytes: number;
  sha256: string;
  parserVersion: string;
  parseStatus: 'parsing';
};

@Injectable()
export class ResumeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findParsedByHash(userKey: string, sha256: string) {
    return this.prisma.resumeDocument.findFirst({
      where: { userKey, sha256, parseStatus: 'parsed' },
      include: { profile: true },
    });
  }

  createDocument(input: ResumeDocumentCreateInput) {
    return this.prisma.resumeDocument.create({
      data: input,
    });
  }

  markFailed(documentId: string, parseError: string) {
    return this.prisma.resumeDocument.update({
      where: { id: documentId },
      data: {
        parseStatus: 'failed',
        parseError: parseError.slice(0, 500),
      },
    });
  }

  async createProfileFromDocument(input: {
    documentId: string;
    displayName?: string;
    resumeText: string;
    parserVersion: string;
  }): Promise<UploadedProfile> {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.candidateProfile.create({
        data: {
          userKey: 'local-user',
          resumeText: input.resumeText,
          resumeSource: 'file',
          ...(input.displayName ? { displayName: input.displayName } : {}),
        },
      });
      const document = await tx.resumeDocument.update({
        where: { id: input.documentId },
        data: {
          profileId: profile.id,
          parseStatus: 'parsed',
          parserVersion: input.parserVersion,
          extractedChars: input.resumeText.length,
          parsedAt: new Date(),
        },
      });

      return {
        id: profile.id,
        resumeText: profile.resumeText,
        displayName: profile.displayName,
        resumeSource: 'file',
        resumeDocument: {
          id: document.id,
          originalName: document.originalName,
          mimeType: document.mimeType,
          extension: document.extension as 'pdf' | 'docx',
          sizeBytes: document.sizeBytes,
          sha256: document.sha256,
          parseStatus: 'parsed',
          extractedChars: document.extractedChars,
        },
      };
    });
  }
}
