import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { createSuccessResponse } from './api-response.js';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.requestId ?? randomUUID();

    return next.handle().pipe(map((data: unknown) => createSuccessResponse(data, requestId)));
  }
}
