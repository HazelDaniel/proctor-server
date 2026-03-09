import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(private readonly appService: AppService) {
    this.logger.log('AppController initialized');
  }

  @Get()
  @ApiOperation({ summary: 'Health check' })
  getHello(): string {
    this.logger.log('Handling health check request');
    return this.appService.getHello();
  }

  @Get('error-test')
  @ApiOperation({ summary: 'Test error handling' })
  getError(): string {
    const { UnauthenticatedError } = require('./common/errors/domain-errors');
    throw new UnauthenticatedError('Test unauthenticated error', 'Some extra cause info');
  }
}
