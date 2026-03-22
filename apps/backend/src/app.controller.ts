import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponse } from './common/swagger-responses';
import { AppService } from './app.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint for Docker/load balancer' })
  @ApiOkResponse({ description: 'Service is healthy', type: HealthResponse })
  getHealth() {
    return this.appService.getHealth();
  }
}
