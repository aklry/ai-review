import { BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { createSuccessResponse, normalizeException } from './api-response.js';
import { Prisma } from '../../generated/prisma/client.js';

describe('API response envelope', () => {
  it('returns 404 for Prisma missing records so saved-session recovery can discard stale IDs', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Record missing: private query context',
      { code: 'P2025', clientVersion: '7.10.0' },
    );
    const normalized = normalizeException(error, 'recovery-request');
    expect(normalized.httpStatus).toBe(404);
    expect(normalized.body.code).toBe(404);
    expect(normalized.body.message).not.toContain('private query context');
  });
  const timestamp = '2026-08-25T00:00:00.000Z';
  const requestId = 'req_123';

  it('wraps successful data with correlation metadata', () => {
    expect(createSuccessResponse({ ready: true }, requestId, timestamp)).toEqual({
      code: 0,
      message: 'ok',
      data: { ready: true },
      requestId,
      timestamp,
    });
  });

  it('normalizes a validation exception without exposing framework payloads', () => {
    expect(
      normalizeException(
        new BadRequestException({ message: ['email must be an email'] }),
        requestId,
        timestamp,
      ),
    ).toEqual({
      httpStatus: 400,
      body: {
        code: 400,
        message: 'email must be an email',
        data: null,
        requestId,
        timestamp,
      },
    });
  });

  it('hides unexpected exception details behind a generic message', () => {
    expect(normalizeException(new Error('database password leaked'), requestId, timestamp)).toEqual(
      {
        httpStatus: 500,
        body: {
          code: 500,
          message: 'Internal server error',
          data: null,
          requestId,
          timestamp,
        },
      },
    );
  });

  it('normalizes multipart size errors as a user-actionable bad request', () => {
    expect(
      normalizeException(
        Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' }),
        requestId,
        timestamp,
      ),
    ).toEqual({
      httpStatus: 400,
      body: {
        code: 400,
        message: '简历文件不能超过 10 MB',
        data: null,
        requestId,
        timestamp,
      },
    });
  });

  it('normalizes gateway timeout errors as a retryable response', () => {
    expect(
      normalizeException(
        new GatewayTimeoutException('DeepSeek generation timed out'),
        requestId,
        timestamp,
      ),
    ).toEqual({
      httpStatus: 504,
      body: {
        code: 504,
        message: 'DeepSeek generation timed out',
        data: null,
        requestId,
        timestamp,
      },
    });
  });
});
