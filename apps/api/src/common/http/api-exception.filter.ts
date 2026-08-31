import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { normalizeException } from './api-response.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const normalized = normalizeException(exception, requestId);

    response.status(normalized.httpStatus).json(normalized.body);
  }
}
