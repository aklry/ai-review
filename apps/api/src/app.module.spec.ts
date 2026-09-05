import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { DeepSeekProvider } from './deepseek/deepseek.provider.js';
import { InterviewModule } from './interview/interview.module.js';
import { InterviewService } from './interview/interview.service.js';

describe('AppModule', () => {
  it('registers DeepSeekProvider through a factory because its constructor takes options', () => {
    const providers = Reflect.getMetadata('providers', InterviewModule) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: DeepSeekProvider,
          useFactory: expect.any(Function),
        }),
      ]),
    );
  });

  it('resolves the DeepSeek provider and interview service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(DeepSeekProvider)).toBeInstanceOf(DeepSeekProvider);
    expect(moduleRef.get(InterviewService)).toBeInstanceOf(InterviewService);
  });
});
