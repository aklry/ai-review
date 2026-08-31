import { Controller, Get } from '@nestjs/common';
import { healthResponseSchema } from '@interview-assistant/contracts';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return healthResponseSchema.parse(this.appService.getHealth());
  }
}
