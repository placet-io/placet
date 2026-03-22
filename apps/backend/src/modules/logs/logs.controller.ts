import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ApiLogResponse,
  ErrorResponse,
  PaginatedLogsResponse,
} from '../../common/swagger-responses';
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
  @ApiOkResponse({
    description: 'Paginated API logs',
    type: PaginatedLogsResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
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
  @ApiOkResponse({ description: 'Log entry details', type: ApiLogResponse })
  @ApiNotFoundResponse({ description: 'Log not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  findOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.logsService.findOne(id, req.user.id);
  }
}
