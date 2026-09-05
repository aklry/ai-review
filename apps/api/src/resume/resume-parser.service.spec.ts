import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { ResumeParserService, type ResumeUploadFile } from './resume-parser.service.js';

function file(overrides: Partial<ResumeUploadFile> = {}): ResumeUploadFile {
  return {
    buffer: Buffer.from('%PDF-1.7'),
    originalname: 'resume.pdf',
    mimetype: 'application/pdf',
    size: 8,
    ...overrides,
  };
}

function createMinimalPdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

describe('ResumeParserService', () => {
  it('extracts and normalizes text from a PDF', async () => {
    const parser = new ResumeParserService({
      pdfTextExtractor: vi.fn(async () => ' Ada  \n\n Frontend   Engineer '),
    });

    await expect(parser.parse(file())).resolves.toMatchObject({
      extension: 'pdf',
      mimeType: 'application/pdf',
      text: 'Ada\nFrontend Engineer',
      parserVersion: 'resume-parser-v1',
    });
  });

  it('extracts text from a text PDF with the default PDF.js parser', async () => {
    const buffer = createMinimalPdf('Ada Lovelace frontend engineer');

    await expect(
      new ResumeParserService().parse(
        file({
          buffer,
          originalname: 'resume.pdf',
          mimetype: 'application/pdf',
          size: buffer.byteLength,
        }),
      ),
    ).resolves.toMatchObject({
      extension: 'pdf',
      text: expect.stringContaining('Ada Lovelace frontend engineer'),
    });
  }, 60000);

  it('extracts DOCX text through the injected document extractor', async () => {
    const parser = new ResumeParserService({
      docxTextExtractor: vi.fn(async () => 'Ada Lovelace\nAI platform engineer'),
    });

    await expect(
      parser.parse(
        file({
          buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
          originalname: 'resume.docx',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 4,
        }),
      ),
    ).resolves.toMatchObject({
      extension: 'docx',
      text: 'Ada Lovelace\nAI platform engineer',
    });
  });

  it('extracts text from a real DOCX document.xml payload', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<w:document><w:body><w:p><w:r><w:t>Ada &amp; AI platform</w:t></w:r></w:p><w:p><w:r><w:t>Engineer</w:t></w:r></w:p></w:body></w:document>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(
      new ResumeParserService().parse(
        file({
          buffer,
          originalname: 'resume.docx',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: buffer.byteLength,
        }),
      ),
    ).resolves.toMatchObject({
      text: 'Ada & AI platform\nEngineer',
      extension: 'docx',
    });
  });

  it('rejects legacy DOC files with an actionable error', async () => {
    const parser = new ResumeParserService();

    await expect(
      parser.parse(
        file({
          buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
          originalname: 'resume.doc',
          mimetype: 'application/msword',
        }),
      ),
    ).rejects.toThrow(/DOCX|PDF/);
  });

  it('rejects a file whose signature does not match its extension', async () => {
    const parser = new ResumeParserService();

    await expect(
      parser.parse(
        file({
          buffer: Buffer.from('not a pdf'),
        }),
      ),
    ).rejects.toThrow(/文件格式|file/i);
  });

  it('rejects a non-document MIME type even when the extension is allowed', async () => {
    const parser = new ResumeParserService();

    await expect(
      parser.parse(
        file({
          mimetype: 'text/plain',
        }),
      ),
    ).rejects.toThrow(/类型|MIME/i);
  });

  it('rejects a document when no usable text can be extracted', async () => {
    const parser = new ResumeParserService({
      pdfTextExtractor: vi.fn(async () => ' \n\t '),
    });

    await expect(parser.parse(file())).rejects.toThrow(/文本|OCR/i);
  });
});
