import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('error-test')
  @ApiOperation({ summary: 'Test error handling' })
  getError(): string {
    const { UnauthenticatedError } = require('./common/errors/domain-errors');
    throw new UnauthenticatedError('Test unauthenticated error', 'Some extra cause info');
  }
}
