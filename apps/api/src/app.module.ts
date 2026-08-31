import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from './common/http/request-id.middleware.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
