import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';

export type ResumeUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type ResumeExtension = 'pdf' | 'docx';

export type ResumeFileDescriptor = {
  extension: ResumeExtension;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
};

export type ParsedResume = ResumeFileDescriptor & {
  text: string;
  parserVersion: 'resume-parser-v1';
};

export type ResumeParser = {
  inspect(file: ResumeUploadFile): ResumeFileDescriptor;
  parse(file: ResumeUploadFile): Promise<ParsedResume>;
};

export type ResumeParserOptions = {
  pdfTextExtractor?: (buffer: Buffer) => Promise<string>;
  docxTextExtractor?: (buffer: Buffer) => Promise<string>;
};

export class ResumeParserError extends Error {
  constructor(
    readonly code:
      | 'unsupported_file_type'
      | 'legacy_doc_not_supported'
      | 'invalid_file_signature'
      | 'empty_resume_text'
      | 'resume_parse_failed',
    message: string,
    readonly userMessage = message,
  ) {
    super(userMessage);
    this.name = 'ResumeParserError';
    this.detail = message;
  }

  readonly detail: string;
}

@Injectable()
export class ResumeParserService implements ResumeParser {
  private readonly pdfTextExtractor: (buffer: Buffer) => Promise<string>;
  private readonly docxTextExtractor: (buffer: Buffer) => Promise<string>;

  constructor(options: ResumeParserOptions = {}) {
    this.pdfTextExtractor = options.pdfTextExtractor ?? extractPdfText;
    this.docxTextExtractor = options.docxTextExtractor ?? extractDocxText;
  }

  inspect(file: ResumeUploadFile): ResumeFileDescriptor {
    if (!file?.buffer?.byteLength) {
      throw new ResumeParserError(
        'unsupported_file_type',
        'Resume file is empty',
        '简历文件不能为空',
      );
    }

    const extension = extname(file.originalname).toLowerCase().replace('.', '');
    if (extension === 'doc') {
      throw new ResumeParserError(
        'legacy_doc_not_supported',
        'Legacy DOC files are not supported',
        '暂不支持旧版 DOC 文件，请另存为 DOCX 或 PDF 后重新上传',
      );
    }
    if (extension !== 'pdf' && extension !== 'docx') {
      throw new ResumeParserError(
        'unsupported_file_type',
        `Unsupported resume extension: ${extension || 'unknown'}`,
        '仅支持 PDF 或 DOCX 简历文件',
      );
    }

    const declaredMime = file.mimetype.trim().toLowerCase();
    const allowedMimes =
      extension === 'pdf'
        ? ['application/pdf', 'application/octet-stream', '']
        : [DOCX_MIME, 'application/octet-stream', 'application/zip', ''];
    if (!allowedMimes.includes(declaredMime)) {
      throw new ResumeParserError(
        'unsupported_file_type',
        `Unsupported resume MIME type: ${declaredMime || 'unknown'}`,
        '文件类型不受支持，请上传 PDF 或 DOCX 文件',
      );
    }

    if (extension === 'pdf' && !isPdfSignature(file.buffer)) {
      throw new ResumeParserError(
        'invalid_file_signature',
        'PDF file signature does not match its extension',
        '文件格式与扩展名不一致，请重新导出 PDF 后上传',
      );
    }
    if (extension === 'docx' && !isZipSignature(file.buffer)) {
      throw new ResumeParserError(
        'invalid_file_signature',
        'DOCX file signature does not match its extension',
        '文件格式与扩展名不一致，请重新导出 DOCX 后上传',
      );
    }

    return {
      extension,
      mimeType: extension === 'pdf' ? 'application/pdf' : DOCX_MIME,
      originalName: file.originalname,
      sizeBytes: file.size || file.buffer.byteLength,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async parse(file: ResumeUploadFile): Promise<ParsedResume> {
    const descriptor = this.inspect(file);

    try {
      const extractedText =
        descriptor.extension === 'pdf'
          ? await this.pdfTextExtractor(file.buffer)
          : await this.docxTextExtractor(file.buffer);
      const text = normalizeExtractedText(extractedText);

      if (text.length < 20) {
        throw new ResumeParserError(
          'empty_resume_text',
          'Resume did not contain enough extractable text',
          '文件中没有足够的可识别文本；扫描 PDF 请先启用 OCR 或上传文本型 PDF',
        );
      }

      return {
        ...descriptor,
        text,
        parserVersion: 'resume-parser-v1',
      };
    } catch (error) {
      if (error instanceof ResumeParserError) throw error;
      const detail = error instanceof Error ? error.message : 'unknown parser error';
      throw new ResumeParserError(
        'resume_parse_failed',
        `Resume parser failed: ${detail}`,
        '简历解析失败，请确认文件未损坏后重试',
      );
    }
  }
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ');
      pages.push(pageText);
    }
    return pages.join('\n');
  } finally {
    await document.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('DOCX document.xml is missing');
  }

  const xml = await documentFile.async('text');
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_match, entity: 'amp' | 'lt' | 'gt' | 'quot' | 'apos') =>
        ({
          amp: '&',
          lt: '<',
          gt: '>',
          quot: '"',
          apos: "'",
        })[entity],
    );
}

function isPdfSignature(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isZipSignature(buffer: Buffer): boolean {
  return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}
