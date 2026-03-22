import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { LogsService } from './logs.service';

@ApiTags('Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({ summary: 'List API logs (paginated, filterable)' })
  @ApiQuery({
    name: 'agent',
    required: false,
    description: 'Filter by agent ID',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    description: 'Filter by direction (inbound/outbound)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by HTTP status code',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max results (default 50)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination',
  })
  findAll(
    @Req() req: RequestWithUser,
    @Query('agent') agentId?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.logsService.findAll(req.user.id, {
      agentId,
      direction,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get log detail' })
  findOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.logsService.findOne(id, req.user.id);
  }
}
