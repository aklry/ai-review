import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiResponse } from '@interview-assistant/contracts';

export type ApiErrorResponse = ApiResponse<null>;

export type NormalizedException = {
  httpStatus: number;
  body: ApiErrorResponse;
};

export function createSuccessResponse<T>(
  data: T,
  requestId: string,
  timestamp = new Date().toISOString(),
): ApiResponse<T> {
  return {
    code: 0,
    message: 'ok',
    data,
    requestId,
    timestamp,
  };
}

export function normalizeException(
  exception: unknown,
  requestId: string,
  timestamp = new Date().toISOString(),
): NormalizedException {
  if (exception instanceof HttpException) {
    const httpStatus = exception.getStatus();
    return {
      httpStatus,
      body: {
        code: httpStatus,
        message: getHttpExceptionMessage(exception),
        data: null,
        requestId,
        timestamp,
      },
    };
  }

  return {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      data: null,
      requestId,
      timestamp,
    },
  };
}

function getHttpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;

  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = response.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter(isString).join('; ') || 'Request failed';
  }

  return 'Request failed';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
