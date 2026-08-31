import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { createSuccessResponse, normalizeException } from './api-response.js';

describe('API response envelope', () => {
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
    expect(normalizeException(new Error('database password leaked'), requestId, timestamp)).toEqual({
      httpStatus: 500,
      body: {
        code: 500,
        message: 'Internal server error',
        data: null,
        requestId,
        timestamp,
      },
    });
  });
});
