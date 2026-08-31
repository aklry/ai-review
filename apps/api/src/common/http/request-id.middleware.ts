import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const requestIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId =
      incomingRequestId && requestIdPattern.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
